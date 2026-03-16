import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { db, pool } from "./db";
import { products, brands, categories, productImages, productVariants, productTags, productEmbeddings, brandIntegrations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

// Initialize OpenAI conditionally
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Tiendanube OAuth Routes
  app.get("/auth/tiendanube/start", (req, res) => {
    const clientId = process.env.TIENDANUBE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).json({ message: "Missing TIENDANUBE_CLIENT_ID" });
    }
    const state = Math.random().toString(36).substring(7);
    const authUrl = `https://www.tiendanube.com/apps/${clientId}/authorize?state=${state}`;
    res.redirect(authUrl);
  });

  // Get all integrations (for frontend status check)
  app.get("/api/integrations", async (req, res) => {
    try {
      const integrations = await db.select({
        id: brandIntegrations.id,
        provider: brandIntegrations.provider,
        storeId: brandIntegrations.storeId,
        createdAt: brandIntegrations.createdAt,
      }).from(brandIntegrations);
      res.json({ integrations });
    } catch (error) {
      console.error("Error fetching integrations:", error);
      res.status(500).json({ message: "Error al obtener integraciones" });
    }
  });

  app.get("/auth/tiendanube/callback", async (req, res) => {
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).json({ message: "Missing authorization code" });
    }

    try {
      const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.TIENDANUBE_CLIENT_ID,
          client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("Tiendanube token exchange failed:", data);
        return res.status(500).json({ message: "Token exchange failed", error: data });
      }

      const { access_token, user_id } = data; // store_id is often returned as user_id in Tiendanube response
      
      // Store in database
      await db.insert(brandIntegrations).values({
        provider: "tiendanube",
        storeId: String(user_id),
        accessToken: access_token,
      });

      res.redirect(`/connect?connected=1&store_id=${user_id}`);
    } catch (error) {
      console.error("Tiendanube callback error:", error);
      res.redirect(`/connect?error=callback_failed`);
    }
  });

  app.post(api.search.searchProducts.path, async (req, res) => {
    try {
      const input = api.search.searchProducts.input.parse(req.body);
      const query = input.query.toLowerCase();
      
      // Intent extraction with strict JSON schema
      let intent: any = {
        query_language: "es",
        intent_type: query.match(/outfit|look|estilo|conjunto/) ? "outfit" : "single_item",
        occasion: null,
        style_tags: [],
        colors: { primary: [], secondary: [] },
        must_include: [],
        exclude: [],
        budget: { min: null, max: null },
        gender: null,
        preferred_categories: ["tops", "bottoms", "footwear", "outerwear"]
      };

      if (openai) {
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              { 
                role: "system", 
                content: `Extract fashion intent from query into JSON: {
                  "query_language": "es",
                  "intent_type": "outfit" | "single_item",
                  "occasion": "noche" | "oficina" | "gym" | "casual" | null,
                  "style_tags": string[],
                  "colors": {"primary": string[], "secondary": string[]},
                  "must_include": string[],
                  "exclude": string[],
                  "budget": {"min": number | null, "max": number | null},
                  "gender": "men" | "women" | "unisex" | null,
                  "preferred_categories": string[]
                }. Reply with ONLY JSON.` 
              },
              { role: "user", content: input.query }
            ]
          });
          const aiIntent = JSON.parse(completion.choices[0].message?.content || "{}");
          intent = { ...intent, ...aiIntent };
        } catch (e) {
          console.error("OpenAI Intent Error:", e);
        }
      }

      // Heuristics fallback/refinement
      if ((query.includes("negro") || query.includes("black")) && !intent.colors.primary.includes("black")) intent.colors.primary.push("black");
      if ((query.includes("blanco") || query.includes("white")) && !intent.colors.primary.includes("white")) intent.colors.primary.push("white");
      if (query.includes("noche") || query.includes("night")) intent.occasion = "noche";
      if (query.includes("minimal") && !intent.style_tags.includes("minimal")) intent.style_tags.push("minimal");

      await storage.createSearchQuery(input.query, intent);

      // Embedding
      let embedding: number[] = [];
      if (openai) {
        try {
          const embRes = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            input: input.query,
          });
          embedding = embRes.data[0].embedding;
        } catch (e) {
          console.error("OpenAI Embedding Error:", e);
        }
      }

      let candidates: any[] = [];
      let similarities = new Map<string, number>();

      if (embedding.length > 0) {
        try {
          const embeddingStr = `[${embedding.join(',')}]`;
          const matches = await pool.query(
            `SELECT * FROM match_products($1::vector(1536), 40, 0.1)`, 
            [embeddingStr]
          );
          
          const productIds = matches.rows.map(r => r.product_id);
          const productsData = await storage.getProductsByIds(productIds);
          
          candidates = productsData.map(p => {
            const similarity = matches.rows.find(r => r.product_id === p.id)?.similarity || 0;
            similarities.set(p.id, similarity);
            return p;
          });
        } catch (e) {
          console.error("Vector search failed:", e);
        }
      }

      // Fallback candidates
      if (candidates.length === 0) {
        candidates = (await storage.getProducts()).filter(p => p.status === 'active').slice(0, 40);
      }

      // Re-ranking with scoring function
      const scoredResults = candidates.map(p => {
        const similarity = similarities.get(p.id) || 0.5;
        let score = similarity * 0.65;
        const reasons: string[] = [];

        // Color Boosts
        const pText = `${p.title} ${p.description} ${p.tags.map((t: any) => t.tag).join(" ")}`.toLowerCase();
        intent.colors.primary.forEach((color: string) => {
          const colorEs = color === "black" ? "negro" : color === "white" ? "blanco" : color;
          if (pText.includes(color) || pText.includes(colorEs)) {
            score += 0.15;
            reasons.push(`Color ${colorEs} ideal`);
          } else {
            // Conflicts
            if (color === "black" && (pText.includes("white") || pText.includes("blanco"))) score -= 0.20;
            if (color === "white" && (pText.includes("black") || pText.includes("negro"))) score -= 0.20;
          }
        });

        // Occasion Boost
        if (intent.occasion === "noche") {
          const nightKeywords = ["night", "noche", "party", "fiesta", "urban", "minimal", "elegante"];
          if (nightKeywords.some(kw => pText.includes(kw))) {
            score += 0.08;
            reasons.push("Estilo nocturno");
          }
        }

        // Style Boost
        intent.style_tags.forEach((style: string) => {
          if (pText.includes(style.toLowerCase())) {
            score += 0.05;
            reasons.push(`Vibe ${style}`);
          }
        });

        // Stock Boost
        const hasStock = p.variants.some((v: any) => v.stockQty > 0);
        if (hasStock) score += 0.05;

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          basePrice: Number(p.basePrice),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          currency: p.currency,
          brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
          images: p.images.map((img: any) => ({ url: img.url, position: img.position })),
          variants: p.variants.map((v: any) => ({ sizeLabel: v.sizeLabel, stockQty: v.stockQty })),
          tags: p.tags.map((t: any) => t.tag),
          similarity: score,
          reasons: reasons.slice(0, 3)
        };
      }).sort((a, b) => b.similarity - a.similarity);

      // Outfit Bundle Composition
      const outfitBundles = [];
      if (intent.intent_type === "outfit" && scoredResults.length >= 3) {
        const top = scoredResults.find(r => r.title.toLowerCase().match(/tee|shirt|remera|hoodie|camisa|top/));
        const bottom = scoredResults.find(r => r.id !== top?.id && r.title.toLowerCase().match(/pant|jean|cargo|short|pollera/));
        const foot = scoredResults.find(r => r.id !== top?.id && r.id !== bottom?.id && r.title.toLowerCase().match(/sneaker|shoe|zapa|bota/));
        
        const items = [top, bottom, foot].filter(Boolean) as any[];
        if (items.length >= 2) {
          outfitBundles.push({
            title: "✨ Outfit recomendado por Drevo",
            items: items
          });
        }
      }

      res.status(200).json({
        query: input.query,
        intent,
        results: scoredResults,
        suggested_filters: {
          sizes: ["S", "M", "L", "XL"],
          brands: Array.from(new Set(scoredResults.map(r => r.brand?.name).filter(Boolean))) as string[]
        },
        outfit_bundles: outfitBundles
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Error" });
    }
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  });

  app.post(api.admin.reindex.path, async (req, res) => {
    res.status(200).json({ success: true, message: "Reindexing triggered via script" });
  });

  // Tiendanube product sync
  app.post("/api/integrations/:integrationId/sync-products", async (req, res) => {
    const { integrationId } = req.params;

    try {
      const [integration] = await db
        .select()
        .from(brandIntegrations)
        .where(eq(brandIntegrations.id, integrationId));

      if (!integration) {
        return res.status(404).json({ message: "Integración no encontrada" });
      }

      if (!integration.storeId || !integration.accessToken) {
        return res.status(400).json({ message: "La integración no tiene store_id o access_token" });
      }

      const { storeId, accessToken } = integration;
      const headers = {
        Authentication: `bearer ${accessToken}`,
        "User-Agent": "DREVO (valentin@drevo.app)",
        "Content-Type": "application/json",
      };

      // Fetch all pages of products
      const tnProducts: any[] = [];
      let page = 1;
      while (true) {
        const resp = await fetch(
          `https://api.tiendanube.com/v1/${storeId}/products?per_page=200&page=${page}`,
          { headers }
        );
        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`Tiendanube API error (page ${page}):`, resp.status, errText);
          break;
        }
        const batch = await resp.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        tnProducts.push(...batch);
        if (batch.length < 200) break;
        page++;
      }

      console.log(`[Tiendanube sync] Found ${tnProducts.length} products in store ${storeId}`);

      let synced = 0;
      const errors: string[] = [];

      for (const tnp of tnProducts) {
        try {
          const externalId = String(tnp.id);
          const title = (tnp.name?.es || tnp.name?.pt || tnp.name?.en || Object.values(tnp.name || {})[0] || "Sin nombre") as string;
          const description = (tnp.description?.es || tnp.description?.pt || tnp.description?.en || Object.values(tnp.description || {})[0] || "") as string;
          const basePrice = String(tnp.variants?.[0]?.price ?? tnp.price ?? "0");
          const salePrice = tnp.variants?.[0]?.promotional_price ?? null;
          const status = tnp.published ? "active" : "disabled";

          // Check if product already exists by external_id
          const existing = await db
            .select({ id: products.id })
            .from(products)
            .where(sql`external_provider = 'tiendanube' AND external_id = ${externalId}`);

          let productId: string;

          if (existing.length > 0) {
            productId = existing[0].id;
            await db
              .update(products)
              .set({ title, description, basePrice, salePrice: salePrice ? String(salePrice) : null, status, updatedAt: new Date() })
              .where(eq(products.id, productId));
            // Clear old tags/images/variants for refresh
            await db.delete(productTags).where(eq(productTags.productId, productId));
            await db.delete(productImages).where(eq(productImages.productId, productId));
            await db.delete(productVariants).where(eq(productVariants.productId, productId));
          } else {
            const [inserted] = await db
              .insert(products)
              .values({ title, description, basePrice, salePrice: salePrice ? String(salePrice) : null, status, externalProvider: "tiendanube", externalId, currency: "ARS" })
              .returning({ id: products.id });
            productId = inserted.id;
          }

          // Images
          if (Array.isArray(tnp.images) && tnp.images.length > 0) {
            await db.insert(productImages).values(
              tnp.images.slice(0, 5).map((img: any, i: number) => ({ productId, url: img.src, position: i }))
            );
          }

          // Variants
          if (Array.isArray(tnp.variants) && tnp.variants.length > 0) {
            await db.insert(productVariants).values(
              tnp.variants.map((v: any) => ({
                productId,
                sizeLabel: [v.values?.[0], v.values?.[1]].filter(Boolean).join(" / ") || "Único",
                sku: v.sku || null,
                stockQty: v.stock ?? 0,
              }))
            );
          } else {
            await db.insert(productVariants).values({ productId, sizeLabel: "Único", stockQty: 0 });
          }

          // Tags — from tnp.tags + color inference from title
          const rawTags: string[] = Array.isArray(tnp.tags) ? tnp.tags.flatMap((t: string) => t.split(",").map((s: string) => s.trim()).filter(Boolean)) : [];
          const titleLower = title.toLowerCase();
          if (titleLower.includes("negro") || titleLower.includes("black")) rawTags.push("black", "negro");
          if (titleLower.includes("blanco") || titleLower.includes("white")) rawTags.push("white", "blanco");
          if (rawTags.length > 0) {
            await db.insert(productTags).values(rawTags.map(tag => ({ productId, tag })));
          }

          // Generate embedding
          if (openai) {
            try {
              const textToEmbed = `${title}. ${description} Tags: ${rawTags.join(", ")}`;
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
              console.error(`Embedding error for ${title}:`, embErr.message);
            }
          }

          synced++;
        } catch (productErr: any) {
          console.error(`Error syncing product ${tnp.id}:`, productErr.message);
          errors.push(`Producto ${tnp.id}: ${productErr.message}`);
        }
      }

      console.log(`[Tiendanube sync] Completed: ${synced} synced, ${errors.length} errors`);
      res.json({ synced, errors, store_id: storeId });
    } catch (err: any) {
      console.error("Sync error:", err);
      res.status(500).json({ message: "Error al sincronizar productos", error: err.message });
    }
  });

  seedDatabase().catch(console.error);
  return httpServer;
}

