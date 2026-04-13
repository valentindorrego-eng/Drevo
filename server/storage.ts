import { type User, type InsertUser, type TryonResult, type ProductClick, type Collection, type CollectionItem, users, products, productTags, productImages, productVariants, brands, categories, tryonResults, productClicks, collections, collectionItems } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";

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

  createProductClick(data: { userId?: string; productId: string; brandId?: string; sessionId?: string; referralCode: string; queryText?: string; cpcAmount?: string }): Promise<ProductClick>;
  convertClick(referralCode: string, orderAmount: number): Promise<ProductClick | undefined>;
  getClickAnalytics(): Promise<any>;

  getCollectionsByUser(userId: string): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | undefined>;
  createCollection(data: { userId: string; name: string; emoji?: string; isDefault?: boolean }): Promise<Collection>;
  updateCollection(id: string, data: { name?: string; emoji?: string | null }): Promise<Collection | undefined>;
  deleteCollection(id: string): Promise<void>;
  addCollectionItem(collectionId: string, productId: string): Promise<CollectionItem>;
  removeCollectionItem(collectionId: string, productId: string): Promise<void>;
  getCollectionItems(collectionId: string): Promise<any[]>;
  getUserSavedProductIds(userId: string): Promise<string[]>;
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

  // Batch-load related data for a list of products (eliminates N+1)
  private async enrichProducts(productList: typeof products.$inferSelect[]) {
    if (productList.length === 0) return [];

    const productIds = productList.map(p => p.id);
    const brandIds = Array.from(new Set(productList.map(p => p.brandId).filter(Boolean))) as string[];

    // 4 batch queries instead of 4 × N individual queries
    const [allBrands, allImages, allVariants, allTags] = await Promise.all([
      brandIds.length > 0 ? db.select().from(brands).where(inArray(brands.id, brandIds)) : [],
      db.select().from(productImages).where(inArray(productImages.productId, productIds)),
      db.select().from(productVariants).where(inArray(productVariants.productId, productIds)),
      db.select().from(productTags).where(inArray(productTags.productId, productIds)),
    ]);

    // Index by ID for O(1) lookup
    const brandMap = new Map(allBrands.map(b => [b.id, b]));
    const imageMap = new Map<string, typeof allImages>();
    const variantMap = new Map<string, typeof allVariants>();
    const tagMap = new Map<string, typeof allTags>();

    for (const img of allImages) {
      const list = imageMap.get(img.productId!) || [];
      list.push(img);
      imageMap.set(img.productId!, list);
    }
    for (const v of allVariants) {
      const list = variantMap.get(v.productId!) || [];
      list.push(v);
      variantMap.set(v.productId!, list);
    }
    for (const t of allTags) {
      const list = tagMap.get(t.productId!) || [];
      list.push(t);
      tagMap.set(t.productId!, list);
    }

    return productList.map(p => ({
      ...p,
      brand: p.brandId ? brandMap.get(p.brandId) || null : null,
      images: imageMap.get(p.id) || [],
      variants: variantMap.get(p.id) || [],
      tags: tagMap.get(p.id) || [],
    }));
  }

  async getProducts() {
    const allProducts = await db.select().from(products);
    return this.enrichProducts(allProducts);
  }

  async getProduct(id: string) {
    const pArray = await db.select().from(products).where(eq(products.id, id));
    if (pArray.length === 0) return undefined;
    const enriched = await this.enrichProducts(pArray);
    return enriched[0];
  }

  async getProductsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const pArray = await db.select().from(products).where(inArray(products.id, ids));
    return this.enrichProducts(pArray);
  }

  async createSearchQuery(queryText: string, intent: any) {
    console.log("Saving search query:", queryText, intent);
    return { id: randomUUID(), queryText, parsedIntent: intent };
  }

  async getTryonResult(userId: string, productId: string): Promise<TryonResult | undefined> {
    const result = await db.select().from(tryonResults)
      .where(and(eq(tryonResults.userId, userId), eq(tryonResults.productId, productId)))
      .orderBy(desc(tryonResults.createdAt))
      .limit(1);
    return result[0] || undefined;
  }

  async createTryonResult(data: { userId: string; productId: string; userImageUrl: string; resultImageUrl: string }): Promise<TryonResult> {
    const result = await db.insert(tryonResults).values(data).returning();
    return result[0];
  }

  async createProductClick(data: { userId?: string; productId: string; brandId?: string; sessionId?: string; referralCode: string; queryText?: string; cpcAmount?: string }): Promise<ProductClick> {
    const result = await db.insert(productClicks).values(data).returning();
    return result[0];
  }

  async convertClick(referralCode: string, orderAmount: number): Promise<ProductClick | undefined> {
    const commissionAmount = (orderAmount * 0.20).toFixed(2);
    const result = await db.update(productClicks)
      .set({ status: "converted", convertedAt: new Date(), commissionAmount })
      .where(eq(productClicks.referralCode, referralCode))
      .returning();
    return result[0] || undefined;
  }

  async getClickAnalytics(): Promise<any> {
    const totalClicks = await db.select({ count: sql<number>`count(*)` }).from(productClicks);
    const conversions = await db.select({ count: sql<number>`count(*)` }).from(productClicks).where(eq(productClicks.status, "converted"));
    const revenue = await db.select({ total: sql<string>`COALESCE(SUM(commission_amount::numeric), 0)` }).from(productClicks).where(eq(productClicks.status, "converted"));

    const byBrand = await db.select({
      brandId: productClicks.brandId,
      brandName: brands.name,
      clicks: sql<number>`count(*)`,
      conversions: sql<number>`count(*) FILTER (WHERE ${productClicks.status} = 'converted')`,
      revenue: sql<string>`COALESCE(SUM(${productClicks.commissionAmount}::numeric) FILTER (WHERE ${productClicks.status} = 'converted'), 0)`,
    }).from(productClicks)
      .leftJoin(brands, eq(productClicks.brandId, brands.id))
      .groupBy(productClicks.brandId, brands.name);

    const byQuery = await db.select({
      queryText: productClicks.queryText,
      clicks: sql<number>`count(*)`,
      conversions: sql<number>`count(*) FILTER (WHERE ${productClicks.status} = 'converted')`,
    }).from(productClicks)
      .where(sql`${productClicks.queryText} IS NOT NULL`)
      .groupBy(productClicks.queryText)
      .orderBy(sql`count(*) DESC`)
      .limit(20);

    return {
      totalClicks: Number(totalClicks[0]?.count || 0),
      totalConversions: Number(conversions[0]?.count || 0),
      totalRevenue: Number(revenue[0]?.total || 0),
      byBrand,
      byQuery,
    };
  }

  async getCollectionsByUser(userId: string): Promise<Collection[]> {
    return db.select().from(collections).where(eq(collections.userId, userId)).orderBy(desc(collections.createdAt));
  }

  async getCollection(id: string): Promise<Collection | undefined> {
    const result = await db.select().from(collections).where(eq(collections.id, id));
    return result[0] || undefined;
  }

  async createCollection(data: { userId: string; name: string; emoji?: string; isDefault?: boolean }): Promise<Collection> {
    const result = await db.insert(collections).values(data).returning();
    return result[0];
  }

  async updateCollection(id: string, data: { name?: string; emoji?: string | null }): Promise<Collection | undefined> {
    const result = await db.update(collections).set(data).where(eq(collections.id, id)).returning();
    return result[0] || undefined;
  }

  async deleteCollection(id: string): Promise<void> {
    // Delete items first, then the collection
    await db.delete(collectionItems).where(eq(collectionItems.collectionId, id));
    await db.delete(collections).where(eq(collections.id, id));
  }

  async addCollectionItem(collectionId: string, productId: string): Promise<CollectionItem> {
    const existing = await db.select().from(collectionItems)
      .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.productId, productId)));
    if (existing.length > 0) return existing[0];
    const result = await db.insert(collectionItems).values({ collectionId, productId }).returning();
    return result[0];
  }

  async removeCollectionItem(collectionId: string, productId: string): Promise<void> {
    await db.delete(collectionItems)
      .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.productId, productId)));
  }

  async getCollectionItems(collectionId: string): Promise<any[]> {
    const items = await db.select().from(collectionItems)
      .where(eq(collectionItems.collectionId, collectionId))
      .orderBy(desc(collectionItems.addedAt));
    if (items.length === 0) return [];
    const productIds = items.map(i => i.productId);
    return this.getProductsByIds(productIds);
  }

  async getUserSavedProductIds(userId: string): Promise<string[]> {
    const userCollections = await db.select({ id: collections.id }).from(collections).where(eq(collections.userId, userId));
    if (userCollections.length === 0) return [];
    const collectionIds = userCollections.map(c => c.id);
    const items = await db.select({ productId: collectionItems.productId })
      .from(collectionItems)
      .where(inArray(collectionItems.collectionId, collectionIds));
    return items.map(i => i.productId);
  }
}

export const storage = new DatabaseStorage();
