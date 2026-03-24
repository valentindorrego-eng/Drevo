import { type User, type InsertUser, type TryonResult, users, products, productTags, productImages, productVariants, brands, categories, tryonResults } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, inArray } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  getProducts(): Promise<any[]>;
  getProduct(id: string): Promise<any | undefined>;
  getProductsByIds(ids: string[]): Promise<any[]>;

  createSearchQuery(queryText: string, intent: any): Promise<any>;

  getTryonResult(userId: string, productId: string): Promise<TryonResult | undefined>;
  createTryonResult(data: { userId: string; productId: string; userImageUrl: string; resultImageUrl: string }): Promise<TryonResult>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return result[0] || undefined;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId));
    return result[0] || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values({ ...insertUser, email: insertUser.email.toLowerCase() }).returning();
    return result[0];
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0] || undefined;
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
    console.log("Saving search query:", queryText, intent);
    return { id: randomUUID(), queryText, parsedIntent: intent };
  }

  async getTryonResult(userId: string, productId: string): Promise<TryonResult | undefined> {
    const result = await db.select().from(tryonResults)
      .where(and(eq(tryonResults.userId, userId), eq(tryonResults.productId, productId)));
    return result[0] || undefined;
  }

  async createTryonResult(data: { userId: string; productId: string; userImageUrl: string; resultImageUrl: string }): Promise<TryonResult> {
    const result = await db.insert(tryonResults).values(data).returning();
    return result[0];
  }
}

export const storage = new DatabaseStorage();
