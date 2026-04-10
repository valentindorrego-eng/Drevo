import { pgTable, text, uuid, numeric, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Tables based on user requirements
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
});

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country").default("AR"),
  website: text("website"),
  instagram: text("instagram"),
  contactEmail: text("contact_email"),
  status: text("status").default("approved"), // 'pending', 'approved', 'rejected'
  commissionRate: numeric("commission_rate").default("0.25"),
  cpcRate: numeric("cpc_rate").default("0"),    // Cost per click in ARS (0 = no CPC, scraped brands)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id),
  title: text("title").notNull(),
  description: text("description"),
  categoryId: uuid("category_id").references(() => categories.id),
  gender: text("gender").default("unisex"), // 'men', 'women', 'unisex'
  basePrice: numeric("base_price").notNull(),
  salePrice: numeric("sale_price"),
  currency: text("currency").default("USD"),
  status: text("status").default("active"), // 'draft', 'pending', 'active', 'disabled'
  externalProvider: text("external_provider"), // e.g. 'tiendanube'
  externalId: text("external_id"),            // provider's product ID
  externalUrl: text("external_url"),          // link to buy on the original store
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id),
  sizeLabel: text("size_label").notNull(),
  sku: text("sku"),
  stockQty: integer("stock_qty").default(0),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id),
  url: text("url").notNull(),
  position: integer("position").default(0),
});

export const productTags = pgTable("product_tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").references(() => products.id),
  tag: text("tag").notNull(),
});

// Since pgvector's vector type isn't natively exported by drizzle-orm/pg-core standard types in the older versions
// without explicit configuration, we can use customType if needed. We'll try to use standard SQL vector later or a text field temporarily if vector is missing, but Drizzle does support it via custom types or explicit vector().
import { customType } from 'drizzle-orm/pg-core';
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string | number[]): number[] {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        // Fallback for pgvector string representation like '[0.1, 0.2, ...]'
        return JSON.parse(value.replace(/\[/g, '[').replace(/\]/g, ']'));
      }
    }
    return value;
  },
});

