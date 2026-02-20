import { db } from "./db";
import {
  products, brands, categories, productImages, productVariants, productTags, productEmbeddings, searchQueries,
  type Product, type Brand, type Category, type ProductImage, type ProductVariant, type ProductTag, type SearchQuery
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  getProducts(): Promise<(Product & { brand: Brand | null, images: ProductImage[], variants: ProductVariant[], tags: ProductTag[] })[]>;
  getProduct(id: string): Promise<(Product & { brand: Brand | null, images: ProductImage[], variants: ProductVariant[], tags: ProductTag[] }) | undefined>;
  createSearchQuery(queryText: string, intent: any): Promise<SearchQuery>;
}

export class DatabaseStorage implements IStorage {
  async getProducts() {
    const allProducts = await db.select().from(products);
    const result = [];
    for (const p of allProducts) {
      const pBrands = await db.select().from(brands).where(eq(brands.id, p.brandId!));
      const pImages = await db.select().from(productImages).where(eq(productImages.productId, p.id));
      const pVariants = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
      const pTags = await db.select().from(productTags).where(eq(productTags.productId, p.id));
      
      result.push({
        ...p,
        brand: pBrands[0] || null,
        images: pImages,
        variants: pVariants,
        tags: pTags
      });
    }
    return result;
  }

  async getProduct(id: string) {
    const pArray = await db.select().from(products).where(eq(products.id, id));
    if (pArray.length === 0) return undefined;
    const p = pArray[0];
    const pBrands = await db.select().from(brands).where(eq(brands.id, p.brandId!));
    const pImages = await db.select().from(productImages).where(eq(productImages.productId, p.id));
    const pVariants = await db.select().from(productVariants).where(eq(productVariants.productId, p.id));
    const pTags = await db.select().from(productTags).where(eq(productTags.productId, p.id));
    
    return {
      ...p,
      brand: pBrands[0] || null,
      images: pImages,
      variants: pVariants,
      tags: pTags
    };
  }

  async createSearchQuery(queryText: string, intent: any) {
    const [q] = await db.insert(searchQueries).values({ queryText, parsedIntent: intent }).returning();
    return q;
  }
}

export const storage = new DatabaseStorage();
