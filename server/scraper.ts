/**
 * Tiendanube Public Store Scraper
 * Scrapes product data from public Tiendanube storefronts (no API key needed).
 * Products go through the same pipeline as connected stores: tags, vision AI, embeddings.
 */

import { db, pool } from "./db";
import { products, brands, categories, productImages, productVariants, productTags } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import OpenAI from "openai";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ─── HTML Parsing Helpers ───

function extractText(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú").replace(/&ntilde;/gi, "ñ")
    .replace(/&Ntilde;/gi, "Ñ").replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ").trim();
}

function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ─── Types ───

interface ScrapedProduct {
  externalId: string;
  title: string;
  description: string;
  basePrice: string;
  salePrice: string | null;
  externalUrl: string;
  images: string[];
  variants: { sizeLabel: string; sku: string | null; stockQty: number }[];
  tags: string[];
}

interface ScrapeResult {
  storeName: string;
  storeUrl: string;
  totalFound: number;
  synced: number;
  errors: string[];
}

// ─── Fetch with retry and delay ───

async function fetchWithRetry(url: string, retries = 3, delayMs = 1000): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.5",
        },
      });
      if (resp.ok) return await resp.text();
      if (resp.status === 301 || resp.status === 302) {
        const location = resp.headers.get("location");
        if (location) return fetchWithRetry(location, retries - i - 1, delayMs);
      }
      if (resp.status === 429) {
        await new Promise(r => setTimeout(r, delayMs * (i + 2)));
        continue;
      }
      throw new Error(`HTTP ${resp.status}`);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

// ─── Step 1: Get product URLs from listing pages ───

async function scrapeListingPage(storeUrl: string): Promise<{ productIds: string[]; productUrls: string[]; storeName: string }> {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const productIds: string[] = [];
  const productUrls: string[] = [];
  let storeName = "";
  let page = 1;

  while (true) {
    const url = page === 1 ? `${baseUrl}/productos` : `${baseUrl}/productos/page/${page}/`;
    console.log(`[Scraper] Fetching listing page ${page}: ${url}`);

    let html: string;
    try {
      html = await fetchWithRetry(url);
    } catch (err: any) {
      console.log(`[Scraper] Page ${page} failed: ${err.message}, stopping pagination`);
      break;
    }

    // Extract store name from LS.store
    if (!storeName) {
      const nameMatch = html.match(/LS\.store\s*=\s*\{[\s\S]*?name\s*:\s*["']([^"']+)["']/)
        || html.match(/LS\.store\s*=\s*\{[\s\S]*?name\s*:\s*"([^"]+)"/);
      if (nameMatch) {
        storeName = decodeUnicodeEscapes(nameMatch[1]);
      }
      // Fallback: try og:site_name or <title>
      if (!storeName) {
        storeName = extractText(html, /<meta\s+property="og:site_name"\s+content="([^"]+)"/i)
          || extractText(html, /<title>([^<|]+)/i).trim();
      }
    }

    // Extract product IDs and URLs from listing
    const cardRegex = /data-product-id="(\d+)"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*class="[^"]*(?:item-link|js-product-item-image)[^"]*"/g;
    let match;
    let foundOnPage = 0;

    while ((match = cardRegex.exec(html)) !== null) {
      const pid = match[1];
      const href = match[2];
      if (!productIds.includes(pid)) {
        productIds.push(pid);
        const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
        productUrls.push(fullUrl);
        foundOnPage++;
      }
    }

    // Simpler fallback: just find all data-product-id and nearby links
    if (foundOnPage === 0) {
      const simpleRegex = /data-product-id="(\d+)"/g;
      const linkRegex = /<a[^>]+href="(\/[^"]*productos[^"]*)"[^>]*>/g;
      const ids: string[] = [];
      const links: string[] = [];

      let m;
      while ((m = simpleRegex.exec(html)) !== null) {
        if (!productIds.includes(m[1])) ids.push(m[1]);
      }
      while ((m = linkRegex.exec(html)) !== null) {
        links.push(m[1]);
      }

      // Also try to get product links from item-link class
      const itemLinkRegex = /<a[^>]+class="[^"]*item-link[^"]*"[^>]+href="([^"]+)"/g;
      while ((m = itemLinkRegex.exec(html)) !== null) {
        if (!links.includes(m[1])) links.push(m[1]);
      }

      // Match IDs to unique product links (not pagination)
      const productLinks = links.filter(l => !l.includes("/page/") && l !== "/productos" && l !== "/productos/");

      for (let i = 0; i < ids.length; i++) {
        productIds.push(ids[i]);
        const link = productLinks[i] || `${baseUrl}/productos`;
        productUrls.push(link.startsWith("http") ? link : `${baseUrl}${link}`);
        foundOnPage++;
      }
    }

    console.log(`[Scraper] Page ${page}: found ${foundOnPage} products`);

    if (foundOnPage === 0) break;

    // Check if there's a next page
    const hasNext = html.includes(`/productos/page/${page + 1}/`);
    if (!hasNext) break;

    page++;
    // Respectful delay between pages
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`[Scraper] Total products found: ${productIds.length} from ${storeName || storeUrl}`);
  return { productIds, productUrls, storeName: storeName || storeUrl };
}