export const productEmbeddings = pgTable("product_embeddings", {
  productId: uuid("product_id").primaryKey().references(() => products.id),
  embedding: vector("embedding"),
  embeddingModel: text("embedding_model"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const searchQueries = pgTable("search_queries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  queryText: text("query_text").notNull(),
  parsedIntent: jsonb("parsed_intent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const brandIntegrations = pgTable("brand_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id),
  userId: uuid("user_id").references(() => users.id),
  provider: text("provider").notNull(),
  storeId: text("store_id"),
  accessToken: text("access_token").notNull(),
  storeName: text("store_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId: text("google_id"),
  displayName: text("display_name"),
  preferredSize: text("preferred_size"),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  bodyType: text("body_type"),
  profileImageUrl: text("profile_image_url"),
  fullBodyImageUrl: text("full_body_image_url"),
  stylePassportCompleted: boolean("style_passport_completed").default(false),
  styleVibes: text("style_vibes").array(),
  ocasionesFrecuentes: text("ocasiones_frecuentes").array(),
  presupuestoRango: text("presupuesto_rango"),
  marcasFavoritas: text("marcas_favoritas").array(),
  coloresEvitar: text("colores_evitar").array(),
  estilosEvitar: text("estilos_evitar").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tryonResults = pgTable("tryon_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  userImageUrl: text("user_image_url").notNull(),
  resultImageUrl: text("result_image_url").notNull(),
  status: text("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productClicks = pgTable("product_clicks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  productId: uuid("product_id").references(() => products.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id),
  sessionId: text("session_id"),
  referralCode: text("referral_code").notNull().unique(),
  utmSource: text("utm_source").default("drevo"),
  utmMedium: text("utm_medium").default("ai_search"),
  utmCampaign: text("utm_campaign").default("discovery"),
  queryText: text("query_text"),
  clickedAt: timestamp("clicked_at").defaultNow(),
  convertedAt: timestamp("converted_at"),
  commissionAmount: numeric("commission_amount"),
  cpcAmount: numeric("cpc_amount"),        // CPC charge for connected brands
  status: text("status").default("clicked"),
});

export const collections = pgTable("collections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  emoji: text("emoji"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const collectionItems = pgTable("collection_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  collectionId: uuid("collection_id").references(() => collections.id).notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
  notes: text("notes"),
});

// ─── Checkout & Orders ───

export const userAddresses = pgTable("user_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  street: text("street").notNull(),
  streetNumber: text("street_number").notNull(),
  floor: text("floor"),
  city: text("city").notNull(),
  province: text("province").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").default("AR"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  addressId: uuid("address_id").references(() => userAddresses.id),
  status: text("status").default("pending"), // pending, paid, processing, shipped, delivered, cancelled
  paymentStatus: text("payment_status").default("pending"), // pending, approved, rejected, refunded
  mpPaymentId: text("mp_payment_id"),
  mpPreferenceId: text("mp_preference_id"),
  subtotal: numeric("subtotal").notNull(),
  shippingTotal: numeric("shipping_total").default("0"),
  commissionTotal: numeric("commission_total").notNull(),
  total: numeric("total").notNull(),
  currency: text("currency").default("ARS"),
  customerEmail: text("customer_email"),
  customerName: text("customer_name"),
  shippingAddress: jsonb("shipping_address"), // snapshot of address at time of order
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id).notNull(),
  productId: uuid("product_id").references(() => products.id).notNull(),
  variantId: uuid("variant_id").references(() => productVariants.id),
  brandId: uuid("brand_id").references(() => brands.id),
  title: text("title").notNull(),
  sizeLabel: text("size_label"),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price").notNull(),
  totalPrice: numeric("total_price").notNull(),
  imageUrl: text("image_url"),
});

export const brandOrders = pgTable("brand_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  externalOrderId: text("external_order_id"), // Tiendanube order ID
  status: text("status").default("pending"), // pending, created, packed, shipped, delivered, cancelled
  subtotal: numeric("subtotal").notNull(),
  commissionAmount: numeric("commission_amount").notNull(),
  brandPayout: numeric("brand_payout").notNull(),
  shippingCost: numeric("shipping_cost").default("0"),
  trackingNumber: text("tracking_number"),
  trackingUrl: text("tracking_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const brandPaymentAccounts = pgTable("brand_payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  provider: text("provider").default("mercadopago"),
  mpUserId: text("mp_user_id"),
  mpEmail: text("mp_email"),
  mpAccessToken: text("mp_access_token"),
  mpRefreshToken: text("mp_refresh_token"),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── API Usage / Cost Tracking ───

export const apiUsageLogs = pgTable("api_usage_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  service: text("service").notNull(),        // 'anthropic', 'openai_embedding', 'openai_vision', 'openai_chat'
  model: text("model"),                       // e.g. 'claude-sonnet-4-20250514', 'text-embedding-3-small'
  endpoint: text("endpoint"),                 // e.g. '/api/stylist/chat', '/api/search', 'scraper'
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  totalTokens: integer("total_tokens").default(0),
  estimatedCostUsd: numeric("estimated_cost_usd").default("0"),
  metadata: jsonb("metadata"),                // extra info (product count, user id, etc)
  createdAt: timestamp("created_at").defaultNow(),
});

export type ApiUsageLog = typeof apiUsageLogs.$inferSelect;

// ─── Waitlist ───

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  source: text("source").default("landing"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Zod schemas and types
export const insertWaitlistEntrySchema = createInsertSchema(waitlistEntries).omit({ id: true, createdAt: true });
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export const insertBrandSchema = createInsertSchema(brands).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductVariantSchema = createInsertSchema(productVariants).omit({ id: true });
export const insertProductImageSchema = createInsertSchema(productImages).omit({ id: true });
export const insertProductTagSchema = createInsertSchema(productTags).omit({ id: true });
export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({ id: true, createdAt: true });
export const insertBrandIntegrationSchema = createInsertSchema(brandIntegrations).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertTryonResultSchema = createInsertSchema(tryonResults).omit({ id: true, createdAt: true });
export const insertProductClickSchema = createInsertSchema(productClicks).omit({ id: true, clickedAt: true });
export const insertCollectionSchema = createInsertSchema(collections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCollectionItemSchema = createInsertSchema(collectionItems).omit({ id: true, addedAt: true });
export const insertUserAddressSchema = createInsertSchema(userAddresses).omit({ id: true, createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true, paidAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertBrandOrderSchema = createInsertSchema(brandOrders).omit({ id: true, createdAt: true, updatedAt: true });

export type Category = typeof categories.$inferSelect;
export type Brand = typeof brands.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductTag = typeof productTags.$inferSelect;
export type SearchQuery = typeof searchQueries.$inferSelect;
export type BrandIntegration = typeof brandIntegrations.$inferSelect;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type TryonResult = typeof tryonResults.$inferSelect;
export type ProductClick = typeof productClicks.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type CollectionItem = typeof collectionItems.$inferSelect;
export type UserAddress = typeof userAddresses.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type BrandOrder = typeof brandOrders.$inferSelect;
export type BrandPaymentAccount = typeof brandPaymentAccounts.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;

export * from "./models/chat";
