import express, { type Request, type Response, type NextFunction } from "express";
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db, pool } from "./db";
import { products, brands, categories, productImages, productVariants, productTags, productEmbeddings, brandIntegrations, waitlistEntries, type User } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { passport } from "./auth";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";

function getAuthUser(req: Request): User {
  return req.user as User;
}

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const tryonRateLimit = new Map<string, number[]>();
const TRYON_RATE_WINDOW_MS = 60 * 60 * 1000;
const TRYON_RATE_MAX = 5;

function checkTryonRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = (tryonRateLimit.get(userId) || []).filter(t => now - t < TRYON_RATE_WINDOW_MS);
  if (timestamps.length >= TRYON_RATE_MAX) {
    tryonRateLimit.set(userId, timestamps);
    return false;
  }
  timestamps.push(now);
  tryonRateLimit.set(userId, timestamps);
  return true;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ message: "No autenticado" });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Waitlist ───

  app.post("/api/waitlist", async (req, res) => {
    try {
      const { email, source } = req.body;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Email inválido" });
      }
      const existing = await db.select().from(waitlistEntries).where(eq(waitlistEntries.email, email.toLowerCase().trim()));
      if (existing.length > 0) {
        return res.json({ message: "already_registered", success: true });
      }
      await db.insert(waitlistEntries).values({ email: email.toLowerCase().trim(), source: source || "landing" });
      const count = await db.select({ count: sql<number>`count(*)` }).from(waitlistEntries);
      res.json({ success: true, position: Number(count[0].count) });
    } catch (error) {
      console.error("Waitlist error:", error);
      res.status(500).json({ message: "Error al registrar" });
    }
  });

  app.get("/api/waitlist/count", async (_req, res) => {
    try {
      const count = await db.select({ count: sql<number>`count(*)` }).from(waitlistEntries);
      res.json({ count: Number(count[0].count) });
    } catch (error) {
      res.status(500).json({ count: 0 });
    }
  });

  // ─── Auth Routes ───

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email y contraseña son obligatorios" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
      }
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Ya existe una cuenta con este email" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({ email, passwordHash, displayName: displayName || null });
      (req.session as any).passport = { user: user.id };
      req.session.save((saveErr) => {
        if (saveErr) console.error("Session save error:", saveErr);
        const { passwordHash: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return res.status(500).json({ message: "Error interno" });
      if (!user) return res.status(401).json({ message: info?.message || "Credenciales inválidas" });
      (req.session as any).passport = { user: user.id };
      req.session.save((saveErr) => {
        if (saveErr) console.error("Session save error:", saveErr);
        const { passwordHash: _, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Error al cerrar sesión" });
      req.session.destroy((destroyErr) => {
        if (destroyErr) return res.status(500).json({ message: "Error al cerrar sesión" });
        res.clearCookie("connect.sid");
        res.json({ message: "Sesión cerrada" });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "No autenticado" });
    }
    const { passwordHash: _, ...safeUser } = req.user;
    res.json(safeUser);
  });

  const profileSchema = z.object({
    displayName: z.string().max(100).optional(),
    preferredSize: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
    heightCm: z.number().int().min(100).max(250).nullable().optional(),
    weightKg: z.number().int().min(30).max(300).nullable().optional(),
    bodyType: z.enum(["ectomorph", "mesomorph", "endomorph"]).optional(),
  });

  app.put("/api/auth/profile", requireAuth, async (req, res) => {
    try {
      const parsed = profileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Datos inválidos", errors: parsed.error.flatten().fieldErrors });
      }
      const { displayName, preferredSize, heightCm, weightKg, bodyType } = parsed.data;
      const updated = await storage.updateUser(getAuthUser(req).id, {
        displayName,
        preferredSize,
        heightCm: heightCm ?? null,
        weightKg: weightKg ?? null,
        bodyType,
      });
      if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Error al actualizar perfil" });
    }
  });

  const tryonDir = path.join(process.cwd(), "uploads", "tryon");
  if (!fs.existsSync(tryonDir)) {
    fs.mkdirSync(tryonDir, { recursive: true });
  }
  const uploadsDir = path.join(process.cwd(), "uploads", "avatars");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const mimeToExt: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };

  const avatarUpload = multer({
    storage: multer.diskStorage({
      destination: uploadsDir,
      filename: (_req, file, cb) => {
        const ext = mimeToExt[file.mimetype] || ".jpg";
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype in mimeToExt);
    },
  });

  app.post("/api/auth/avatar", requireAuth, avatarUpload.single("avatar"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se subió ninguna imagen" });
      }
      const profileImageUrl = `/uploads/avatars/${req.file.filename}`;
      const updated = await storage.updateUser(getAuthUser(req).id, { profileImageUrl });
      if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ message: "Error al subir la imagen" });
    }
  });

  const fullBodyUpload = multer({
    storage: multer.diskStorage({
      destination: path.join(process.cwd(), "uploads", "avatars"),
      filename: (_req, file, cb) => {
        const ext = mimeToExt[file.mimetype] || ".jpg";
        cb(null, `fullbody-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype in mimeToExt);
    },
  });

  app.post("/api/auth/fullbody", requireAuth, fullBodyUpload.single("fullbody"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se subió ninguna imagen" });
      }
      const fullBodyImageUrl = `/uploads/avatars/${req.file.filename}`;
      const updated = await storage.updateUser(getAuthUser(req).id, { fullBodyImageUrl });
      if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      console.error("Full body upload error:", error);
      res.status(500).json({ message: "Error al subir la imagen" });
    }
  });

  app.use("/uploads/tryon", requireAuth, express.static(path.join(process.cwd(), "uploads", "tryon")));
  app.use("/uploads/avatars", requireAuth, express.static(path.join(process.cwd(), "uploads", "avatars")));

  const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  app.get("/api/auth/config", (_req, res) => {
    res.json({ googleEnabled });
  });

  if (googleEnabled) {
    app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
    app.get("/auth/google/callback",
      passport.authenticate("google", { failureRedirect: "/auth?error=google_failed" }),
      (_req, res) => { res.redirect("/profile"); }
    );
  }

  // ─── Tiendanube OAuth Routes ───
  app.get("/auth/tiendanube/start", (req, res) => {
    const clientId = process.env.TIENDANUBE_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send("Falta TIENDANUBE_CLIENT_ID en Secrets");
    }
    const host = req.get("host") || "localhost";
    const protocol = req.protocol || "https";
    const redirectUri = `${protocol}://${host}/auth/tiendanube/callback`;

    const state = Math.random().toString(36).substring(7);
    const params = new URLSearchParams({ state, redirect_uri: redirectUri });
    const authUrl = `https://www.tiendanube.com/apps/${clientId}/authorize?${params.toString()}`;
    console.log("[TN OAuth] Redirecting to:", authUrl);
    console.log("[TN OAuth] redirect_uri:", redirectUri);
    res.redirect(authUrl);
  });

  app.get("/api/integrations", requireAuth, async (req, res) => {
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
    console.log("[TN Callback] Received. Query params:", req.query);

    if (!code) {
      console.error("[TN Callback] No code received. Full query:", req.query);
      return res.redirect(`/connect?error=no_code`);
    }

    try {
      const tokenPayload = {
        client_id: process.env.TIENDANUBE_CLIENT_ID,
        client_secret: process.env.TIENDANUBE_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: String(code),
      };
      console.log("[TN Callback] Exchanging code for token...");

      const response = await fetch("https://www.tiendanube.com/apps/authorize/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenPayload),
      });

      const responseText = await response.text();
      console.log("[TN Callback] Token response status:", response.status);
      console.log("[TN Callback] Token response body:", responseText);

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error("[TN Callback] Could not parse token response as JSON");
        return res.redirect(`/connect?error=invalid_response`);
      }

      if (!response.ok || !data.access_token) {
        console.error("[TN Callback] Token exchange failed:", data);
        return res.redirect(`/connect?error=token_failed&detail=${encodeURIComponent(JSON.stringify(data))}`);
      }

      // Tiendanube returns access_token and user_id (= store_id)
      const { access_token, user_id } = data;
      console.log("[TN Callback] Success! store_id (user_id):", user_id);

      const storeIdStr = user_id ? String(user_id) : null;
      const existing = await db.select().from(brandIntegrations)
        .where(sql`provider = 'tiendanube' AND store_id = ${storeIdStr}`);
      if (existing.length > 0) {
        await db.update(brandIntegrations)
          .set({ accessToken: access_token })
          .where(eq(brandIntegrations.id, existing[0].id));
      } else {
        await db.insert(brandIntegrations).values({
          provider: "tiendanube",
          storeId: storeIdStr,
          accessToken: access_token,
        });
      }

      res.redirect(`/connect?connected=1&store_id=${user_id ?? ""}`);
    } catch (error) {
      console.error("[TN Callback] Unexpected error:", error);
      res.redirect(`/connect?error=server_error`);
    }
  });

  app.post(api.search.searchProducts.path, async (req, res) => {
    try {
      const input = api.search.searchProducts.input.parse(req.body);
      const query = input.query.toLowerCase();
      const authenticatedUser = req.user as Express.User | undefined;
      const userSize = authenticatedUser?.preferredSize || input.userSize || null;
      const sizeFilterEnabled = input.sizeFilterEnabled !== false && !!userSize;
      
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
                content: `You are a fashion search intent extractor for DREVO, a fashion marketplace for Argentina/LATAM. Parse the user query into JSON.

RULES:
- If the query mentions 2+ different garment types (e.g. "remera y pantalón"), set intent_type to "outfit"
- For outfit queries, must_include should be an array where EACH entry is a COMPLETE search phrase for one garment, including its color/pattern. Example: "remera gris con estampa blanca y bermuda negra" → must_include: ["remera gris con estampa blanca", "bermuda negra"]
- colors.primary = ALL colors mentioned in the query (both Spanish and English)
- colors.secondary = colors that are secondary/accent (e.g. the print color, not the base)
- exclude = things the user explicitly doesn't want (e.g. "no deportiva" → ["deportiva"])
- If the user's preferred size is provided (e.g. [User preferred size: M]), consider it as context for better matching but do NOT add it to the JSON output
- If user style preferences are provided, use them to better understand the query context and improve style_tags and occasion detection

Contexto de ocasiones en Argentina/LATAM que debés entender:
- "asado familiar" / "asado" → casual, cómodo, colores neutros o vibrantes, sin ropa muy formal. Similar a "backyard party" en USA.
- "after office" / "after" → transición trabajo a noche, semi-formal, versátil, no demasiado casual ni demasiado elegante.
- "cumpleaños de 15" / "fiesta de 15" → elegante, festivo, puede ser vestido de noche o look muy producido. Alta importancia de la ocasión.
- "boliche" / "antro" → nocturno, atrevido, brillos, tendencia, similar a "clubbing".
- "facultad" / "universidad" → casual, cómodo, práctico, streetwear amigable.
- "primer día de trabajo" → profesional pero no excesivamente formal, smart casual moderno.
- "vacaciones en la costa" / "playa argentina" → veraniego, casual, colores claros, playero pero no solo traje de baño.
- "casamiento" como invitado → elegante, festivo, NO blanco ni negro puro (por convención argentina), colores vibrantes o pasteles.
Usá este contexto para enriquecer la detección de ocasión y estilo.

JSON schema:
{
  "query_language": "es" | "en",
  "intent_type": "outfit" | "single_item",
  "occasion": "noche" | "oficina" | "gym" | "casual" | "cena" | "viaje" | "playa" | "asado" | "after_office" | "boliche" | "casamiento" | "facultad" | null,
  "style_tags": string[],
  "colors": {"primary": string[], "secondary": string[]},
  "must_include": string[],
  "exclude": string[],
  "budget": {"min": number | null, "max": number | null},
  "gender": "men" | "women" | "unisex" | null,
  "preferred_categories": string[]
}
Reply with ONLY valid JSON, no explanation.` 
              },
              { role: "user", content: (() => {
                let userMessage = input.query;
                if (userSize) userMessage += `\n\n[User preferred size: ${userSize}]`;
                const u = authenticatedUser as User;
                if (u?.stylePassportCompleted) {
                  const prefs: string[] = [];
                  if (u.styleVibes?.length) prefs.push(`Estilo preferido: ${u.styleVibes.join(", ")}`);
                  if (u.ocasionesFrecuentes?.length) prefs.push(`Compra para: ${u.ocasionesFrecuentes.join(", ")}`);
                  if (u.presupuestoRango) prefs.push(`Presupuesto: ${u.presupuestoRango}`);
                  if (u.coloresEvitar?.length) prefs.push(`Evita colores: ${u.coloresEvitar.join(", ")}`);
                  if (u.estilosEvitar?.length) prefs.push(`Evita estilos: ${u.estilosEvitar.join(", ")}`);
                  if (prefs.length > 0) userMessage += `\n\n[User style preferences: ${prefs.join(". ")}. Priorizá resultados acordes.]`;
                }
                return userMessage;
              })() }
            ]
          });
          const aiIntent = JSON.parse(completion.choices[0].message?.content || "{}");
          intent = { ...intent, ...aiIntent };
        } catch (e) {
          console.error("OpenAI Intent Error:", e);
        }
      }

      // Color heuristics — español/inglés
      const colorMap: Record<string, string> = {
        negro: "black", black: "black", blanco: "white", white: "white",
        rojo: "red", red: "red", azul: "blue", blue: "blue",
        verde: "green", green: "green", gris: "grey", grey: "grey", gray: "grey",
        rosa: "pink", pink: "pink", naranja: "orange", orange: "orange",
        amarillo: "yellow", yellow: "yellow", marron: "brown", brown: "brown",
        beige: "beige", crudo: "beige", celeste: "lightblue",
        bordo: "burgundy", burgundy: "burgundy", lila: "purple", purple: "purple",
        coral: "coral", navy: "navy", militar: "olive", olive: "olive",
      };
      for (const [word, normalized] of Object.entries(colorMap)) {
        if (query.includes(word) && !intent.colors.primary.includes(normalized)) {
          intent.colors.primary.push(normalized);
        }
      }

      // Occasion heuristics
      const occasionMap: Record<string, string> = {
        noche: "noche", night: "noche", fiesta: "noche", party: "noche", boliche: "noche",
        oficina: "oficina", trabajo: "oficina", office: "oficina", reunión: "oficina", reunion: "oficina",
        gym: "gym", gimnasio: "gym", entreno: "gym", training: "gym", deporte: "gym",
        casual: "casual", finde: "casual", weekend: "casual", relax: "casual",
        cena: "cena", dinner: "cena", cocktail: "cena", evento: "cena",
        viaje: "viaje", travel: "viaje", vacaciones: "viaje",
        playa: "playa", beach: "playa", verano: "playa",
      };
      for (const [word, occ] of Object.entries(occasionMap)) {
        if (query.includes(word) && !intent.occasion) {
          intent.occasion = occ;
        }
      }

      // Gender heuristics
      if (!intent.gender) {
        if (query.match(/\b(hombre|masculino|men|male|él)\b/)) intent.gender = "men";
        else if (query.match(/\b(mujer|femenino|women|female|ella)\b/)) intent.gender = "women";
      }

      // Style heuristics
      const styleKeywords = ["minimal", "minimalista", "elegante", "urbano", "streetwear", "oversize", "clasico", "clásico", "deportivo", "formal", "bohemio", "vintage"];
      for (const style of styleKeywords) {
        if (query.includes(style) && !intent.style_tags.includes(style)) {
          intent.style_tags.push(style);
        }
      }

      // Generate embedding in parallel with storage (don't wait for intent — embedding is query-based)
      let embedding: number[] = [];
      const [, embResult] = await Promise.all([
        storage.createSearchQuery(input.query, intent),
        openai ? openai.embeddings.create({
          model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
          input: input.query,
        }).catch(e => { console.error("OpenAI Embedding Error:", e); return null; }) : Promise.resolve(null),
      ]);
      if (embResult) embedding = embResult.data[0].embedding;

      let candidates: any[] = [];
      let similarities = new Map<string, number>();

      const doVectorSearch = async (queryText: string, limit: number = 40) => {
        if (!openai) return [];
        try {
          const embRes = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            input: queryText,
          });
          const embStr = `[${embRes.data[0].embedding.join(',')}]`;
          const matches = await pool.query(
            `SELECT * FROM match_products($1::vector(1536), $2, 0.1)`,
            [embStr, limit]
          );
          const productIds = matches.rows.map((r: any) => r.product_id);
          const productsData = await storage.getProductsByIds(productIds);
          return productsData.map(p => {
            const sim = matches.rows.find((r: any) => r.product_id === p.id)?.similarity || 0;
            return { product: p, similarity: sim };
          });
        } catch (e) {
          console.error("Vector search error:", e);
          return [];
        }
      };

      if (intent.intent_type === "outfit" && intent.must_include?.length > 1) {
        const seenIds = new Set<string>();
        // Parallelize all outfit item searches + main query fallback
        const allSearches = await Promise.all([
          ...intent.must_include.map((itemQuery: string) => doVectorSearch(itemQuery, 20)),
          doVectorSearch(input.query, 40), // pre-fetch fallback in parallel
        ]);
        const fallbackResults = allSearches.pop()!;
        for (const results of allSearches) {
          for (const r of results) {
            if (!seenIds.has(r.product.id)) {
              seenIds.add(r.product.id);
              candidates.push(r.product);
              similarities.set(r.product.id, r.similarity);
            }
          }
        }
        if (candidates.length < 10) {
          for (const r of fallbackResults) {
            if (!seenIds.has(r.product.id)) {
              seenIds.add(r.product.id);
              candidates.push(r.product);
              similarities.set(r.product.id, r.similarity);
            }
          }
        }
      } else if (embedding.length > 0) {
        try {
          const embeddingStr = `[${embedding.join(',')}]`;
          const matches = await pool.query(
            `SELECT * FROM match_products($1::vector(1536), 40, 0.1)`, 
            [embeddingStr]
          );
          const productIds = matches.rows.map((r: any) => r.product_id);
          const productsData = await storage.getProductsByIds(productIds);
          candidates = productsData.map(p => {
            const similarity = matches.rows.find((r: any) => r.product_id === p.id)?.similarity || 0;
            similarities.set(p.id, similarity);
            return p;
          });
        } catch (e) {
          console.error("Vector search failed:", e);
        }
      }

      if (candidates.length === 0) {
        candidates = (await storage.getProducts()).filter(p => p.status === 'active').slice(0, 40);
      }

      // Reverse color map for display names
      const colorDisplayName: Record<string, string> = {
        black: "negro", white: "blanco", red: "rojo", blue: "azul",
        green: "verde", grey: "gris", pink: "rosa", orange: "naranja",
        yellow: "amarillo", brown: "marrón", beige: "beige", lightblue: "celeste",
        burgundy: "bordó", purple: "lila", coral: "coral", navy: "navy", olive: "militar",
      };

      // Occasion keyword sets for matching product text
      const occasionKeywords: Record<string, string[]> = {
        noche: ["night", "noche", "party", "fiesta", "urban", "elegante", "cocktail", "glamour"],
        oficina: ["office", "oficina", "formal", "trabajo", "classic", "profesional"],
        gym: ["gym", "sport", "training", "deporte", "fitness", "running", "padel"],
        casual: ["casual", "daily", "everyday", "relax", "weekend", "cómodo", "comodo"],
        cena: ["dinner", "cena", "elegante", "cocktail", "evento", "night"],
        viaje: ["travel", "viaje", "lightweight", "versatile", "cómodo", "comodo"],
        playa: ["beach", "playa", "summer", "verano", "swim", "sol"],
      };

      // Re-ranking with improved scoring
      const scoredResults = candidates.map(p => {
        const similarity = similarities.get(p.id) || 0.5;
        let score = similarity * 0.60;
        const reasons: string[] = [];

        const pText = `${p.title} ${p.description} ${p.tags.map((t: any) => t.tag).join(" ")}`.toLowerCase();

        // Color matching — check all color synonyms
        const allColorWords: Record<string, string[]> = {
          black: ["black", "negro"], white: ["white", "blanco"], red: ["red", "rojo"],
          blue: ["blue", "azul"], green: ["green", "verde"], grey: ["grey", "gray", "gris"],
          pink: ["pink", "rosa"], orange: ["orange", "naranja"], yellow: ["yellow", "amarillo"],
          brown: ["brown", "marron", "marrón"], beige: ["beige", "crudo"], lightblue: ["celeste", "light blue"],
          burgundy: ["burgundy", "bordo", "bordó"], purple: ["purple", "lila", "violeta"],
          coral: ["coral"], navy: ["navy"], olive: ["olive", "militar"],
        };

        intent.colors.primary.forEach((color: string) => {
          const synonyms = allColorWords[color] || [color];
          if (synonyms.some(s => pText.includes(s))) {
            score += 0.25;
            reasons.push(`Color ${colorDisplayName[color] || color}`);
          } else {
            score -= 0.10;
          }
        });
        if (intent.colors.secondary) {
          intent.colors.secondary.forEach((color: string) => {
            const synonyms = allColorWords[color] || [color];
            if (synonyms.some(s => pText.includes(s))) {
              score += 0.12;
              reasons.push(`Color ${colorDisplayName[color] || color}`);
            }
          });
        }

        // Occasion matching — expanded
        if (intent.occasion && occasionKeywords[intent.occasion]) {
          const keywords = occasionKeywords[intent.occasion];
          if (keywords.some(kw => pText.includes(kw))) {
            score += 0.10;
            reasons.push(`Ideal para ${intent.occasion}`);
          }
        }

        // Gender matching
        if (intent.gender && p.gender) {
          if (p.gender === intent.gender) {
            score += 0.05;
          } else if (p.gender === "unisex") {
            const pTagText = (p.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
            const wantsMenRerank = intent.gender === 'men' || intent.gender === 'male' || intent.gender === 'hombre';
            const wantsWomenRerank = intent.gender === 'women' || intent.gender === 'female' || intent.gender === 'mujer';
            const hasMujerTag = /\b(mujer|women|female|dama)\b/.test(pTagText);
            const hasHombreTag = /\b(hombre|men|male)\b/.test(pTagText);
            if (wantsMenRerank && hasMujerTag && !hasHombreTag) {
              score -= 0.30;
            } else if (wantsWomenRerank && hasHombreTag && !hasMujerTag) {
              score -= 0.30;
            } else {
              score += 0.03;
            }
          } else {
            score -= 0.15;
          }
        }

        // Budget matching
        const productPrice = Number(p.salePrice || p.basePrice);
        if (intent.budget?.max && productPrice > intent.budget.max) {
          score -= 0.10;
        }
        if (intent.budget?.min && intent.budget?.max && productPrice >= intent.budget.min && productPrice <= intent.budget.max) {
          score += 0.05;
          reasons.push("Dentro de tu presupuesto");
        }

        // Style matching
        intent.style_tags.forEach((style: string) => {
          if (pText.includes(style.toLowerCase())) {
            score += 0.06;
            reasons.push(`Estilo ${style}`);
          }
        });

        if (intent.exclude && intent.exclude.length > 0) {
          for (const excl of intent.exclude) {
            const exclLower = excl.toLowerCase();
            if (pText.includes(exclLower)) {
              score -= 0.25;
              break;
            }
            const exclSynonyms: Record<string, string[]> = {
              deportiva: ["deportivo", "deportiva", "sport", "padel", "gym", "training", "athletic", "fitness"],
              formal: ["formal", "elegante", "oficina", "traje"],
              casual: ["casual", "relax", "everyday"],
            };
            const syns = exclSynonyms[exclLower] || [exclLower];
            if (syns.some(s => pText.includes(s))) {
              score -= 0.25;
              break;
            }
          }
        }

        // Stock boost
        const hasStock = p.variants.some((v: any) => v.stockQty > 0);
        if (hasStock) score += 0.04;

        // Size filtering/penalization
        let hasUserSize = false;
        if (userSize && sizeFilterEnabled) {
          const sizeUpper = userSize.toUpperCase();
          hasUserSize = p.variants.some((v: any) => 
            v.sizeLabel?.toUpperCase() === sizeUpper && (v.stockQty === null || v.stockQty > 0)
          );
          if (!hasUserSize) {
            score -= 0.50;
          } else {
            score += 0.08;
            reasons.push(`Disponible en talle ${userSize}`);
          }
        }

        return {
          id: p.id,
          title: p.title,
          description: p.description,
          basePrice: Number(p.basePrice),
          salePrice: p.salePrice ? Number(p.salePrice) : null,
          currency: p.currency,
          gender: p.gender,
          categoryId: p.categoryId,
          brand: p.brand ? { name: p.brand.name, slug: p.brand.slug } : null,
          images: p.images.map((img: any) => ({ url: img.url, position: img.position })),
          variants: p.variants.map((v: any) => ({ sizeLabel: v.sizeLabel, stockQty: v.stockQty })),
          tags: p.tags.map((t: any) => t.tag),
          similarity: Math.max(0, Math.min(1, score)),
          reasons: Array.from(new Set(reasons)).slice(0, 3),
          _hasUserSize: hasUserSize,
        };
      }).sort((a, b) => b.similarity - a.similarity);

      interface ScoredProduct {
        id: string;
        title: string;
        description: string | null;
        basePrice: number;
        salePrice: number | null;
        currency: string | null;
        gender: string | null;
        categoryId: string | null;
        brand: { name: string; slug: string } | null;
        images: { url: string; position: number | null }[];
        variants: { sizeLabel: string | null; stockQty: number | null }[];
        tags: string[];
        similarity: number;
        reasons: string[];
        _hasUserSize: boolean;
        slot?: string;
      }

      const outfitBundles: { title: string; items: Omit<ScoredProduct, '_hasUserSize'>[] }[] = [];
      if (intent.intent_type === "outfit" && scoredResults.length >= 2) {
        const allCats = await db.select().from(categories);
        const catNameById = new Map(allCats.map(c => [c.id, c.name.toLowerCase()]));
        const catIdByName = new Map(allCats.map(c => [c.name.toLowerCase(), c.id]));

        const slotDefs: { name: string; catNames: string[]; keywords: RegExp; label: string }[] = [
          { name: "tops", catNames: ["tops"], keywords: /remera|camiseta|tee|camisa|top|polo|musculosa|chaleco|vest|crop|body/i, label: "Superior" },
          { name: "bottoms", catNames: ["bottoms"], keywords: /pant|jean|cargo|short|pollera|falda|calza|pantalon|pantalón|chino|jogger|bermuda/i, label: "Inferior" },
          { name: "outerwear", catNames: ["outerwear"], keywords: /campera|jacket|buzo|hoodie|sweater|abrigo|bomber/i, label: "Abrigo" },
          { name: "footwear", catNames: ["footwear"], keywords: /sneaker|shoe|zapa|bota|boot|sandal|chancla|calzado/i, label: "Calzado" },
          { name: "accessories", catNames: ["accessories"], keywords: /media|medias|sock|gorra|cap|hat|vincha|muñequera|mochila|bolso/i, label: "Accesorio" },
        ];

        const colorSynonyms: Record<string, string[]> = {
          negro: ["negro", "negra", "black"], blanco: ["blanco", "blanca", "white"],
          gris: ["gris", "grey", "gray"], beige: ["beige", "crudo", "arena"],
          marron: ["marron", "marrón", "brown", "chocolate"], azul: ["azul", "blue"],
          rojo: ["rojo", "roja", "red"], verde: ["verde", "green"],
          rosa: ["rosa", "pink"], celeste: ["celeste"], coral: ["coral"],
          bordo: ["bordo", "bordó", "burgundy", "borravino"],
          black: ["negro", "negra", "black"], white: ["blanco", "blanca", "white"],
          grey: ["gris", "grey"], brown: ["marron", "brown"],
        };

        const extractColorsFromPhrase = (phrase: string): string[] => {
          const lower = phrase.toLowerCase();
          const found: string[] = [];
          for (const [color, syns] of Object.entries(colorSynonyms)) {
            if (syns.some(s => lower.includes(s))) {
              for (const s of syns) { if (!found.includes(s)) found.push(s); }
            }
          }
          return found;
        };

        const detectSlot = (phrase: string): typeof slotDefs[number] | null => {
          const lower = phrase.toLowerCase();
          for (const slot of slotDefs) {
            if (slot.keywords.test(lower)) return slot;
          }
          return null;
        };

        const productColorScore = (p: any, colors: string[]): number => {
          if (colors.length === 0) return 1;
          const pTitle = p.title.toLowerCase();
          const pTags = (p.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
          let score = 0;
          for (const c of colors) {
            if (pTitle.includes(c)) score += 8;
            else if (pTags.includes(c)) score += 4;
          }
          return score;
        };
        const productMatchesColors = (p: any, colors: string[]): boolean => {
          return productColorScore(p, colors) > 0;
        };

        const intentGender = intent.gender || null;
        const productGenderScore = (p: any): number => {
          if (!intentGender) return 0;
          const pTitle = p.title.toLowerCase();
          const pTags = (p.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
          const allText = pTitle + ' ' + pTags;
          const wantsWomen = intentGender === 'women' || intentGender === 'female' || intentGender === 'mujer';
          const wantsMen = intentGender === 'men' || intentGender === 'male' || intentGender === 'hombre';

          if (wantsWomen) {
            if (/\b(hombre|men|male|masculin)\b/.test(allText) && !/\b(mujer|women|female|ladies|feminin|dama)\b/.test(allText)) return -15;
            if (/\b(mujer|women|female|ladies|feminin|dama)\b/.test(allText)) return 5;
          }
          if (wantsMen) {
            if (/\b(mujer|women|female|ladies|feminin|dama)\b/.test(allText) && !/\b(hombre|men|male|masculin)\b/.test(allText)) return -15;
            if (/\b(hombre|men|male|masculin)\b/.test(allText)) return 5;
          }
          return 0;
        };

        const usedIds = new Set<string>();
        const bundleItems: ScoredProduct[] = [];

        for (const mustItem of (intent.must_include || [])) {
          const slot = detectSlot(mustItem);
          if (!slot) continue;
          const itemColors = extractColorsFromPhrase(mustItem);

          const rawTypeWords = mustItem.toLowerCase().match(/remera|camiseta|camisa|musculosa|polo|top|falda|pollera|bermuda|short|pantalon|pantalón|jean|cargo|jogger|calza|campera|buzo|hoodie|sweater|zapatilla|bota|gorra|mochila|bolso|vestido/g) || [];
          const synonymMap: Record<string, string[]> = {
            remera: ["remera", "camiseta", "tee"],
            camiseta: ["camiseta", "remera", "tee"],
            falda: ["falda", "pollera"],
            pollera: ["pollera", "falda"],
            pantalon: ["pantalon", "pantalón"],
            "pantalón": ["pantalón", "pantalon"],
            zapatilla: ["zapatilla", "sneaker", "sneakers"],
            campera: ["campera", "jacket"],
            buzo: ["buzo", "hoodie"],
          };
          const exactTypeWords = Array.from(new Set<string>(rawTypeWords.flatMap((w: string) => synonymMap[w] || [w])));

          const slotCandidates = scoredResults.filter(r => {
            if (usedIds.has(r.id)) return false;
            const catName = catNameById.get(r.categoryId) || "";
            return slot.catNames.some(n => catName.includes(n)) || r.title.toLowerCase().match(slot.keywords);
          });
          slotCandidates.sort((a, b) => {
            const aTitle = a.title.toLowerCase();
            const bTitle = b.title.toLowerCase();
            const aTags = (a.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
            const bTags = (b.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
            const aExactType = exactTypeWords.some(w => aTitle.includes(w) || aTags.includes(w)) ? 10 : 0;
            const bExactType = exactTypeWords.some(w => bTitle.includes(w) || bTags.includes(w)) ? 10 : 0;
            const aColor = productColorScore(a, itemColors);
            const bColor = productColorScore(b, itemColors);
            const aGender = productGenderScore(a);
            const bGender = productGenderScore(b);
            const aSize = (userSize && sizeFilterEnabled && a._hasUserSize) ? 5 : 0;
            const bSize = (userSize && sizeFilterEnabled && b._hasUserSize) ? 5 : 0;
            return (bExactType + bColor + bGender + bSize) - (aExactType + aColor + aGender + aSize);
          });
          let best: ScoredProduct | null = null;
          if (userSize && sizeFilterEnabled) {
            const sizeFiltered = slotCandidates.filter(c => c._hasUserSize);
            best = sizeFiltered[0] || slotCandidates[0] || null;
          } else {
            best = slotCandidates[0] || null;
          }

          if (!best) {
            const catId = catIdByName.get(slot.name);
            if (catId) {
              const dbProducts = await storage.getProducts();
              const filtered = dbProducts.filter(p =>
                p.status === "active" && p.categoryId === catId &&
                !usedIds.has(p.id) && p.variants?.some((v: any) => v.stockQty > 0)
              );
              const withExactType = filtered.filter(p => exactTypeWords.some(w => p.title.toLowerCase().includes(w)));
              const pool2 = withExactType.length > 0 ? withExactType : filtered;
              const withColor = pool2.filter(p => productMatchesColors(p, itemColors));
              const chosen = withColor[0] || pool2[0];
              if (chosen) {
                const chosenHasSize = userSize ? (chosen.variants || []).some((v: { sizeLabel: string | null; stockQty: number | null }) =>
                  v.sizeLabel?.toUpperCase() === userSize.toUpperCase() && (v.stockQty === null || (v.stockQty ?? 0) > 0)
                ) : false;
                best = {
                  id: chosen.id, title: chosen.title, description: chosen.description,
                  basePrice: Number(chosen.basePrice), salePrice: chosen.salePrice ? Number(chosen.salePrice) : null,
                  currency: chosen.currency, gender: chosen.gender, categoryId: chosen.categoryId,
                  brand: null, images: chosen.images || [], variants: chosen.variants || [],
                  tags: chosen.tags?.map((t: string | { tag?: string }) => typeof t === 'string' ? t : (t.tag || '')) || [],
                  similarity: 0.5, reasons: ["Complemento de outfit"],
                  _hasUserSize: chosenHasSize,
                };
              }
            }
          }

          if (best) {
            usedIds.add(best.id);
            bundleItems.push({ ...best, slot: slot.label });
          }
        }

        const representedSlots = new Set(bundleItems.map(i => i.slot));
        // Only add complement slots (calzado/accesorio) if there are enough brands/products
        // to make meaningful suggestions. With < 50 products, forced complements feel random.
        const totalProducts = scoredResults.length;
        const complementSlots = totalProducts >= 50 ? slotDefs.filter(s =>
          !representedSlots.has(s.label) && ["Calzado", "Accesorio"].includes(s.label)
        ) : [];
        const allColors = [...(intent.colors?.primary || []), ...(intent.colors?.secondary || [])];
        for (const slot of complementSlots) {
          const catId = catIdByName.get(slot.name);
          if (!catId) continue;
          const compCandidates = scoredResults.filter(r => {
            if (usedIds.has(r.id)) return false;
            const catName = catNameById.get(r.categoryId) || "";
            return slot.catNames.some(n => catName.includes(n));
          });
          compCandidates.sort((a, b) => {
            const aScore = productColorScore(a, allColors) + productGenderScore(a) + ((userSize && sizeFilterEnabled && a._hasUserSize) ? 5 : 0);
            const bScore = productColorScore(b, allColors) + productGenderScore(b) + ((userSize && sizeFilterEnabled && b._hasUserSize) ? 5 : 0);
            return bScore - aScore;
          });
          let found: ScoredProduct | null = null;
          if (userSize && sizeFilterEnabled) {
            const sizeFiltered = compCandidates.filter(c => c._hasUserSize);
            found = sizeFiltered[0] || compCandidates[0] || null;
          } else {
            found = compCandidates[0] || null;
          }
          if (!found) {
            const dbProducts = await storage.getProducts();
            const filtered = dbProducts.filter(p =>
              p.status === "active" && p.categoryId === catId &&
              !usedIds.has(p.id) && p.variants?.some((v: { stockQty: number | null }) => (v.stockQty ?? 0) > 0) &&
              productGenderScore(p) >= 0
            );
            const withColor = filtered.filter(p => productMatchesColors(p, allColors));
            const chosen = withColor[0] || filtered[0];
            if (chosen) {
              const chosenHasSize = userSize ? (chosen.variants || []).some((v: { sizeLabel: string | null; stockQty: number | null }) =>
                v.sizeLabel?.toUpperCase() === userSize.toUpperCase() && (v.stockQty === null || (v.stockQty ?? 0) > 0)
              ) : false;
              found = {
                id: chosen.id, title: chosen.title, description: chosen.description,
                basePrice: Number(chosen.basePrice), salePrice: chosen.salePrice ? Number(chosen.salePrice) : null,
                currency: chosen.currency, gender: chosen.gender, categoryId: chosen.categoryId,
                brand: null, images: chosen.images || [], variants: chosen.variants || [],
                tags: chosen.tags?.map((t: string | { tag?: string }) => typeof t === 'string' ? t : (t.tag || '')) || [],
                similarity: 0.5, reasons: ["Complemento de outfit"],
                _hasUserSize: chosenHasSize,
              };
            }
          }
          if (found) {
            usedIds.add(found.id);
            bundleItems.push({ ...found, slot: slot.label });
          }
        }

        if (bundleItems.length >= 2) {
          const slotOrder = ["Superior", "Inferior", "Abrigo", "Calzado", "Accesorio"];
          bundleItems.sort((a: any, b: any) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));
          outfitBundles.push({
            title: "Outfit recomendado por Drevo",
            items: bundleItems.map(({ _hasUserSize, ...rest }) => rest)
          });
        }
      }

      // --- Improved "Explorar Resultados" filtering ---
      // Instead of a strict must_include filter that drops good results,
      // use a relevance threshold: only show products that actually scored well
      // and match the user's intent (type, color, gender).
      let filteredResults = scoredResults;

      if (intent.intent_type === "outfit" && outfitBundles.length > 0) {
        const bundleIds = new Set(outfitBundles[0].items.map((i: any) => i.id));

        // Remove items already in the outfit bundle
        filteredResults = scoredResults.filter(r => !bundleIds.has(r.id));
      }

      // Apply a minimum relevance threshold — don't show low-scoring noise
      const RELEVANCE_THRESHOLD = 0.35;
      filteredResults = filteredResults.filter(r => r.similarity >= RELEVANCE_THRESHOLD);

      // For outfit queries, prioritize products that match the requested types
      if (intent.intent_type === "outfit" && intent.must_include?.length > 0) {
        const requestedTypeRegex = /remera|camiseta|camisa|musculosa|polo|top|falda|pollera|bermuda|short|pantalon|pantalón|jean|cargo|jogger|calza|campera|buzo|hoodie|sweater|zapatilla|bota|gorra|mochila|bolso|vestido|carpenter/gi;
        const requestedTypes = new Set(
          (intent.must_include || []).flatMap((m: string) => {
            const matches = m.toLowerCase().match(requestedTypeRegex) || [];
            const typeSynonyms: Record<string, string[]> = {
              remera: ["remera", "camiseta", "tee"], camiseta: ["camiseta", "remera", "tee"],
              bermuda: ["bermuda", "short"], short: ["short", "bermuda"],
              pantalon: ["pantalon", "pantalón", "carpenter", "cargo", "jean"],
              "pantalón": ["pantalón", "pantalon", "carpenter", "cargo", "jean"],
              carpenter: ["carpenter", "pantalon", "pantalón", "bermuda"],
            };
            return matches.flatMap(m => typeSynonyms[m] || [m]);
          })
        );

        // Boost products that match requested types, penalize those that don't
        filteredResults = filteredResults.map(r => {
          const rTitle = r.title.toLowerCase();
          const matchesRequestedType = Array.from(requestedTypes).some(t => rTitle.includes(t));
          if (matchesRequestedType) {
            return { ...r, similarity: r.similarity + 0.15 };
          }
          return r;
        }).sort((a, b) => b.similarity - a.similarity);
      }

      if (intent.gender) {
        const wMen = intent.gender === 'men' || intent.gender === 'male' || intent.gender === 'hombre';
        const wWomen = intent.gender === 'women' || intent.gender === 'female' || intent.gender === 'mujer';
        filteredResults = filteredResults.filter(r => {
          const rTags = (r.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag || '').join(' ').toLowerCase();
          if (wMen && /\b(mujer|women|female|dama)\b/.test(rTags) && !/\b(hombre|men|male)\b/.test(rTags)) return false;
          if (wWomen && /\b(hombre|men|male)\b/.test(rTags) && !/\b(mujer|women|female|dama)\b/.test(rTags)) return false;
          return true;
        });
      }
      let finalResults = filteredResults;
      if (userSize && sizeFilterEnabled) {
        finalResults = filteredResults.filter(r => r._hasUserSize);
        if (finalResults.length < 3) {
          finalResults = filteredResults;
        }
      }
      const cleanResults = finalResults.map(({ _hasUserSize, ...rest }) => rest);

      res.status(200).json({
        query: input.query,
        intent,
        results: cleanResults,
        suggested_filters: {
          sizes: ["S", "M", "L", "XL"],
          brands: Array.from(new Set(cleanResults.map(r => r.brand?.name).filter(Boolean))) as string[]
        },
        outfit_bundles: outfitBundles,
        ...(userSize ? { sizeFilter: { size: userSize, enabled: sizeFilterEnabled } } : {}),
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

  // ─── Say More: Contextual product refinement ───
  // Given a product and a refinement prompt, find similar products with modifications
  app.post("/api/search/say-more", async (req, res) => {
    try {
      const { productId, refinement } = req.body;
      if (!productId || !refinement) {
        return res.status(400).json({ message: "productId y refinement son obligatorios" });
      }

      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ message: "Producto no encontrado" });

      // Build a contextual search query: "like this product but [refinement]"
      const productContext = `${product.title} ${product.brand?.name || ""} ${(product.tags || []).map((t: any) => typeof t === 'string' ? t : t.tag).join(" ")}`;

      let searchQuery = refinement;
      if (openai) {
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are helping refine a fashion search. The user is looking at a product and wants something similar but different. Generate a concise search query (max 20 words) that combines the original product context with the user's refinement request. Reply with ONLY the search query, nothing else.`
              },
              {
                role: "user",
                content: `Producto actual: ${productContext}\n\nRefinamiento del usuario: "${refinement}"\n\nGenerá un query de búsqueda optimizado.`
              }
            ]
          });
          searchQuery = completion.choices[0].message?.content?.trim() || refinement;
        } catch (e) {
          console.error("Say More AI error:", e);
          searchQuery = `${product.title} ${refinement}`;
        }
      } else {
        searchQuery = `${product.title} ${refinement}`;
      }

      // Vector search with the refined query
      if (!openai) {
        return res.status(500).json({ message: "OpenAI no configurado" });
      }

      const embRes = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        input: searchQuery,
      });
      const embStr = `[${embRes.data[0].embedding.join(',')}]`;
      const matches = await pool.query(
        `SELECT * FROM match_products($1::vector(1536), $2, 0.15)`,
        [embStr, 20]
      );
      const productIds = matches.rows
        .map((r: any) => r.product_id)
        .filter((id: string) => id !== productId); // Exclude the original product
      const productsData = await storage.getProductsByIds(productIds);

      const results = productsData.map(p => {
        const sim = matches.rows.find((r: any) => r.product_id === p.id)?.similarity || 0;
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
          tags: p.tags.map((t: any) => typeof t === 'string' ? t : t.tag),
          similarity: sim,
        };
      }).sort((a, b) => b.similarity - a.similarity);

      res.json({
        originalProduct: { id: product.id, title: product.title },
        refinement,
        generatedQuery: searchQuery,
        results,
      });
    } catch (err) {
      console.error("Say More error:", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  // ─── Visual Search: Upload image to find similar products ───
  const visualSearchUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype));
    },
  });

  app.post("/api/search/visual", visualSearchUpload.single("image"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se subió ninguna imagen" });
      }
      if (!openai) {
        return res.status(500).json({ message: "OpenAI no configurado" });
      }

      const additionalContext = req.body.context || "";
      const base64Image = req.file.buffer.toString("base64");
      const mimeType = req.file.mimetype;

      // Use GPT-4o Vision to analyze the image and extract fashion description
      const visionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a fashion analysis expert for DREVO, a fashion discovery platform in Argentina/LATAM. Analyze the image and describe the clothing items you see in detail. Include: type of garment, colors, patterns, style, fit, occasion it's suitable for. Output a concise search query (max 30 words) that captures the essence of what's shown, optimized for finding similar products. Reply with ONLY the search query.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: "low" }
              },
              ...(additionalContext ? [{
                type: "text" as const,
                text: `Contexto adicional del usuario: "${additionalContext}"`
              }] : [])
            ]
          }
        ],
        max_tokens: 150,
      });

      const imageDescription = visionResponse.choices[0].message?.content?.trim() || "";
      if (!imageDescription) {
        return res.status(422).json({ message: "No se pudo analizar la imagen" });
      }

      // Generate embedding and search
      const embRes = await openai.embeddings.create({
        model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        input: imageDescription,
      });
      const embStr = `[${embRes.data[0].embedding.join(',')}]`;
      const matches = await pool.query(
        `SELECT * FROM match_products($1::vector(1536), $2, 0.1)`,
        [embStr, 30]
      );
      const productIds = matches.rows.map((r: any) => r.product_id);
      const productsData = await storage.getProductsByIds(productIds);

      const results = productsData.map(p => {
        const sim = matches.rows.find((r: any) => r.product_id === p.id)?.similarity || 0;
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
          tags: p.tags.map((t: any) => typeof t === 'string' ? t : t.tag),
          similarity: sim,
        };
      }).sort((a, b) => b.similarity - a.similarity);

      res.json({
        imageDescription,
        results,
      });
    } catch (err) {
      console.error("Visual search error:", err);
      res.status(500).json({ message: "Error interno" });
    }
  });

  const tryonUpload = multer({
    storage: multer.diskStorage({
      destination: path.join(process.cwd(), "uploads", "tryon"),
      filename: (_req, file, cb) => {
        const ext = mimeToExt[file.mimetype] || ".jpg";
        cb(null, `user-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      cb(null, file.mimetype in mimeToExt);
    },
  });

  app.get("/api/tryon/:productId", requireAuth, async (req, res) => {
    try {
      const cached = await storage.getTryonResult(getAuthUser(req).id, String(req.params.productId));
      if (cached) {
        return res.json(cached);
      }
      return res.json(null);
    } catch (error) {
      console.error("Try-on cache check error:", error);
      res.status(500).json({ message: "Error al verificar caché" });
    }
  });

  app.post("/api/tryon", requireAuth, tryonUpload.single("userPhoto"), async (req, res) => {
    try {
      const { productId, forceRegenerate } = req.body;
      if (!productId) {
        return res.status(400).json({ message: "productId es obligatorio" });
      }

      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      const hasNewUpload = !!req.file;
      if (forceRegenerate !== "true" && !hasNewUpload) {
        const cached = await storage.getTryonResult(getAuthUser(req).id, productId);
        if (cached) {
          return res.json(cached);
        }
      }

      if (!checkTryonRateLimit(getAuthUser(req).id)) {
        return res.status(429).json({ message: "Alcanzaste el límite de pruebas virtuales. Intentá de nuevo en una hora." });
      }

      const { useProfilePhoto } = req.body;
      const user = getAuthUser(req);

      let userImageUrl: string | null = null;
      if (req.file) {
        userImageUrl = `/uploads/tryon/${req.file.filename}`;
      } else if (useProfilePhoto === "true") {
        userImageUrl = user.fullBodyImageUrl || user.profileImageUrl || null;
      } else {
        userImageUrl = user.fullBodyImageUrl || user.profileImageUrl || null;
      }
      if (!userImageUrl) {
        return res.status(400).json({ message: "Se necesita una foto. Subí una en tu perfil o acá." });
      }

      const productImage = product.images?.[0]?.url || null;
      const productTitle = product.title;
      const productDescription = product.description || "";
      const productTagsList = product.tags?.map((t: { tag?: string } | string) => typeof t === 'string' ? t : (t.tag || '')).join(", ") || "";

      const physicalDesc = [
        user.heightCm ? `${user.heightCm}cm tall` : null,
        user.weightKg ? `${user.weightKg}kg` : null,
        user.bodyType ? `${user.bodyType} body type` : null,
      ].filter(Boolean).join(", ");

      const readLocalImage = (imgPath: string): { data: string; mimeType: string } | null => {
        const stripped = imgPath.startsWith("/") ? imgPath.slice(1) : imgPath;
        const localPath = path.join(process.cwd(), stripped);
        if (!fs.existsSync(localPath)) return null;
        const bytes = fs.readFileSync(localPath);
        const ext = path.extname(localPath).replace(".", "").toLowerCase() || "png";
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        return { data: bytes.toString("base64"), mimeType };
      };

      const ALLOWED_IMAGE_HOSTS = [
        "d2r9epyceweg5n.cloudfront.net",
        "images.tiendanube.com",
        "acdn.mitiendanube.com",
        "acdn-us.mitiendanube.com",
        "d26lpennugtm8s.cloudfront.net",
        "lh3.googleusercontent.com",
        "platform-lookaside.fbsbx.com",
        "avatars.githubusercontent.com",
        "images.unsplash.com",
      ];

      const isPrivateIp = (hostname: string): boolean => {
        const parts = hostname.split(".").map(Number);
        if (parts.length !== 4 || parts.some(isNaN)) return false;
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 0) return true;
        return false;
      };

      const safeFetchImage = async (url: string): Promise<{ data: string; mimeType: string } | null> => {
        try {
          const parsedUrl = new URL(url);
          if (parsedUrl.protocol !== "https:") return null;
          if (isPrivateIp(parsedUrl.hostname)) return null;
          if (!ALLOWED_IMAGE_HOSTS.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`))) {
            console.warn(`[try-on] Blocked fetch to untrusted host: ${parsedUrl.hostname}`);
            return null;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const imgRes = await fetch(url, { signal: controller.signal, redirect: "follow" });
          clearTimeout(timeout);
          if (!imgRes.ok) return null;
          const contentLength = imgRes.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) return null;
          const imgBytes = Buffer.from(await imgRes.arrayBuffer());
          if (imgBytes.length > 10 * 1024 * 1024) return null;
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          return { data: imgBytes.toString("base64"), mimeType: contentType };
        } catch (e) {
          console.error("[try-on] Failed to fetch image:", e);
          return null;
        }
      };

      const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];

      if (userImageUrl.startsWith("/")) {
        const imgData = readLocalImage(userImageUrl);
        if (imgData) imageParts.push({ inlineData: imgData });
      } else if (userImageUrl.startsWith("https://")) {
        const imgData = await safeFetchImage(userImageUrl);
        if (imgData) imageParts.push({ inlineData: imgData });
      }

      if (productImage) {
        if (productImage.startsWith("/")) {
          const imgData = readLocalImage(productImage);
          if (imgData) imageParts.push({ inlineData: imgData });
        } else if (productImage.startsWith("https://")) {
          const imgData = await safeFetchImage(productImage);
          if (imgData) imageParts.push({ inlineData: imgData });
        }
      }

      if (imageParts.length < 2) {
        return res.status(400).json({ message: "No se pudieron cargar las imágenes necesarias" });
      }

      const { Modality } = await import("@google/genai");
      const { ai } = await import("./replit_integrations/image/client");

      // Detect garment category from product title for smarter prompt
      const titleLower = productTitle.toLowerCase();
      const isBottom = /bermuda|short|pantalon|pantalón|jean|cargo|jogger|calza|falda|pollera/i.test(titleLower);
      const isOuterwear = /campera|jacket|buzo|hoodie|sweater|abrigo|bomber|anorak/i.test(titleLower);
      const isFootwear = /zapatilla|sneaker|shoe|bota|boot|sandal/i.test(titleLower);
      const isDress = /vestido|dress/i.test(titleLower);

      let garmentZone = "the upper body garment (shirt/top/t-shirt)";
      let preserveZone = "ALL clothing below the waist (pants, shorts, skirt), ALL footwear, ALL accessories";
      if (isBottom) {
        garmentZone = "the lower body garment (pants/shorts/skirt)";
        preserveZone = "ALL clothing above the waist (shirt, top, jacket), ALL footwear, ALL accessories";
      } else if (isOuterwear) {
        garmentZone = "the outerwear layer (jacket/hoodie/sweater)";
        preserveZone = "the shirt/top underneath (keep it visible at neckline/hem if applicable), ALL clothing below the waist, ALL footwear, ALL accessories";
      } else if (isFootwear) {
        garmentZone = "the footwear (shoes/sneakers/boots)";
        preserveZone = "ALL clothing (top, bottom, outerwear), ALL accessories above the ankles";
      } else if (isDress) {
        garmentZone = "the full outfit from shoulders to knees/ankles (dress)";
        preserveZone = "ALL footwear, ALL accessories (jewelry, bags, hats)";
      }

      const tryonPrompt = `VIRTUAL CLOTHING TRY-ON — PRECISE IMAGE EDITING

You are given TWO images:
- IMAGE 1: The customer's photo. This is your CANVAS — preserve it exactly.
- IMAGE 2: A product photo of "${productTitle}". Extract ONLY the garment design from this image.

YOUR SINGLE TASK: Replace ${garmentZone} in Image 1 with the garment from Image 2.

CRITICAL RULES FOR PRESERVING IMAGE 1:
1. FACE & HEAD: Keep the exact same face, expression, hair, skin tone. Zero changes.
2. BODY: Keep the exact same body shape, proportions, pose, arm position, hand position. Do NOT stretch, shrink, or reshape any body part.
3. PRESERVE: ${preserveZone} — copy them pixel-for-pixel from Image 1.
4. BACKGROUND: Keep the entire background, environment, floor, walls identical to Image 1.
5. LIGHTING: Match Image 1's lighting direction, color temperature, and shadow angles on the new garment.
6. FRAMING: Same exact crop, angle, aspect ratio, and resolution as Image 1.

RULES FOR THE NEW GARMENT (from Image 2):
1. Copy the exact color, pattern, print, logo, and texture from Image 2.
2. Warp the garment naturally to match the person's pose and body shape in Image 1.
3. Add realistic fabric folds and wrinkles consistent with the pose.
4. Blend edges seamlessly where the garment meets skin or other clothing.

ABSOLUTELY FORBIDDEN:
- Do NOT copy any body parts, skin, other clothing, or background from Image 2.
- Do NOT generate a new person or change the person's identity.
- Do NOT add or remove any body parts.
- Do NOT change the image dimensions or orientation.
${physicalDesc ? `\nPerson's physical description: ${physicalDesc}` : ""}