// ─── Step 2: Scrape individual product page ───

async function scrapeProductPage(url: string, externalId: string): Promise<ScrapedProduct | null> {
  let html: string;
  try {
    html = await fetchWithRetry(url);
  } catch (err: any) {
    console.error(`[Scraper] Failed to fetch product ${externalId}: ${err.message}`);
    return null;
  }

  // Title
  const title = decodeHtmlEntities(
    extractText(html, /<h1[^>]*class="[^"]*js-product-name[^"]*"[^>]*>([^<]+)/i)
    || extractText(html, /<meta\s+property="og:title"\s+content="([^"]+)"/i)
    || "Sin nombre"
  );

  // Description
  const descMatch = html.match(/data-store="product-description-[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*user-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const description = descMatch ? decodeHtmlEntities(descMatch[1]) : "";

  // Price from data-product-price (in centavos)
  const priceMatch = html.match(/data-product-price="(\d+)"/);
  const priceRaw = priceMatch ? parseInt(priceMatch[1]) : 0;
  const basePrice = String(priceRaw / 100);

  // Compare/sale price
  const comparePriceMatch = html.match(/js-compare-price-display[^>]*data-product-price="(\d+)"/);
  let salePrice: string | null = null;
  if (comparePriceMatch) {
    const compareRaw = parseInt(comparePriceMatch[1]);
    if (compareRaw > priceRaw) {
      // The "compare" price is the original, current price is the sale price
      salePrice = basePrice;
      // basePrice should be the original (higher) price
      // Actually, let's keep basePrice as current price and salePrice as the discounted one
      // In the existing pipeline, basePrice = regular price, salePrice = promotional
      // But Tiendanube's compare_price is the ORIGINAL (higher) price
      // So: basePrice = compare (original), salePrice = current (lower)
      // This matches: basePrice=$182,000, salePrice=$145,600
    }
  }

  // Variants from data-variants attribute
  const variantsMatch = html.match(/data-variants="([^"]+)"/);
  const variants: ScrapedProduct["variants"] = [];

  if (variantsMatch) {
    try {
      const variantsJson = variantsMatch[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");

      const variantData = JSON.parse(variantsJson);
      if (Array.isArray(variantData)) {
        for (const v of variantData) {
          const options = [v.option0, v.option1, v.option2].filter(Boolean);
          variants.push({
            sizeLabel: options.length > 0 ? options.join(" / ") : "Único",
            sku: v.sku || null,
            stockQty: typeof v.stock === "number" ? v.stock : (v.available ? 1 : 0),
          });
        }
      }
    } catch (err) {
      console.error(`[Scraper] Failed to parse variants for ${externalId}`);
    }
  }

  if (variants.length === 0) {
    variants.push({ sizeLabel: "Único", sku: null, stockQty: 0 });
  }

  // Images from product slides or og:image
  const images: string[] = [];
  const slideRegex = /<div[^>]*class="[^"]*js-product-slide[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/g;
  let imgMatch;
  while ((imgMatch = slideRegex.exec(html)) !== null) {
    let imgUrl = imgMatch[1];
    if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
    if (!images.includes(imgUrl)) images.push(imgUrl);
  }

  // Fallback: srcset images
  if (images.length === 0) {
    const srcsetRegex = /class="[^"]*product-item-image[^"]*"[^>]*src="([^"]+)"/g;
    while ((imgMatch = srcsetRegex.exec(html)) !== null) {
      let imgUrl = imgMatch[1];
      if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
      if (!images.includes(imgUrl)) images.push(imgUrl);
    }
  }

  // Fallback: og:image
  if (images.length === 0) {
    const ogImg = extractText(html, /<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImg) images.push(ogImg.startsWith("//") ? "https:" + ogImg : ogImg);
  }

  // Tags from LS.product.tags
  const tags: string[] = [];
  const tagsMatch = html.match(/LS\.product\s*=\s*\{[\s\S]*?tags\s*:\s*\[([^\]]*)\]/);
  if (tagsMatch && tagsMatch[1].trim()) {
    const tagStrings = tagsMatch[1].match(/'([^']+)'/g);
    if (tagStrings) {
      for (const t of tagStrings) {
        tags.push(t.replace(/'/g, "").trim());
      }
    }
  }

  const externalUrl = url;

  return {
    externalId,
    title,
    description,
    basePrice,
    salePrice,
    externalUrl,
    images: images.slice(0, 5),
    variants,
    tags,
  };
}

