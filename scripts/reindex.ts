import { db, pool } from "../server/db";
import { products, productTags } from "../shared/schema";
import OpenAI from "openai";
import { eq } from "drizzle-orm";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function reindex() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY");
    process.exit(1);
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const allProducts = await db.select().from(products).where(eq(products.status, 'active'));
  console.log(`Found ${allProducts.length} active products to reindex.`);

  for (const p of allProducts) {
    const pTags = await db.select().from(productTags).where(eq(productTags.productId, p.id));
    const tagsStr = pTags.map(t => t.tag).join(", ");

    const textToEmbed = `${p.title}. ${p.description || ""} Tags: ${tagsStr}`;
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

      console.log(`Indexed ${p.title}`);
    } catch (e) {
      console.error(`Failed to index ${p.title}:`, e);
    }
  }

  console.log("Reindexing complete.");
  process.exit(0);
}

reindex();