Output: ONE photorealistic image identical to Image 1 except with the new garment.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{
          role: "user",
          parts: [
            { text: tryonPrompt },
            ...imageParts,
          ],
        }],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      });

      const candidate = response.candidates?.[0];
      const generatedImagePart = candidate?.content?.parts?.find(
        (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
      );

      if (!generatedImagePart?.inlineData?.data) {
        return res.status(500).json({ message: "No se pudo generar la imagen. Intentá de nuevo." });
      }

      const imageBuffer = Buffer.from(generatedImagePart.inlineData.data, "base64");
      const resultFilename = `tryon-${getAuthUser(req).id.slice(0, 8)}-${productId.slice(0, 8)}-${Date.now()}.png`;
      const resultPath = path.join(process.cwd(), "uploads", "tryon", resultFilename);
      fs.writeFileSync(resultPath, imageBuffer);
      const resultImageUrl = `/uploads/tryon/${resultFilename}`;

      const tryonResult = await storage.createTryonResult({
        userId: getAuthUser(req).id,
        productId,
        userImageUrl: userImageUrl,
        resultImageUrl,
      });

      res.json(tryonResult);
    } catch (error: unknown) {
      console.error("Try-on generation error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      if (errMsg.includes("RESOURCE_EXHAUSTED") || errMsg.includes("429") || errMsg.includes("rate")) {
        return res.status(429).json({ message: "El servicio de IA está saturado. Esperá un momento e intentá de nuevo." });
      }
      if (errMsg.includes("SAFETY") || errMsg.includes("blocked") || errMsg.includes("policy")) {
        return res.status(400).json({ message: "La imagen no pudo ser procesada por políticas de contenido. Probá con otra foto." });
      }
      res.status(500).json({ message: "Error al generar la imagen de prueba virtual. Intentá de nuevo." });
    }
  });

  app.post(api.admin.reindex.path, async (req, res) => {
    res.status(200).json({ success: true, message: "Reindexing triggered via script" });
  });

  app.post("/api/integrations/:integrationId/sync-products", requireAuth, async (req, res) => {
    const integrationId = String(req.params.integrationId);

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

      const allCatsForSync = await db.select().from(categories);
      const catMap = Object.fromEntries(allCatsForSync.map(c => [c.name.toLowerCase(), c.id]));

      for (const tnp of tnProducts) {
        try {
          const externalId = String(tnp.id);
          const title = (tnp.name?.es || tnp.name?.pt || tnp.name?.en || Object.values(tnp.name || {})[0] || "Sin nombre") as string;
          const rawDesc = (tnp.description?.es || tnp.description?.pt || tnp.description?.en || Object.values(tnp.description || {})[0] || "") as string;
          const description = rawDesc
            .replace(/<[^>]*>/g, " ")
            .replace(/&aacute;/gi, "á").replace(/&eacute;/gi, "é").replace(/&iacute;/gi, "í").replace(/&oacute;/gi, "ó").replace(/&uacute;/gi, "ú")
            .replace(/&ntilde;/gi, "ñ").replace(/&Ntilde;/gi, "Ñ")
            .replace(/&ldquo;/gi, "\u201C").replace(/&rdquo;/gi, "\u201D").replace(/&laquo;/gi, "\u00AB").replace(/&raquo;/gi, "\u00BB")
            .replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
            .replace(/&#\d+;/g, (m) => { try { return String.fromCharCode(parseInt(m.slice(2, -1))); } catch { return " "; } })
            .replace(/&[a-z]+;/gi, " ")
            .replace(/\s+/g, " ").trim();
          const basePrice = String(tnp.variants?.[0]?.price ?? tnp.price ?? "0");
          const salePrice = tnp.variants?.[0]?.promotional_price ?? null;
          const status = tnp.published ? "active" : "disabled";
          const rawUrl = (tnp.canonical_url || tnp.permalink || null) as string | null;
          const externalUrl = rawUrl && /^https?:\/\//i.test(rawUrl) ? rawUrl : null;

          // Check if product already exists by external_id
          const existing = await db
            .select({ id: products.id })
            .from(products)
            .where(sql`external_provider = 'tiendanube' AND external_id = ${externalId}`);

          let productId: string;

          const titleLowerCat = title.toLowerCase();
          let inferredCategoryId: string | null = null;
          if (/remera|camiseta|tee|top|polo|musculosa|camisa|tank|chaleco|vest|crop|body/i.test(titleLowerCat)) {
            inferredCategoryId = catMap["tops"] || null;
          } else if (/pantalon|pantalón|jean|cargo|short|pollera|falda|calza|legging|jogger|bermuda/i.test(titleLowerCat)) {
            inferredCategoryId = catMap["bottoms"] || null;
          } else if (/campera|jacket|buzo|hoodie|sweater|abrigo|anorak|rompeviento|bomber|parka/i.test(titleLowerCat)) {
            inferredCategoryId = catMap["outerwear"] || null;
          } else if (/zapatilla|sneaker|bota|boot|sandal|zapato|shoe|ojotas|chancleta/i.test(titleLowerCat)) {
            inferredCategoryId = catMap["footwear"] || null;
          } else if (/media|sock|gorra|cap|hat|vincha|muñequera|mochila|bolso|bag|cintur|neceser|riñonera|accesorio/i.test(titleLowerCat)) {
            inferredCategoryId = catMap["accessories"] || null;
          }

          if (existing.length > 0) {
            productId = existing[0].id;
            await db
              .update(products)
              .set({ title, description, basePrice, salePrice: salePrice ? String(salePrice) : null, status, externalUrl, categoryId: inferredCategoryId, updatedAt: new Date() })
              .where(eq(products.id, productId));
            await db.delete(productTags).where(eq(productTags.productId, productId));
            await db.delete(productImages).where(eq(productImages.productId, productId));
            await db.delete(productVariants).where(eq(productVariants.productId, productId));
          } else {
            const [inserted] = await db
              .insert(products)
              .values({ title, description, basePrice, salePrice: salePrice ? String(salePrice) : null, status, externalProvider: "tiendanube", externalId, externalUrl, categoryId: inferredCategoryId, currency: "ARS" })
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
                sizeLabel: (Array.isArray(v.values) ? v.values.map((val: any) => typeof val === "object" ? (val.es || val.pt || val.en || Object.values(val)[0] || "") : String(val)).filter(Boolean).join(" / ") : "Único") || "Único",
                sku: v.sku || null,
                stockQty: v.stock ?? 0,
              }))
            );
          } else {
            await db.insert(productVariants).values({ productId, sizeLabel: "Único", stockQty: 0 });
          }

          const rawTags: string[] = Array.isArray(tnp.tags) ? tnp.tags.flatMap((t: string) => t.split(",").map((s: string) => s.trim()).filter(Boolean)) : [];
          const textForTags = `${title} ${description}`.toLowerCase();
          const colorPairs: [string, string[]][] = [
            ["negro", ["black", "negro"]], ["negra", ["black", "negro"]], ["black", ["black", "negro"]],
            ["blanco", ["white", "blanco"]], ["blanca", ["white", "blanco"]], ["white", ["white", "blanco"]],
            ["verde", ["green", "verde"]], ["green", ["green", "verde"]],
            ["azul", ["blue", "azul"]], ["blue", ["blue", "azul"]],
            ["rojo", ["red", "rojo"]], ["roja", ["red", "rojo"]], ["red", ["red", "rojo"]],
            ["rosa", ["pink", "rosa"]], ["pink", ["pink", "rosa"]],
            ["gris", ["grey", "gris"]], ["grey", ["grey", "gris"]], ["gray", ["grey", "gris"]],
            ["naranja", ["orange", "naranja"]], ["orange", ["orange", "naranja"]],
            ["amarillo", ["yellow", "amarillo"]], ["amarilla", ["yellow", "amarillo"]], ["yellow", ["yellow", "amarillo"]],
            ["marron", ["brown", "marron"]], ["marrón", ["brown", "marron"]], ["brown", ["brown", "marron"]], ["chocolate", ["brown", "marron"]],
            ["beige", ["beige"]], ["crudo", ["beige", "crudo"]], ["arena", ["beige", "arena"]],
            ["celeste", ["lightblue", "celeste"]], ["bordo", ["burgundy", "bordo"]], ["bordó", ["burgundy", "bordo"]], ["borravino", ["burgundy", "bordo"]],
            ["lila", ["purple", "lila"]], ["violeta", ["purple", "violeta"]], ["coral", ["coral"]],
            ["militar", ["olive", "militar"]], ["lima", ["lime", "verde", "lima"]],
            ["aqua", ["aqua", "verde"]], ["agua", ["aqua", "verde"]],
            ["dorado", ["gold", "dorado"]], ["plateado", ["silver", "plateado"]],
            ["melange", ["grey", "gris", "melange"]], ["batik", ["estampado", "batik"]],
          ];
          for (const [keyword, tags] of colorPairs) {
            if (textForTags.includes(keyword)) {
              for (const t of tags) {
                if (!rawTags.includes(t)) rawTags.push(t);
              }
            }
          }
          const typePairs: [RegExp, string][] = [
            [/remera|camiseta|tee/i, "remera"], [/short\b/i, "short"], [/pantalon|pantalón/i, "pantalon"],
            [/pollera|falda/i, "pollera"], [/calza|legging/i, "calza"], [/campera|jacket/i, "campera"],
            [/gorra|cap\b/i, "gorra"], [/media|sock/i, "medias"], [/zapatilla|sneaker/i, "zapatilla"],
            [/musculosa|tank/i, "musculosa"], [/vestido|dress/i, "vestido"], [/buzo|hoodie|sudadera/i, "buzo"],
            [/bermuda/i, "bermuda"], [/jogger/i, "jogger"], [/mochila|backpack/i, "mochila"],
            [/bolso|bag\b/i, "bolso"], [/neceser/i, "neceser"],
          ];
          for (const [regex, tag] of typePairs) {
            if (regex.test(textForTags) && !rawTags.includes(tag)) rawTags.push(tag);
          }
          let visionDescription = "";
          const mainImageUrl = Array.isArray(tnp.images) && tnp.images.length > 0 ? tnp.images[0].src : null;
          if (openai && mainImageUrl) {
            try {
              const visionRes = await openai.chat.completions.create({
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
                    { type: "image_url", image_url: { url: mainImageUrl, detail: "low" } }
                  ]
                }],
                max_tokens: 120,
              });
              visionDescription = visionRes.choices[0]?.message?.content?.trim() || "";
              if (visionDescription) {
                const visionTags = visionDescription.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 1 && t.length < 30);
                for (const vt of visionTags) {
                  if (!rawTags.includes(vt)) rawTags.push(vt);
                }
              }
            } catch (visionErr: any) {
              console.error(`Vision error for ${title}:`, visionErr.message);
            }
          }

          if (rawTags.length > 0) {
            await db.insert(productTags).values(rawTags.map(tag => ({ productId, tag })));
          }

          if (openai) {
            try {
              const visionColorOverride = visionDescription || "";
              const textToEmbed = `${title}. ${description} ${visionColorOverride ? `Visual attributes: ${visionColorOverride}.` : ""} Tags: ${rawTags.join(", ")}`;
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

  // ─── Click Tracking Routes ───

  app.post("/api/clicks/track", async (req, res) => {
    try {
      const { productId, queryText, sessionId } = req.body;
      if (!productId) return res.status(400).json({ message: "productId es obligatorio" });

      const product = await storage.getProduct(productId);
      if (!product) return res.status(404).json({ message: "Producto no encontrado" });

      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      const referralCode = `DRV-${timestamp}-${random}`;

      // Check if brand is connected (has integration) → charge CPC
      let cpcAmount: string | undefined;
      if (product.brandId) {
        const [brand] = await db.select({ cpcRate: brands.cpcRate }).from(brands).where(eq(brands.id, product.brandId));
        if (brand && brand.cpcRate && parseFloat(brand.cpcRate) > 0) {
          // Check if brand has active integration (connected, not just scraped)
          const [integration] = await db.select({ id: brandIntegrations.id }).from(brandIntegrations).where(eq(brandIntegrations.brandId, product.brandId));
          if (integration) {
            cpcAmount = brand.cpcRate;
          }
        }
      }

      const userId = req.user?.id || null;
      const click = await storage.createProductClick({
        userId: userId || undefined,
        productId,
        brandId: product.brandId || undefined,
        sessionId: sessionId || undefined,
        referralCode,
        queryText: queryText || undefined,
        cpcAmount,
      });

      const baseUrl = product.externalUrl || "";
      const separator = baseUrl.includes("?") ? "&" : "?";
      const referralUrl = baseUrl
        ? `${baseUrl}${separator}utm_source=drevo&utm_medium=ai_search&utm_campaign=discovery&ref=${referralCode}`
        : null;

      res.json({ referralUrl, referralCode });
    } catch (error) {
      console.error("Click tracking error:", error);
      res.status(500).json({ message: "Error al registrar click" });
    }
  });

  app.post("/api/clicks/convert", async (req, res) => {
    try {
      const { referralCode, orderAmount } = req.body;
      if (!referralCode || !orderAmount) return res.status(400).json({ message: "referralCode y orderAmount son obligatorios" });

      const click = await storage.convertClick(referralCode, Number(orderAmount));
      if (!click) return res.status(404).json({ message: "Click no encontrado" });

      res.json(click);
    } catch (error) {
      console.error("Click conversion error:", error);
      res.status(500).json({ message: "Error al convertir click" });
    }
  });

  app.get("/api/analytics/clicks", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      if (!(user as Record<string, unknown>).role || (user as Record<string, unknown>).role !== "admin") {
        return res.status(403).json({ message: "Acceso denegado" });
      }
      const analytics = await storage.getClickAnalytics();
      res.json(analytics);
    } catch (error) {
      console.error("Click analytics error:", error);
      res.status(500).json({ message: "Error al obtener analytics" });
    }
  });

  // ─── Brand Dashboard ───

  app.get("/api/brand/dashboard", requireAuth, async (req, res) => {
    try {
      // Get all integrations for this user (for now, all integrations since they're not user-scoped)
      const userIntegrations = await db.select().from(brandIntegrations);
      if (userIntegrations.length === 0) {
        return res.json({ hasBrand: false });
      }

      const brandIds = userIntegrations.map(i => i.brandId).filter(Boolean) as string[];

      // Get products for these brands
      const brandProducts = brandIds.length > 0
        ? await db.select({
            id: products.id,
            title: products.title,
            brandId: products.brandId,
            status: products.status,
            basePrice: products.basePrice,
            salePrice: products.salePrice,
          }).from(products).where(sql`${products.brandId} = ANY(${brandIds})`)
        : [];

      const activeProducts = brandProducts.filter(p => p.status === "active");

      // Get clicks for these brands
      const clicksData = brandIds.length > 0
        ? await pool.query(
            `SELECT
              pc.product_id,
              pc.query_text,
              pc.status,
              pc.commission_amount,
              pc.clicked_at,
              p.title as product_title
            FROM product_clicks pc
            LEFT JOIN products p ON p.id = pc.product_id
            WHERE pc.brand_id = ANY($1)
            ORDER BY pc.clicked_at DESC`,
            [brandIds]
          )
        : { rows: [] };

      const clicks = clicksData.rows;
      const totalClicks = clicks.length;
      const conversions = clicks.filter((c: any) => c.status === "converted");
      const totalConversions = conversions.length;
      const totalRevenue = conversions.reduce((sum: number, c: any) => sum + parseFloat(c.commission_amount || "0"), 0);
      const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0;

      // Top products by clicks
      const productClickCounts: Record<string, { title: string; clicks: number; conversions: number }> = {};
      for (const click of clicks) {
        const pid = (click as any).product_id;
        if (!productClickCounts[pid]) {
          productClickCounts[pid] = { title: (click as any).product_title || "Producto", clicks: 0, conversions: 0 };
        }
        productClickCounts[pid].clicks++;
        if ((click as any).status === "converted") productClickCounts[pid].conversions++;
      }
      const topProducts = Object.entries(productClickCounts)
        .sort((a, b) => b[1].clicks - a[1].clicks)
        .slice(0, 10)
        .map(([id, data]) => ({ id, ...data }));

      // Top search queries that led to clicks
      const queryClickCounts: Record<string, { clicks: number; conversions: number }> = {};
      for (const click of clicks) {
        const q = (click as any).query_text;
        if (!q) continue;
        if (!queryClickCounts[q]) queryClickCounts[q] = { clicks: 0, conversions: 0 };
        queryClickCounts[q].clicks++;
        if ((click as any).status === "converted") queryClickCounts[q].conversions++;
      }
      const topQueries = Object.entries(queryClickCounts)
        .sort((a, b) => b[1].clicks - a[1].clicks)
        .slice(0, 10)
        .map(([query, data]) => ({ query, ...data }));

      // Clicks by day (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentClicks = clicks.filter((c: any) => new Date(c.clicked_at) >= thirtyDaysAgo);
      const clicksByDay: Record<string, number> = {};
      for (const click of recentClicks) {
        const day = new Date((click as any).clicked_at).toISOString().slice(0, 10);
        clicksByDay[day] = (clicksByDay[day] || 0) + 1;
      }

      // Get brand names
      const brandNames = brandIds.length > 0
        ? await db.select({ id: brands.id, name: brands.name }).from(brands).where(sql`${brands.id} = ANY(${brandIds})`)
        : [];

      // Get product images for top products
      const topProductIds = topProducts.map(p => p.id);
      const topProductImages = topProductIds.length > 0
        ? await db.select({ productId: productImages.productId, url: productImages.url, position: productImages.position })
            .from(productImages)
            .where(sql`${productImages.productId} = ANY(${topProductIds})`)
        : [];
      const imageMap: Record<string, string> = {};
      for (const img of topProductImages) {
        if (img.productId && (!imageMap[img.productId] || (img.position || 0) === 0)) {
          imageMap[img.productId] = img.url;
        }
      }

      // CPC billing: sum cpc_amount for connected brands
      const cpcData = brandIds.length > 0
        ? await pool.query(
            `SELECT
              COALESCE(SUM(CAST(cpc_amount AS numeric)), 0) as total_cpc,
              COUNT(*) FILTER (WHERE cpc_amount IS NOT NULL AND CAST(cpc_amount AS numeric) > 0) as cpc_clicks,
              COALESCE(SUM(CAST(cpc_amount AS numeric)) FILTER (WHERE clicked_at >= NOW() - INTERVAL '30 days'), 0) as cpc_last_30d
            FROM product_clicks
            WHERE brand_id = ANY($1)`,
            [brandIds]
          )
        : { rows: [{ total_cpc: "0", cpc_clicks: "0", cpc_last_30d: "0" }] };

      const cpcRow = cpcData.rows[0] || { total_cpc: "0", cpc_clicks: "0", cpc_last_30d: "0" };

      // Get brand CPC rates
      const brandCpcRates = brandIds.length > 0
        ? await db.select({ id: brands.id, cpcRate: brands.cpcRate }).from(brands).where(sql`${brands.id} = ANY(${brandIds})`)
        : [];
      const cpcRateMap: Record<string, string> = {};
      for (const b of brandCpcRates) {
        cpcRateMap[b.id] = b.cpcRate || "0";
      }

      res.json({
        hasBrand: true,
        brands: brandNames,
        overview: {
          totalProducts: activeProducts.length,
          totalClicks,
          totalConversions,
          totalRevenue: totalRevenue.toFixed(2),
          conversionRate: conversionRate.toFixed(1),
        },
        billing: {
          totalCpcSpend: parseFloat(cpcRow.total_cpc || "0").toFixed(2),
          cpcClicks: parseInt(cpcRow.cpc_clicks || "0"),
          cpcLast30d: parseFloat(cpcRow.cpc_last_30d || "0").toFixed(2),
          cpcRates: cpcRateMap,
        },
        topProducts: topProducts.map(p => ({ ...p, imageUrl: imageMap[p.id] || null })),
        topQueries,
        clicksByDay,
        integrations: userIntegrations.map(i => ({
          id: i.id,
          provider: i.provider,
          storeId: i.storeId,
          storeName: i.storeName,
        })),
      });
    } catch (error) {
      console.error("Brand dashboard error:", error);
      res.status(500).json({ message: "Error al obtener dashboard" });
    }
  });

  // ─── Style Passport Routes ───

  app.post("/api/user/style-passport", requireAuth, async (req, res) => {
    try {
      const { styleVibes, ocasionesFrecuentes, presupuestoRango, marcasFavoritas, coloresEvitar, estilosEvitar, preferredSize, genero } = req.body;
      const user = await storage.updateUser(getAuthUser(req).id, {
        styleVibes: styleVibes || [],
        ocasionesFrecuentes: ocasionesFrecuentes || [],
        presupuestoRango: presupuestoRango || null,
        marcasFavoritas: marcasFavoritas || [],
        coloresEvitar: coloresEvitar || [],
        estilosEvitar: estilosEvitar || [],
        preferredSize: preferredSize || null,
        bodyType: genero || null,
        stylePassportCompleted: true,
      });
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Style passport error:", error);
      res.status(500).json({ message: "Error al guardar style passport" });
    }
  });

  // ─── Personalized Feed ───

  app.get("/api/feed", async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 30, 50);
      const offset = Number(req.query.offset) || 0;

      // Check if user is authenticated and has style passport
      let user: any = null;
      try {
        user = getAuthUser(req);
        if (user?.id) user = await storage.getUser(user.id);
      } catch {}

      // Build a personalization query from user's Style Passport
      let feedQuery = "moda tendencia ropa popular";
      if (user?.stylePassportCompleted) {
        const parts: string[] = [];
        if (user.styleVibes?.length) parts.push(`estilo ${user.styleVibes.join(", ")}`);
        if (user.ocasionesFrecuentes?.length) parts.push(`para ${user.ocasionesFrecuentes.join(", ")}`);
        if (user.marcasFavoritas?.length) parts.push(`marcas como ${user.marcasFavoritas.join(", ")}`);
        if (user.bodyType) parts.push(`ropa de ${user.bodyType}`);
        if (parts.length > 0) feedQuery = parts.join(". ");
      }

      let feedProducts: any[] = [];

      if (openai) {
        try {
          const embRes = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            input: feedQuery,
          });
          const embStr = `[${embRes.data[0].embedding.join(",")}]`;
          const matches = await pool.query(
            `SELECT * FROM match_products($1::vector(1536), $2, 0.05)`,
            [embStr, limit + offset]
          );
          const productIds = matches.rows.slice(offset).map((r: any) => r.product_id);
          feedProducts = await storage.getProductsByIds(productIds);

          // Boost products matching user preferences
          if (user?.stylePassportCompleted) {
            const coloresEvitar = new Set(user.coloresEvitar || []);
            feedProducts = feedProducts.filter(p => {
              const tags = p.tags?.map((t: any) => t.tag?.toLowerCase()) || [];
              for (const c of coloresEvitar) {
                if (tags.some((t: string) => t.includes(c))) return false;
              }
              return true;
            });
          }

          // Preserve similarity order from vector search
          const idOrder = new Map(productIds.map((id: string, i: number) => [id, i]));
          feedProducts.sort((a: any, b: any) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));
        } catch (e) {
          console.error("Feed vector search error:", e);
        }
      }

      // Fallback: return all products shuffled
      if (feedProducts.length === 0) {
        const all = await storage.getProducts();
        // Deterministic shuffle based on day (changes daily)
        const day = new Date().toISOString().slice(0, 10);
        const seed = day.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        feedProducts = all.sort(() => Math.sin(seed + Math.random()) - 0.5).slice(offset, offset + limit);
      }

      res.json({
        products: feedProducts.slice(0, limit),
        personalized: !!user?.stylePassportCompleted,
        hasMore: feedProducts.length >= limit,
      });
    } catch (error) {
      console.error("Feed error:", error);
      res.status(500).json({ message: "Error al cargar el feed" });
    }
  });

  // ─── Collections Routes ───

  app.get("/api/collections", requireAuth, async (req, res) => {
    try {
      const userCollections = await storage.getCollectionsByUser(getAuthUser(req).id);
      res.json(userCollections);
    } catch (error) {
      console.error("Get collections error:", error);
      res.status(500).json({ message: "Error al obtener colecciones" });
    }
  });

  app.post("/api/collections", requireAuth, async (req, res) => {
    try {
      const { name, emoji } = req.body;
      if (!name) return res.status(400).json({ message: "El nombre es obligatorio" });
      const collection = await storage.createCollection({ userId: getAuthUser(req).id, name, emoji });
      res.json(collection);
    } catch (error) {
      console.error("Create collection error:", error);
      res.status(500).json({ message: "Error al crear colección" });
    }
  });

  app.post("/api/collections/:id/items", requireAuth, async (req, res) => {
    try {
      const collectionId = String(req.params.id);
      const userId = getAuthUser(req).id;
      const collection = await storage.getCollection(collectionId);
      if (!collection || collection.userId !== userId) {
        return res.status(403).json({ message: "Acceso denegado" });
      }
      const { productId } = req.body;
      if (!productId) return res.status(400).json({ message: "productId es obligatorio" });
      const item = await storage.addCollectionItem(collectionId, productId);
      res.json(item);
    } catch (error) {
      console.error("Add collection item error:", error);
      res.status(500).json({ message: "Error al agregar producto" });
    }
  });

  app.delete("/api/collections/:id/items/:productId", requireAuth, async (req, res) => {
    try {
      const collectionId = String(req.params.id);
      const userId = getAuthUser(req).id;
      const collection = await storage.getCollection(collectionId);
      if (!collection || collection.userId !== userId) {
        return res.status(403).json({ message: "Acceso denegado" });
      }
      await storage.removeCollectionItem(collectionId, String(req.params.productId));
      res.json({ success: true });
    } catch (error) {
      console.error("Remove collection item error:", error);
      res.status(500).json({ message: "Error al quitar producto" });
    }
  });

  app.get("/api/collections/:id/items", requireAuth, async (req, res) => {
    try {
      const collectionId = String(req.params.id);
      const userId = getAuthUser(req).id;
      const collection = await storage.getCollection(collectionId);
      if (!collection || collection.userId !== userId) {
        return res.status(403).json({ message: "Acceso denegado" });
      }
      const items = await storage.getCollectionItems(collectionId);
      res.json(items);
    } catch (error) {
      console.error("Get collection items error:", error);
      res.status(500).json({ message: "Error al obtener productos" });
    }
  });

  app.get("/api/user/saved-products", requireAuth, async (req, res) => {
    try {
      const productIds = await storage.getUserSavedProductIds(getAuthUser(req).id);
      res.json(productIds);
    } catch (error) {
      console.error("Get saved products error:", error);
      res.status(500).json({ message: "Error al obtener guardados" });
    }
  });

  // ─── AI Stylist ───

  const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

  // Audio transcription for stylist voice input
  const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

  app.post("/api/stylist/transcribe", requireAuth, audioUpload.single("audio"), async (req, res) => {
    if (!openai) {
      return res.status(503).json({ message: "Transcripcion no disponible" });
    }
    try {
      const file = (req as any).file;
      if (!file) return res.status(400).json({ message: "No audio file" });

      const tempPath = path.join("/tmp", `audio-${Date.now()}.webm`);
      fs.writeFileSync(tempPath, file.buffer);

      const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file: fs.createReadStream(tempPath),
        language: "es",
      });

      fs.unlinkSync(tempPath);
      res.json({ text: transcription.text });
    } catch (error: any) {
      console.error("Transcription error:", error);
      res.status(500).json({ message: "Error en transcripcion" });
    }
  });

  app.post("/api/stylist/chat", requireAuth, async (req, res) => {
    if (!anthropic) {
      return res.status(503).json({ message: "AI Stylist no disponible (falta ANTHROPIC_API_KEY)" });
    }

    try {
      const user = getAuthUser(req);
      const { messages } = req.body;

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ message: "Mensajes requeridos" });
      }

      // Build Style Passport context
      const fullUser = await storage.getUser(user.id);
      let styleContext = "";
      if (fullUser?.stylePassportCompleted) {
        const vibes = fullUser.styleVibes?.join(", ") || "no definido";
        const ocasiones = fullUser.ocasionesFrecuentes?.join(", ") || "no definido";
        const presupuesto = fullUser.presupuestoRango || "no definido";
        const marcas = fullUser.marcasFavoritas?.length ? fullUser.marcasFavoritas.join(", ") : "sin preferencia";
        const colores = fullUser.coloresEvitar?.length ? fullUser.coloresEvitar.join(", ") : "ninguno";
        const talle = fullUser.preferredSize || "no definido";
        const genero = fullUser.bodyType || "no definido";
        styleContext = `\n\nPERFIL DE ESTILO DEL USUARIO (Style Passport):
- Género: ${genero}
- Vibes/Estilo: ${vibes}
- Ocasiones frecuentes: ${ocasiones}
- Rango de presupuesto: ${presupuesto}
- Marcas favoritas: ${marcas}
- Colores que no le gustan: ${colores}
- Talle habitual: ${talle}
Usá esta info para personalizar tus recomendaciones. No repitas estos datos al usuario a menos que te pregunte.`;
      }

      // Search catalog for product recommendations when relevant
      let catalogContext = "";
      const lastUserMsg = messages[messages.length - 1];
      const lastText = typeof lastUserMsg.content === "string" ? lastUserMsg.content : "";

      if (lastText && openai) {
        try {
          const embRes = await openai.embeddings.create({
            model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            input: lastText,
          });
          const embStr = `[${embRes.data[0].embedding.join(',')}]`;
          const matches = await pool.query(
            `SELECT * FROM match_products($1::vector(1536), $2, 0.15)`,
            [embStr, 8]
          );
          if (matches.rows.length > 0) {
            const productIds = matches.rows.map((r: any) => r.product_id);
            const prods = await storage.getProductsByIds(productIds);
            // Store products for sending to client
            (req as any)._stylistProducts = prods.map(p => ({
              id: p.id,
              title: p.title,
              price: p.price,
              salePrice: p.salePrice,
              brandName: p.brandName,
              imageUrl: p.images?.[0]?.url || null,
              externalUrl: p.externalUrl,
            }));
            const prodList = prods.map(p => {
              const price = p.salePrice ? `$${p.salePrice}` : (p.price ? `$${p.price}` : "precio no disponible");
              return `- ${p.title} (${p.brandName || "marca"}) — ${price} [PRODUCT:${p.id}]`;
            }).join("\n");
            catalogContext = `\n\nPRODUCTOS RELEVANTES EN CATÁLOGO DREVO (podés recomendar estos):
${prodList}

IMPORTANTE: Cuando mencionés un producto del catálogo, SIEMPRE incluí su marcador [PRODUCT:id] al lado del nombre para que el usuario pueda verlo. Ejemplo: "Te recomiendo el Classic Hoodie Negro [PRODUCT:abc123]"`;
          }
        } catch (e) {
          console.error("Stylist catalog search error:", e);
        }
      }

      const systemPrompt = `Sos el estilista personal de DREVO, un motor de descubrimiento de moda argentino. Tu nombre es DREVO Stylist.

PERSONALIDAD:
- Sos amigable, directo y con onda. Usás español rioplatense (vos, podés, tenés).
- Tenés expertise en moda, combinaciones, tendencias y estilo personal.
- Sos inclusivo y no juzgás los gustos de nadie.
- Respondés de forma concisa pero completa. No te extendés de más.

CAPACIDADES:
- Ayudás a armar outfits completos para cualquier ocasión.
- Analizás fotos de prendas del usuario y sugerís cómo combinarlas.
- Recomendás productos del catálogo de DREVO cuando son relevantes.
- Considerás el estilo personal, la ocasión, el clima y el presupuesto.

FORMATO:
- NUNCA uses markdown (nada de **, ##, *, etc). Escribí texto plano siempre.
- No uses listas con viñetas tipo "- ". Escribí en prosa natural, como un mensaje de WhatsApp.
- Cuando recomendás productos del catálogo, nombralos naturalmente en el texto.
- Si el usuario manda una foto de su ropa, describí lo que ves y sugerí combinaciones.
- Usá emojis con moderación para ser amigable pero no exagerar.${styleContext}${catalogContext}`;

      // Build messages for Claude (supports multiple images per message)
      const claudeMessages: Anthropic.MessageParam[] = messages.map((m: any) => {
        const imgs = m.images || (m.imageBase64 ? [{ base64: m.imageBase64, mediaType: m.imageMediaType || "image/jpeg" }] : []);
        if (m.role === "user" && imgs.length > 0) {
          const content: any[] = imgs.map((img: any) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType || "image/jpeg", data: img.base64 }
          }));
          content.push({ type: "text" as const, text: m.content || "¿Qué me podés decir de estas prendas? ¿Cómo las combino?" });
          return { role: "user" as const, content };
        }
        return { role: m.role as "user" | "assistant", content: m.content };
      });

      // Stream response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Send product data first so frontend can render cards
      const stylistProducts = (req as any)._stylistProducts;
      if (stylistProducts?.length > 0) {
        res.write(`data: ${JSON.stringify({ products: stylistProducts })}\n\n`);
      }

      const stream = anthropic.messages.stream({
        model: process.env.ANTHROPIC_STYLIST_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: claudeMessages,
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
        }
      }

      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Stylist error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error del estilista AI" });
      } else {
        res.write(`data: ${JSON.stringify({ error: "Error del estilista" })}\n\n`);
        res.end();
      }
    }
  });

  // ─── CPC Admin Endpoints ───

  app.post("/api/admin/brand/:brandId/cpc", requireAuth, async (req, res) => {
    try {
      const { cpcRate } = req.body;
      if (cpcRate === undefined || cpcRate === null) {
        return res.status(400).json({ message: "cpcRate es obligatorio (en ARS por click, ej: 150)" });
      }
      const [updated] = await db
        .update(brands)
        .set({ cpcRate: String(cpcRate), updatedAt: new Date() })
        .where(eq(brands.id, req.params.brandId))
        .returning({ id: brands.id, name: brands.name, cpcRate: brands.cpcRate });

      if (!updated) return res.status(404).json({ message: "Marca no encontrada" });
      res.json({ message: `CPC rate set to $${cpcRate} ARS`, brand: updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/billing", requireAuth, async (req, res) => {
    try {
      // Get CPC billing summary per brand
      const result = await pool.query(`
        SELECT
          b.id, b.name, b.cpc_rate,
          COUNT(pc.id) as total_clicks,
          COUNT(pc.id) FILTER (WHERE pc.cpc_amount IS NOT NULL AND CAST(pc.cpc_amount AS numeric) > 0) as cpc_clicks,
          COALESCE(SUM(CAST(pc.cpc_amount AS numeric)) FILTER (WHERE pc.cpc_amount IS NOT NULL), 0) as total_cpc_revenue,
          COALESCE(SUM(CAST(pc.cpc_amount AS numeric)) FILTER (WHERE pc.cpc_amount IS NOT NULL AND pc.clicked_at >= NOW() - INTERVAL '30 days'), 0) as cpc_last_30d,
          COUNT(pc.id) FILTER (WHERE pc.clicked_at >= NOW() - INTERVAL '30 days') as clicks_last_30d
        FROM brands b
        LEFT JOIN product_clicks pc ON pc.brand_id = b.id
        WHERE EXISTS (SELECT 1 FROM brand_integrations bi WHERE bi.brand_id = b.id)
        GROUP BY b.id, b.name, b.cpc_rate
        ORDER BY total_cpc_revenue DESC
      `);

      const totalRevenue = result.rows.reduce((sum: number, r: any) => sum + parseFloat(r.total_cpc_revenue || "0"), 0);

      res.json({
        totalCpcRevenue: totalRevenue.toFixed(2),
        brands: result.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          cpcRate: r.cpc_rate || "0",
          totalClicks: parseInt(r.total_clicks),
          cpcClicks: parseInt(r.cpc_clicks),
          totalCpcRevenue: parseFloat(r.total_cpc_revenue).toFixed(2),
          cpcLast30d: parseFloat(r.cpc_last_30d).toFixed(2),
          clicksLast30d: parseInt(r.clicks_last_30d),
        })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ─── Scraper Admin Endpoints ───

  app.post("/api/admin/scrape", async (req, res) => {
    // Simple API key auth for admin endpoints
    const adminKey = req.headers["x-admin-key"] || req.body?.adminKey;
    if (adminKey !== (process.env.ADMIN_KEY || "drevo-scrape-2026")) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      const { scrapeStore: scrapeStoreFn, scrapeMultipleStores, INITIAL_BRANDS } = await import("./scraper");
      const { storeUrl, storeUrls, useInitialList } = req.body;

      if (useInitialList) {
        // Scrape all initial brands (async, respond immediately)
        const urls = INITIAL_BRANDS.map((b: { url: string }) => b.url);
        res.json({ message: `Scraping ${urls.length} stores in background`, stores: INITIAL_BRANDS.map((b: { name: string }) => b.name) });
        scrapeMultipleStores(urls).then(results => {
          console.log("[Scraper] Batch complete:", results.map(r => `${r.storeName}: ${r.synced}/${r.totalFound}`).join(", "));
        }).catch(err => console.error("[Scraper] Batch error:", err));
        return;
      }

      if (storeUrls && Array.isArray(storeUrls)) {
        res.json({ message: `Scraping ${storeUrls.length} stores in background` });
        scrapeMultipleStores(storeUrls).then(results => {
          console.log("[Scraper] Batch complete:", results.map(r => `${r.storeName}: ${r.synced}/${r.totalFound}`).join(", "));
        }).catch(err => console.error("[Scraper] Batch error:", err));
        return;
      }

      if (storeUrl) {
        res.json({ message: `Scraping ${storeUrl} in background` });
        scrapeStoreFn(storeUrl).then(result => {
          console.log(`[Scraper] Done: ${result.storeName}: ${result.synced}/${result.totalFound} products`);
        }).catch(err => console.error("[Scraper] Error:", err));
        return;
      }

      res.status(400).json({ message: "Provide storeUrl, storeUrls[], or useInitialList: true" });
    } catch (err: any) {
      console.error("Scrape error:", err);
      res.status(500).json({ message: "Error al iniciar scraping", error: err.message });
    }
  });

  app.get("/api/admin/scrape/status", requireAuth, async (req, res) => {
    try {
      // Count scraped products by brand
      const result = await pool.query(`
        SELECT b.name, b.slug, COUNT(p.id) as product_count, MAX(p.updated_at) as last_updated
        FROM brands b
        JOIN products p ON p.brand_id = b.id
        WHERE p.external_provider = 'tiendanube_scraped'
        GROUP BY b.id, b.name, b.slug
        ORDER BY product_count DESC
      `);

      const totalScraped = await pool.query(`
        SELECT COUNT(*) as total FROM products WHERE external_provider = 'tiendanube_scraped'
      `);

      res.json({
        totalScrapedProducts: parseInt(totalScraped.rows[0]?.total || "0"),
        brands: result.rows,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  seedDatabase().catch(console.error);
  return httpServer;
}

async function seedDatabase() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');

    // Add CPC columns if not exists
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS cpc_rate numeric DEFAULT '0'`);
    await pool.query(`ALTER TABLE product_clicks ADD COLUMN IF NOT EXISTS cpc_amount numeric`);
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

  // Seed categories if empty
  let cats = await db.select().from(categories);
  if (cats.length === 0) {
    await db.insert(categories).values([
      { name: "Tops" },
      { name: "Bottoms" },
      { name: "Footwear" },
      { name: "Outerwear" },
      { name: "Accessories" },
      { name: "Dresses" },
    ]);
    cats = await db.select().from(categories);
    console.log("Seeded categories:", cats.map(c => c.name).join(", "));
  }

  // Seed brands if empty
  let b = await db.select().from(brands);
  if (b.length === 0) {
    await db.insert(brands).values([
      { name: "DREVO Selection", slug: "drevo-selection", country: "AR", status: "approved" },
      { name: "Studio Noir", slug: "studio-noir", country: "AR", status: "approved" },
    ]);
    b = await db.select().from(brands);
    console.log("Seeded brands:", b.map(br => br.name).join(", "));
  }

  const topsId = cats.find(c => c.name === "Tops")?.id;
  const bottomsId = cats.find(c => c.name === "Bottoms")?.id;
  const footId = cats.find(c => c.name === "Footwear")?.id;
  const outerId = cats.find(c => c.name === "Outerwear")?.id;

  if (!b[0]) {
    console.error("Seed: No brands available. Skipping product seed.");
    return;
  }
  const brand1 = b[0].id;
  const brand2 = b[1]?.id || b[0].id;

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