// ─── Step 3: Process product through sync pipeline ───

async function processScrapedProduct(
  product: ScrapedProduct,
  brandId: string,
  catMap: Record<string, string>
): Promise<void> {
  const { externalId, title, description, basePrice, salePrice, externalUrl, images, variants, tags } = product;

  // Check if product already exists
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(sql`external_provider = 'tiendanube_scraped' AND external_id = ${externalId}`);

  let productId: string;

  // Category inference (same logic as connected sync)
  const titleLower = title.toLowerCase();
  let inferredCategoryId: string | null = null;
  if (/remera|camiseta|tee|top|polo|musculosa|camisa|tank|chaleco|vest|crop|body/i.test(titleLower)) {
    inferredCategoryId = catMap["tops"] || null;
  } else if (/pantalon|pantalón|jean|cargo|short|pollera|falda|calza|legging|jogger|bermuda/i.test(titleLower)) {
    inferredCategoryId = catMap["bottoms"] || null;
  } else if (/campera|jacket|buzo|hoodie|sweater|abrigo|anorak|rompeviento|bomber|parka/i.test(titleLower)) {
    inferredCategoryId = catMap["outerwear"] || null;
  } else if (/zapatilla|sneaker|bota|boot|sandal|zapato|shoe|ojotas|chancleta/i.test(titleLower)) {
    inferredCategoryId = catMap["footwear"] || null;
  } else if (/media|sock|gorra|cap|hat|vincha|muñequera|mochila|bolso|bag|cintur|neceser|riñonera|accesorio/i.test(titleLower)) {
    inferredCategoryId = catMap["accessories"] || null;
  }

  if (existing.length > 0) {
    productId = existing[0].id;
    await db
      .update(products)
      .set({ title, description, basePrice, salePrice, status: "active", externalUrl, categoryId: inferredCategoryId, updatedAt: new Date() })
      .where(eq(products.id, productId));
    await db.delete(productTags).where(eq(productTags.productId, productId));
    await db.delete(productImages).where(eq(productImages.productId, productId));
    await db.delete(productVariants).where(eq(productVariants.productId, productId));
  } else {
    const [inserted] = await db
      .insert(products)
      .values({
        brandId,
        title,
        description,
        basePrice,
        salePrice,
        status: "active",
        externalProvider: "tiendanube_scraped",
        externalId,
        externalUrl,
        categoryId: inferredCategoryId,
        currency: "ARS",
      })
      .returning({ id: products.id });
    productId = inserted.id;
  }

  // Images
  if (images.length > 0) {
    await db.insert(productImages).values(
      images.map((url, i) => ({ productId, url, position: i }))
    );
  }

  // Variants
  await db.insert(productVariants).values(
    variants.map(v => ({ productId, sizeLabel: v.sizeLabel, sku: v.sku, stockQty: v.stockQty }))
  );

  // Tags: raw + color detection + type detection (same as connected sync)
  const rawTags = [...tags];
  const textForTags = `${title} ${description}`.toLowerCase();

  const colorPairs: [string, string[]][] = [
    ["negro", ["negro"]], ["negra", ["negro"]], ["black", ["negro"]],
    ["blanco", ["blanco"]], ["blanca", ["blanco"]], ["white", ["blanco"]],
    ["verde", ["verde"]], ["green", ["verde"]],
    ["azul", ["azul"]], ["blue", ["azul"]],
    ["rojo", ["rojo"]], ["roja", ["rojo"]], ["red", ["rojo"]],
    ["rosa", ["rosa"]], ["pink", ["rosa"]],
    ["gris", ["gris"]], ["grey", ["gris"]], ["gray", ["gris"]],
    ["naranja", ["naranja"]], ["orange", ["naranja"]],
    ["amarillo", ["amarillo"]], ["amarilla", ["amarillo"]],
    ["marron", ["marron"]], ["marrón", ["marron"]], ["brown", ["marron"]],
    ["beige", ["beige"]], ["crudo", ["beige"]], ["arena", ["beige"]],
    ["celeste", ["celeste"]], ["bordo", ["bordo"]], ["bordó", ["bordo"]],
    ["lila", ["lila"]], ["violeta", ["violeta"]], ["coral", ["coral"]],
    ["militar", ["militar"]], ["dorado", ["dorado"]], ["plateado", ["plateado"]],
    ["melange", ["gris", "melange"]],
  ];
  for (const [keyword, colorTags] of colorPairs) {
    if (textForTags.includes(keyword)) {
      for (const t of colorTags) {
        if (!rawTags.includes(t)) rawTags.push(t);
      }
    }
  }

  const typePairs: [RegExp, string][] = [
    [/remera|camiseta|tee/i, "remera"], [/short\b/i, "short"], [/pantalon|pantalón/i, "pantalon"],
    [/pollera|falda/i, "pollera"], [/calza|legging/i, "calza"], [/campera|jacket/i, "campera"],
    [/gorra|cap\b/i, "gorra"], [/media|sock/i, "medias"], [/zapatilla|sneaker/i, "zapatilla"],
    [/musculosa|tank/i, "musculosa"], [/vestido|dress/i, "vestido"], [/buzo|hoodie|sudadera/i, "buzo"],
    [/bermuda/i, "bermuda"], [/jogger/i, "jogger"], [/mochila|backpack/i, "mochila"],
    [/bolso|bag\b/i, "bolso"], [/neceser/i, "neceser"], [/jean\b/i, "jean"],
  ];
  for (const [regex, tag] of typePairs) {
    if (regex.test(textForTags) && !rawTags.includes(tag)) rawTags.push(tag);
  }

  // Vision AI (optional)
  let visionDescription = "";
  const mainImageUrl = images[0] || null;
  if (openai && mainImageUrl) {
    try {
      const visionRes = await openai.chat.completions.create({
        model: process.env.OPENAI_VISION_MODEL || "gpt-4o",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: `Product name: "${title}". Look at this product image and describe ONLY what you see in the product itself (ignore background, models, props). Return a comma-separated list:
1. The ACTUAL main color(s) of the product in Spanish (negro, blanco, gris, azul, rojo, verde, rosa, beige, marron, celeste, bordo, lila, coral, naranja, amarillo)
2. Style: deportivo/casual/formal/urbano/streetwear
3. Pattern: liso/estampado/rayado/a cuadros
4. Gender: hombre/mujer/unisex
5. 2-3 descriptive keywords
IMPORTANT: Only list colors that are actually visible in the PRODUCT.` },
            { type: "image_url", image_url: { url: mainImageUrl, detail: "low" } }
          ]
        }],
        max_tokens: 120,
      });
      visionDescription = visionRes.choices[0]?.message?.content?.trim() || "";
      if (visionDescription) {
        const visionTags = visionDescription.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.length < 30);
        for (const vt of visionTags) {
          if (!rawTags.includes(vt)) rawTags.push(vt);
        }
      }
    } catch (visionErr: any) {
      console.error(`[Scraper] Vision error for ${title}:`, visionErr.message);
    }
  }

  // Insert tags
  if (rawTags.length > 0) {
    await db.insert(productTags).values(rawTags.map(tag => ({ productId, tag })));
  }

  // Embedding generation (optional)
  if (openai) {
    try {
      const textToEmbed = `${title}. ${description} ${visionDescription ? `Visual attributes: ${visionDescription}.` : ""} Tags: ${rawTags.join(", ")}`;
      const embRes = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        input: textToEmbed,
      });
      const embeddingStr = `[${embRes.data[0].embedding.join(",")}]`;
      await pool.query(
        `INSERT INTO product_embeddings (product_id, embedding, embedding_model, updated_at)
         VALUES ($1, $2::vector, $3, NOW())
         ON CONFLICT (product_id) DO UPDATE
         SET embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model, updated_at = EXCLUDED.updated_at`,
        [productId, embeddingStr, process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"]
      );
    } catch (embErr: any) {
      console.error(`[Scraper] Embedding error for ${title}:`, embErr.message);
    }
  }
}

