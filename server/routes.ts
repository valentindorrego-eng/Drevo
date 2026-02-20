import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { db, pool } from "./db";
import { products, brands, categories, productImages, productVariants, productTags, productEmbeddings } from "@shared/schema";
import { eq } from "drizzle-orm";

// Initialize OpenAI conditionally
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.search.searchProducts.path, async (req, res) => {
    try {
      const input = api.search.searchProducts.input.parse(req.body);
      
      // Intent extraction
      let intent = {};
      if (openai) {
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "Extract fashion intent from query into a JSON object: { desired_item_type: string, colors: string[], style: string[], fit: string, occasion: string, budget_min: number, budget_max: number, gender: string, must_have_keywords: string[], exclude_keywords: string[] }. Reply with ONLY JSON." },
              { role: "user", content: input.query }
            ]
          });
          intent = JSON.parse(completion.choices[0].message?.content || "{}");
        } catch (e) {
          console.error("OpenAI Intent Error:", e);
        }
      }

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

      let matchedProductIds: string[] = [];
      let similarities = new Map<string, number>();

      if (embedding.length > 0) {
        try {
          // call match_products rpc using raw SQL
          const embeddingStr = `[${embedding.join(',')}]`;
          const query = `
            SELECT * FROM match_products($1::vector(1536), $2::int, $3::float)
          `;
          const matches = await pool.query(query, [embeddingStr, input.limit || 20, 0.1]);
          
          matches.rows.forEach(r => {
            matchedProductIds.push(r.product_id);
            similarities.set(r.product_id, r.similarity);
          });
        } catch (e) {
          console.error("Vector search failed:", e);
        }
      }

      // Fallback if no embedding or no results: just get some products
      let finalResults = [];
      if (matchedProductIds.length > 0) {
        for (const id of matchedProductIds) {
          const p = await storage.getProduct(id);
          if (p && p.status === 'active') {
            finalResults.push({
              id: p.id,
              title: p.title,
              description: p.description,
              basePrice: Number(p.basePrice),
              salePrice: p.salePrice ? Number(p.salePrice) : null,
              currency: p.currency,
              brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
              images: p.images.map(img => ({ url: img.url, position: img.position })),
              variants: p.variants.map(v => ({ sizeLabel: v.sizeLabel, stockQty: v.stockQty })),
              tags: p.tags.map(t => t.tag),
              similarity: similarities.get(p.id) || 0,
              reasons: ["Matches your intent"]
            });
          }
        }
      } else {
        // Fallback: return top 5 active products
        const all = await storage.getProducts();
        finalResults = all.filter(p => p.status === 'active').slice(0, 5).map(p => ({
          id: p.id,
          title: p.title,
          description: p.description,
          basePrice: Number(p.basePrice),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          currency: p.currency,
          brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
          images: p.images.map(img => ({ url: img.url, position: img.position })),
          variants: p.variants.map(v => ({ sizeLabel: v.sizeLabel, stockQty: v.stockQty })),
          tags: p.tags.map(t => t.tag),
          similarity: 0,
          reasons: ["Popular product"]
        }));
      }

      res.status(200).json({
        query: input.query,
        intent,
        results: finalResults,
        suggested_filters: {
          sizes: ["S", "M", "L", "XL"],
          brands: ["Urban Street", "Minimal Core"]
        },
        outfit_bundles: finalResults.length >= 3 ? [{
          title: "Complete the Look",
          items: finalResults.slice(0, 3)
        }] : []
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: "Internal Error" });
    }
  });

  app.get(api.products.get.path, async (req, res) => {
    const product = await storage.getProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  });

  app.post(api.admin.reindex.path, async (req, res) => {
    const input = api.admin.reindex.input.parse(req.body);
    if (input.secret !== process.env.ADMIN_REINDEX_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.status(200).json({ success: true, message: "Reindexing via API not fully implemented, use scripts/reindex.ts" });
  });

  // Call seed on start
  seedDatabase().catch(console.error);

  return httpServer;
}

async function seedDatabase() {
  // Try to create the RPC function if it doesn't exist
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await pool.query(`
      CREATE OR REPLACE FUNCTION match_products (
        query_embedding vector(1536),
        match_count int DEFAULT null,
        min_similarity float DEFAULT 0
      ) RETURNS TABLE (
        product_id uuid,
        similarity float
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          pe.product_id,
          1 - (pe.embedding <=> query_embedding) AS similarity
        FROM product_embeddings pe
        JOIN products p ON p.id = pe.product_id
        WHERE p.status = 'active'
          AND 1 - (pe.embedding <=> query_embedding) > min_similarity
        ORDER BY pe.embedding <=> query_embedding
        LIMIT match_count;
      END;
      $$;
    `);
  } catch (e) {
    console.error("Failed to create pgvector extension or match_products RPC:", e);
  }

  // If we already have categories, skip
  const existingCats = await db.select().from(categories);
  if (existingCats.length > 0) return;
  
  console.log("Seeding database...");

  // Create categories
  const catNames = ["Tops", "Bottoms", "Outerwear", "Footwear", "Accessories"];
  const insertedCats = await db.insert(categories).values(catNames.map(name => ({ name }))).returning();

  // Create brands
  const brandNames = [{ name: "Urban Street", slug: "urban-street" }, { name: "Minimal Core", slug: "minimal-core" }];
  const insertedBrands = await db.insert(brands).values(brandNames).returning();

  // Create 5 products
  const prods = [
    { brandId: insertedBrands[0].id, categoryId: insertedCats[0].id, title: "Oversized Black Tee", description: "A comfortable black oversized t-shirt for streetwear.", basePrice: "25.00" },
    { brandId: insertedBrands[0].id, categoryId: insertedCats[1].id, title: "Cargo Pants Black", description: "Utility cargo pants with multiple pockets.", basePrice: "60.00" },
    { brandId: insertedBrands[1].id, categoryId: insertedCats[0].id, title: "Minimal White Hoodie", description: "Clean, elegant white hoodie.", basePrice: "45.00" },
    { brandId: insertedBrands[1].id, categoryId: insertedCats[3].id, title: "Chunky Sneakers", description: "White and grey chunky sneakers.", basePrice: "90.00" },
    { brandId: insertedBrands[0].id, categoryId: insertedCats[2].id, title: "Puffer Jacket", description: "Warm black puffer jacket for winter.", basePrice: "120.00" }
  ];

  const insertedProducts = await db.insert(products).values(prods).returning();

  // Insert variants, images, tags
  for (const p of insertedProducts) {
    await db.insert(productVariants).values([
      { productId: p.id, sizeLabel: "S", stockQty: 10 },
      { productId: p.id, sizeLabel: "M", stockQty: 15 },
      { productId: p.id, sizeLabel: "L", stockQty: 5 }
    ]);
    
    await db.insert(productImages).values([
      { productId: p.id, url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80", position: 0 }
    ]);

    await db.insert(productTags).values([
      { productId: p.id, tag: "streetwear" },
      { productId: p.id, tag: "casual" }
    ]);
  }
  console.log("Database seeded successfully.");
}
