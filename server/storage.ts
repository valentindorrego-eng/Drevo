import { type User, type InsertUser, products, productTags, productImages, productVariants, brands, categories } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, inArray } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Products
  getProducts(): Promise<any[]>;
  getProduct(id: string): Promise<any | undefined>;
  getProductsByIds(ids: string[]): Promise<any[]>;
  
  // Search
  createSearchQuery(queryText: string, intent: any): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return undefined; // Not implemented for this MVP
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined; // Not implemented for this MVP
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    throw new Error("Not implemented");
  }

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

  async getProductsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const pArray = await db.select().from(products).where(inArray(products.id, ids));
    const result = [];
    for (const p of pArray) {
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

  async createSearchQuery(queryText: string, intent: any) {
    // Insert into searchQueries table (assuming it exists in schema)
    // For now, just logging to satisfy requirement
    console.log("Saving search query:", queryText, intent);
    return { id: randomUUID(), queryText, parsedIntent: intent };
  }
}

export const storage = new DatabaseStorage();