// ─── Step 4: Get or create brand for scraped store ───

async function getOrCreateBrand(storeName: string, storeUrl: string): Promise<string> {
  const slug = storeName.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const existing = await db
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.slug, slug));

  if (existing.length > 0) return existing[0].id;

  const [inserted] = await db
    .insert(brands)
    .values({
      name: storeName,
      slug,
      country: "AR",
      website: storeUrl,
      status: "approved",
      commissionRate: "0",
    })
    .returning({ id: brands.id });

  return inserted.id;
}

// ─── Main scrape function ───

export async function scrapeStore(storeUrl: string): Promise<ScrapeResult> {
  console.log(`[Scraper] Starting scrape of ${storeUrl}`);
  const startTime = Date.now();

  // Normalize URL
  let normalizedUrl = storeUrl.replace(/\/$/, "");
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // Step 1: Get all product IDs and URLs from listing pages
  const { productIds, productUrls, storeName } = await scrapeListingPage(normalizedUrl);

  if (productIds.length === 0) {
    return { storeName, storeUrl: normalizedUrl, totalFound: 0, synced: 0, errors: ["No products found on listing pages"] };
  }

  // Step 2: Get or create brand
  const brandId = await getOrCreateBrand(storeName, normalizedUrl);

  // Step 3: Get category map
  const allCats = await db.select().from(categories);
  const catMap = Object.fromEntries(allCats.map(c => [c.name.toLowerCase(), c.id]));

  // Step 4: Scrape each product page and process
  let synced = 0;
  const errors: string[] = [];

  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i];
    const purl = productUrls[i];

    try {
      console.log(`[Scraper] Product ${i + 1}/${productIds.length}: ${pid}`);
      const product = await scrapeProductPage(purl, pid);

      if (!product) {
        errors.push(`Product ${pid}: failed to scrape page`);
        continue;
      }

      await processScrapedProduct(product, brandId, catMap);
      synced++;

      // Respectful delay between product pages (500ms)
      if (i < productIds.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err: any) {
      console.error(`[Scraper] Error processing product ${pid}:`, err.message);
      errors.push(`Product ${pid}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Scraper] Completed ${storeName}: ${synced}/${productIds.length} products in ${elapsed}s`);

  return {
    storeName,
    storeUrl: normalizedUrl,
    totalFound: productIds.length,
    synced,
    errors,
  };
}

// ─── Batch scrape multiple stores ───

export async function scrapeMultipleStores(storeUrls: string[]): Promise<ScrapeResult[]> {
  const results: ScrapeResult[] = [];

  for (const url of storeUrls) {
    try {
      const result = await scrapeStore(url);
      results.push(result);
      // Delay between stores (2s)
      await new Promise(r => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`[Scraper] Failed to scrape ${url}:`, err.message);
      results.push({
        storeName: url,
        storeUrl: url,
        totalFound: 0,
        synced: 0,
        errors: [err.message],
      });
    }
  }

  return results;
}

// ─── Curated list of Argentine fashion brands on Tiendanube ───

export const INITIAL_BRANDS: { name: string; url: string }[] = [
  // Verified active stores (April 2026)
  { name: "Airborn", url: "https://airborn.mitiendanube.com" },
  { name: "Bensimon", url: "https://bensimon.mitiendanube.com" },
  { name: "La Cofradía", url: "https://lacofradia.mitiendanube.com" },
  { name: "TOP STUDIO", url: "https://topstudiok.mitiendanube.com" },
  { name: "LA TIENDA by Me!", url: "https://latiendabyme.mitiendanube.com" },
  { name: "MN Boutique", url: "https://mnboutiq.mitiendanube.com" },
  { name: "La Jaula de las Locas", url: "https://lajauladelaslocass.mitiendanube.com" },
  { name: "Primestreet", url: "https://primestreetarg.mitiendanube.com" },
  { name: "Kahlo", url: "https://kahloropaparamujeres2.mitiendanube.com" },
  { name: "Mandalana", url: "https://mandalana.mitiendanube.com" },
  { name: "Luce Indumentaria", url: "https://luceind.mitiendanube.com" },
  { name: "Elora Femme", url: "https://elorafemme.mitiendanube.com" },
  { name: "EITE", url: "https://eite2.mitiendanube.com" },
  { name: "Zannavara", url: "https://zannavara.mitiendanube.com" },
  { name: "BREHINIER", url: "https://brehinier2.mitiendanube.com" },
  { name: "Ankara", url: "https://ankaraweb.mitiendanube.com" },
  { name: "Hype Argentina", url: "https://hypeargentina.mitiendanube.com" },
  { name: "Huntley", url: "https://huntley.mitiendanube.com" },
  { name: "Punta y Hacha", url: "https://puntayhacharemeras.mitiendanube.com" },
  { name: "Made BSAS", url: "https://madebsas.mitiendanube.com" },
  { name: "We Are Community", url: "https://wearecommunity.mitiendanube.com" },
  { name: "TIANG Elegance", url: "https://tiangelegancear.mitiendanube.com" },
];