async function seedDatabase() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await pool.query(`
      CREATE OR REPLACE FUNCTION match_products (
        query_embedding vector(1536),
        match_count int DEFAULT null,
        min_similarity float DEFAULT 0
      ) RETURNS TABLE (product_id uuid, similarity float)
      LANGUAGE plpgsql AS $$
      BEGIN
        RETURN QUERY
        SELECT pe.product_id, 1 - (pe.embedding <=> query_embedding) AS similarity
        FROM product_embeddings pe
        JOIN products p ON p.id = pe.product_id
        WHERE p.status = 'active' AND 1 - (pe.embedding <=> query_embedding) > min_similarity
        ORDER BY pe.embedding <=> query_embedding LIMIT match_count;
      END; $$;
    `);
  } catch (e) {}

  const existingProducts = await db.select().from(products);
  if (existingProducts.length > 5) return;

  const cats = await db.select().from(categories);
  const topsId = cats.find(c => c.name === "Tops")?.id;
  const bottomsId = cats.find(c => c.name === "Bottoms")?.id;
  const footId = cats.find(c => c.name === "Footwear")?.id;
  const outerId = cats.find(c => c.name === "Outerwear")?.id;
  
  const b = await db.select().from(brands);
  const brand1 = b[0].id;
  const brand2 = b[1].id;

  const newProds = [
    { brandId: brand1, categoryId: topsId, title: "Black Oversized Tee", description: "Heavy cotton black tee for a minimal night look.", basePrice: "30.00" },
    { brandId: brand1, categoryId: bottomsId, title: "Black Cargo Pants", description: "Technical black cargo pants with utility pockets.", basePrice: "75.00" },
    { brandId: brand2, categoryId: footId, title: "Triple Black Sneakers", description: "Minimalist triple black sneakers for urban style.", basePrice: "110.00" },
    { brandId: brand1, categoryId: outerId, title: "Black Minimal Bomber", description: "Sleek black bomber jacket, perfect for night outings.", basePrice: "95.00" },
    { brandId: brand2, categoryId: topsId, title: "Red Graphic Tee", description: "Vintage wash red tee with a bold graphic.", basePrice: "35.00" },
    { brandId: brand1, categoryId: bottomsId, title: "Grey Relaxed Jeans", description: "Wide leg grey denim for a casual fit.", basePrice: "85.00" },
    { brandId: brand2, categoryId: footId, title: "White Canvas Trainers", description: "Clean white trainers for everyday wear.", basePrice: "65.00" },
    { brandId: brand1, categoryId: outerId, title: "Navy Windbreaker", description: "Lightweight navy jacket for outdoor activities.", basePrice: "70.00" },
    { brandId: brand2, categoryId: topsId, title: "Black Mock Neck", description: "Elegant black mock neck top for formal occasions.", basePrice: "40.00" },
    { brandId: brand1, categoryId: bottomsId, title: "Black Slim Chinos", description: "Classic black chinos with a slim fit.", basePrice: "55.00" },
    { brandId: brand1, categoryId: outerId, title: "Black Denim Jacket", description: "Classic black denim jacket, a staple for any outfit.", basePrice: "80.00" },
    { brandId: brand2, categoryId: bottomsId, title: "Black Straight Jeans", description: "Durable black straight-cut jeans.", basePrice: "70.00" },
    { brandId: brand1, categoryId: footId, title: "Black Chelsea Boots", description: "Polished black chelsea boots for a smart look.", basePrice: "130.00" }
  ];

  for (const p of newProds) {
    const [inserted] = await db.insert(products).values(p).returning();
    await db.insert(productVariants).values([
      { productId: inserted.id, sizeLabel: "M", stockQty: 20 },
      { productId: inserted.id, sizeLabel: "L", stockQty: 15 }
    ]);
    await db.insert(productImages).values([{ productId: inserted.id, url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80", position: 0 }]);
    
    const tags = [];
    if (p.title.toLowerCase().includes("black")) tags.push("black", "negro");
    if (p.title.toLowerCase().includes("white")) tags.push("white", "blanco");
    if (p.description.toLowerCase().includes("night") || p.description.toLowerCase().includes("noche")) tags.push("night", "noche");
    if (p.description.toLowerCase().includes("minimal")) tags.push("minimal");
    
    if (tags.length > 0) {
      await db.insert(productTags).values(tags.map(tag => ({ productId: inserted.id, tag })));
    }
  }
  console.log("Seed extended with 13 diverse products.");
}
