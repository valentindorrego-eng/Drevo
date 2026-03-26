import express, { type Request, type Response } from "express";
import { db } from "./db";
import {
  orders, orderItems, brandOrders, userAddresses, products, productVariants,
  brands, brandIntegrations, brandPaymentAccounts,
  type User,
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

function getAuthUser(req: Request): User {
  return req.user as User;
}

function requireAuth(req: Request, res: Response, next: express.NextFunction) {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }
  next();
}

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DRV-${ts}-${rand}`;
}

const DEFAULT_COMMISSION_RATE = 0.15; // 15% commission

export function registerCheckoutRoutes(app: express.Express) {

  // ─── User Addresses ───

  app.get("/api/addresses", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const addresses = await db.select().from(userAddresses)
        .where(eq(userAddresses.userId, userId))
        .orderBy(desc(userAddresses.createdAt));
      res.json(addresses);
    } catch (error) {
      console.error("Get addresses error:", error);
      res.status(500).json({ message: "Error al obtener direcciones" });
    }
  });

  app.post("/api/addresses", requireAuth, async (req, res) => {
    try {
      const userId = getAuthUser(req).id;
      const { fullName, phone, street, streetNumber, floor, city, province, postalCode, isDefault } = req.body;

      if (!fullName || !street || !streetNumber || !city || !province || !postalCode) {
        return res.status(400).json({ message: "Faltan campos requeridos" });
      }

      // If setting as default, unset previous defaults
      if (isDefault) {
        await db.update(userAddresses)
          .set({ isDefault: false })
          .where(eq(userAddresses.userId, userId));
      }

      const [address] = await db.insert(userAddresses).values({
        userId, fullName, phone, street, streetNumber, floor, city, province, postalCode, isDefault: isDefault || false,
      }).returning();

      res.json(address);
    } catch (error) {
      console.error("Create address error:", error);
      res.status(500).json({ message: "Error al crear dirección" });
    }
  });

  // ─── Create Order + MercadoPago Preference ───

  app.post("/api/checkout/create", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const { items, addressId } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "El carrito está vacío" });
      }

      // Validate products exist and get current prices from DB
      const productIds = items.map((i: any) => i.id);
      const dbProducts = await db.select().from(products).where(inArray(products.id, productIds));
      const dbBrands = await db.select().from(brands);

      if (dbProducts.length !== new Set(productIds).size) {
        return res.status(400).json({ message: "Algunos productos no existen" });
      }

      // Get address if provided
      let address = null;
      if (addressId) {
        const [addr] = await db.select().from(userAddresses).where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, user.id))
        );
        address = addr || null;
      }

      // Build order items with verified prices
      const verifiedItems: Array<{
        productId: string; variantId: string | null; brandId: string | null;
        title: string; sizeLabel: string; quantity: number;
        unitPrice: number; totalPrice: number; imageUrl: string;
      }> = [];

      for (const cartItem of items) {
        const dbProduct = dbProducts.find(p => p.id === cartItem.id);
        if (!dbProduct) continue;

        const price = dbProduct.salePrice ? Number(dbProduct.salePrice) : Number(dbProduct.basePrice);
        verifiedItems.push({
          productId: dbProduct.id,
          variantId: cartItem.variantId || null,
          brandId: dbProduct.brandId,
          title: dbProduct.title,
          sizeLabel: cartItem.sizeLabel || "Único",
          quantity: cartItem.quantity || 1,
          unitPrice: price,
          totalPrice: price * (cartItem.quantity || 1),
          imageUrl: cartItem.imageUrl || "",
        });
      }

      const subtotal = verifiedItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const commissionTotal = Math.round(subtotal * DEFAULT_COMMISSION_RATE * 100) / 100;
      const total = subtotal; // shipping calculated separately

      // Create the order
      const orderNumber = generateOrderNumber();
      const [order] = await db.insert(orders).values({
        orderNumber,
        userId: user.id,
        addressId: addressId || null,
        subtotal: subtotal.toFixed(2),
        commissionTotal: commissionTotal.toFixed(2),
        total: total.toFixed(2),
        currency: "ARS",
        customerEmail: user.email,
        customerName: user.displayName || user.email,
        shippingAddress: address ? {
          fullName: address.fullName, street: address.street,
          streetNumber: address.streetNumber, floor: address.floor,
          city: address.city, province: address.province,
          postalCode: address.postalCode, country: address.country,
        } : null,
      }).returning();

      // Insert order items
      for (const item of verifiedItems) {
        await db.insert(orderItems).values({
          orderId: order.id,
          productId: item.productId,
          variantId: item.variantId,
          brandId: item.brandId,
          title: item.title,
          sizeLabel: item.sizeLabel,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          totalPrice: item.totalPrice.toFixed(2),
          imageUrl: item.imageUrl,
        });
      }

      // Group items by brand and create brand sub-orders (skip items without a valid brandId)
      const brandGroups = new Map<string, typeof verifiedItems>();
      for (const item of verifiedItems) {
        if (!item.brandId) continue;
        if (!brandGroups.has(item.brandId)) brandGroups.set(item.brandId, []);
        brandGroups.get(item.brandId)!.push(item);
      }

      for (const [brandId, brandItems] of Array.from(brandGroups.entries())) {
        const brandSubtotal = brandItems.reduce((s: number, i: any) => s + i.totalPrice, 0);
        const brand = dbBrands.find(b => b.id === brandId);
        const rate = brand?.commissionRate ? Number(brand.commissionRate) : DEFAULT_COMMISSION_RATE;
        const commission = Math.round(brandSubtotal * rate * 100) / 100;
        const payout = brandSubtotal - commission;

        await db.insert(brandOrders).values({
          orderId: order.id,
          brandId,
          subtotal: brandSubtotal.toFixed(2),
          commissionAmount: commission.toFixed(2),
          brandPayout: payout.toFixed(2),
        });
      }

      // Create MercadoPago preference
      if (!process.env.MP_ACCESS_TOKEN) {
        // No MP configured — return order without payment link (for testing)
        return res.json({
          orderId: order.id,
          orderNumber: order.orderNumber,
          total,
          paymentUrl: null,
          message: "Orden creada (MercadoPago no configurado)",
        });
      }

      const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
      const preference = new Preference(mpClient);

      const mpItems = verifiedItems.map(item => ({
        id: item.productId,
        title: item.title.substring(0, 256),
        quantity: item.quantity,
        unit_price: item.unitPrice,
        currency_id: "ARS" as const,
      }));

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

      const mpPreference = await preference.create({
        body: {
          items: mpItems,
          payer: {
            email: user.email,
            name: user.displayName || undefined,
          },
          back_urls: {
            success: `${baseUrl}/order/${order.id}?status=success`,
            failure: `${baseUrl}/order/${order.id}?status=failure`,
            pending: `${baseUrl}/order/${order.id}?status=pending`,
          },
          auto_return: "approved",
          external_reference: order.id,
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
          statement_descriptor: "DREVO",
        },
      });

      // Save preference ID
      await db.update(orders)
        .set({ mpPreferenceId: mpPreference.id })
        .where(eq(orders.id, order.id));

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        total,
        paymentUrl: mpPreference.init_point,
        sandboxUrl: mpPreference.sandbox_init_point,
      });

    } catch (error) {
      console.error("Checkout create error:", error);
      res.status(500).json({ message: "Error al crear la orden" });
    }
  });

  // ─── MercadoPago Webhook ───

  app.post("/api/webhooks/mercadopago", async (req, res) => {
    try {
      const { type, data } = req.body;

      if (type === "payment") {
        const paymentId = data?.id;
        if (!paymentId || !process.env.MP_ACCESS_TOKEN) {
          return res.sendStatus(200);
        }

        const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const payment = new Payment(mpClient);
        const paymentInfo = await payment.get({ id: paymentId });

        const orderId = paymentInfo.external_reference;
        if (!orderId) return res.sendStatus(200);

        const mpStatus = paymentInfo.status; // approved, pending, rejected, etc.
        let paymentStatus = "pending";
        let orderStatus = "pending";

        if (mpStatus === "approved") {
          paymentStatus = "approved";
          orderStatus = "paid";
        } else if (mpStatus === "rejected" || mpStatus === "cancelled") {
          paymentStatus = "rejected";
          orderStatus = "cancelled";
        } else if (mpStatus === "in_process" || mpStatus === "pending") {
          paymentStatus = "pending";
        }

        await db.update(orders).set({
          paymentStatus,
          status: orderStatus,
          mpPaymentId: String(paymentId),
          paidAt: mpStatus === "approved" ? new Date() : undefined,
          updatedAt: new Date(),
        }).where(eq(orders.id, orderId));

        // If paid, trigger brand order creation (fan-out to Tiendanube)
        if (mpStatus === "approved") {
          fanOutBrandOrders(orderId).catch(err =>
            console.error("Brand order fan-out error:", err)
          );
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error("MP webhook error:", error);
      res.sendStatus(200); // Always return 200 to MP
    }
  });

  // ─── Get Order ───

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const orderId = String(req.params.id);
      const [order] = await db.select().from(orders).where(
        and(eq(orders.id, orderId), eq(orders.userId, user.id))
      );

      if (!order) return res.status(404).json({ message: "Orden no encontrada" });

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      const subOrders = await db.select().from(brandOrders).where(eq(brandOrders.orderId, order.id));

      // Enrich brand orders with brand names
      const brandIds = subOrders.map(s => s.brandId).filter(Boolean);
      const brandList = brandIds.length > 0
        ? await db.select().from(brands).where(inArray(brands.id, brandIds))
        : [];

      const enrichedSubOrders = subOrders.map(so => ({
        ...so,
        brandName: brandList.find(b => b.id === so.brandId)?.name || "Marca desconocida",
      }));

      res.json({ ...order, items, brandOrders: enrichedSubOrders });
    } catch (error) {
      console.error("Get order error:", error);
      res.status(500).json({ message: "Error al obtener la orden" });
    }
  });

  // ─── User Orders List ───

  app.get("/api/orders", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const userOrders = await db.select().from(orders)
        .where(eq(orders.userId, user.id))
        .orderBy(desc(orders.createdAt));

      res.json(userOrders);
    } catch (error) {
      console.error("List orders error:", error);
      res.status(500).json({ message: "Error al listar órdenes" });
    }
  });
}

// ─── Fan-out: Create orders in each brand's Tiendanube store ───

async function fanOutBrandOrders(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== "paid") return;

  const subOrders = await db.select().from(brandOrders).where(eq(brandOrders.orderId, orderId));
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  for (const subOrder of subOrders) {
    try {
      // Find brand's Tiendanube integration
      const [integration] = await db.select().from(brandIntegrations)
        .where(eq(brandIntegrations.provider, "tiendanube"));
      // TODO: filter by brandId when brandIntegrations has brandId column

      if (!integration) {
        console.log(`No Tiendanube integration for brand ${subOrder.brandId}, skipping fan-out`);
        await db.update(brandOrders).set({ status: "pending", updatedAt: new Date() })
          .where(eq(brandOrders.id, subOrder.id));
        continue;
      }

      const brandItems = items.filter(i => i.brandId === subOrder.brandId);
      const shippingAddr = order.shippingAddress as any;

      // Get variant external IDs for Tiendanube
      const variantIds = brandItems.filter(i => i.variantId).map(i => i.variantId!);
      const variants = variantIds.length > 0
        ? await db.select().from(productVariants).where(inArray(productVariants.id, variantIds))
        : [];

      // Get product external IDs
      const prodIds = brandItems.map(i => i.productId);
      const prods = await db.select().from(products).where(inArray(products.id, prodIds));

      // Build Tiendanube order payload
      const tnProducts = brandItems.map(item => {
        const prod = prods.find(p => p.id === item.productId);
        const variant = variants.find(v => v.id === item.variantId);
        return {
          variant_id: prod?.externalId ? Number(prod.externalId) : undefined,
          quantity: item.quantity,
          price: item.unitPrice,
        };
      }).filter(p => p.variant_id);

      if (tnProducts.length === 0) {
        console.log(`No external products for brand order ${subOrder.id}, marking as created`);
        await db.update(brandOrders).set({ status: "created", updatedAt: new Date() })
          .where(eq(brandOrders.id, subOrder.id));
        continue;
      }

      const tnPayload = {
        products: tnProducts,
        customer: {
          name: order.customerName || "",
          email: order.customerEmail || "",
        },
        shipping_address: shippingAddr ? {
          address: `${shippingAddr.street} ${shippingAddr.streetNumber}`,
          city: shippingAddr.city,
          province: shippingAddr.province,
          zipcode: shippingAddr.postalCode,
          country: shippingAddr.country || "AR",
          floor: shippingAddr.floor || "",
        } : undefined,
        payment_status: "paid",
        note: `Orden DREVO #${order.orderNumber}`,
      };

      const tnRes = await fetch(
        `https://api.tiendanube.com/v1/${integration.storeId}/orders`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authentication": `bearer ${integration.accessToken}`,
            "User-Agent": "DREVO (drevo.replit.app)",
          },
          body: JSON.stringify(tnPayload),
        }
      );

      if (tnRes.ok) {
        const tnOrder = await tnRes.json();
        await db.update(brandOrders).set({
          externalOrderId: String(tnOrder.id),
          status: "created",
          updatedAt: new Date(),
        }).where(eq(brandOrders.id, subOrder.id));
        console.log(`Created Tiendanube order ${tnOrder.id} for brand order ${subOrder.id}`);
      } else {
        const errText = await tnRes.text();
        console.error(`Tiendanube order creation failed for brand ${subOrder.brandId}:`, errText);
        await db.update(brandOrders).set({ status: "pending", updatedAt: new Date() })
          .where(eq(brandOrders.id, subOrder.id));
      }
    } catch (err) {
      console.error(`Fan-out error for brand order ${subOrder.id}:`, err);
    }
  }

  // Update main order status to processing
  await db.update(orders).set({ status: "processing", updatedAt: new Date() })
    .where(eq(orders.id, orderId));
}
