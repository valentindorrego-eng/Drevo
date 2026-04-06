import { db, pool } from "../server/db";
import { products, productTags, productImages } from "../shared/schema";
import OpenAI from "openai";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function analyzeProductImage(imageUrl: string, title: string): Promise<string> {
  try {
    const res = await openai.chat.completions.create({
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
IMPORTANT: Only list colors that are actually visible in the PRODUCT (not the model's skin/hair/background). Be accurate with the main product color.` },
          { type: "image_url", image_url: { url: imageUrl, detail: "low" } }
        ]
      }],
      max_tokens: 120,
    });
    return res.choices[0]?.message?.content?.trim() || "";
  } catch (e: any) {
    console.error(`  Vision error for ${title}: ${e.message}`);
    return "";
  }
}

async function reindex() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const useVision = process.argv.includes("--vision");
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const allProducts = await db.select().from(products).where(eq(products.status, 'active'));
  console.log(`Found ${allProducts.length} active products to reindex.`);
  if (useVision) console.log("Vision analysis ENABLED (--vision flag)");

  let indexed = 0;
  let failed = 0;

  for (const p of allProducts) {
    const pTags = await db.select().from(productTags).where(eq(productTags.productId, p.id));
    const tagsStr = pTags.map(t => t.tag).join(", ");

    let visionDescription = "";

    if (useVision) {
      // Get main product image for vision analysis
      const images = await db.select().from(productImages).where(eq(productImages.productId, p.id));
      const mainImage = images.find(img => img.position === 0) || images[0];
      if (mainImage?.url) {
        console.log(`  Analyzing image for: ${p.title}`);
        visionDescription = await analyzeProductImage(mainImage.url, p.title || "");

        // Update tags from vision analysis
        if (visionDescription) {
          const visionTags = visionDescription.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.length < 30);
          const existingTags = pTags.map(t => t.tag);
          const newTags = visionTags.filter(vt => !existingTags.includes(vt));
          if (newTags.length > 0) {
            await db.insert(productTags).values(newTags.map(tag => ({ productId: p.id, tag })));
            console.log(`  Added ${newTags.length} vision tags`);
          }
        }
      }
    }

    // Build rich text for embedding - include vision analysis when available
    const parts = [p.title || ""];
    if (p.description) parts.push(p.description);
    if (visionDescription) parts.push(`Visual attributes: ${visionDescription}.`);
    if (tagsStr) parts.push(`Tags: ${tagsStr}`);

    const textToEmbed = parts.join(". ");
    console.log(`Generating embedding for: ${p.title}`);

    try {
      const response = await openai.embeddings.create({ model, input: textToEmbed });
      const embedding = response.data[0].embedding;
      const embeddingStr = `[${embedding.join(',')}]`;

      await pool.query(
        `INSERT INTO product_embeddings (product_id, embedding, embedding_model, updated_at)
         VALUES ($1, $2::vector, $3, NOW())
         ON CONFLICT (product_id) DO UPDATE
         SET embedding = EXCLUDED.embedding, embedding_model = EXCLUDED.embedding_model, updated_at = EXCLUDED.updated_at`,
        [p.id, embeddingStr, model]
      );

      indexed++;
      console.log(`  Indexed ${p.title} (${indexed}/${allProducts.length})`);
    } catch (e) {
      failed++;
      console.error(`  Failed to index ${p.title}:`, e);
    }
  }

  console.log(`\nReindexing complete. ${indexed} indexed, ${failed} failed.`);
  process.exit(0);
}

reindex();
