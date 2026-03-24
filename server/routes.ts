import express, { type Request, type Response, type NextFunction } from "express";
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { db, pool } from "./db";
import { products, brands, categories, productImages, productVariants, productTags, productEmbeddings, brandIntegrations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { passport } from "./auth";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";

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
      req.session.regenerate((regenErr) => {
        if (regenErr) return res.status(500).json({ message: "Error al iniciar sesión" });
        req.login(user, (err) => {
          if (err) return res.status(500).json({ message: "Error al iniciar sesión" });
          const { passwordHash: _, ...safeUser } = user;
          return res.json(safeUser);
        });
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
      req.session.regenerate((regenErr) => {
        if (regenErr) return res.status(500).json({ message: "Error al iniciar sesión" });
        req.login(user, (loginErr) => {
          if (loginErr) return res.status(500).json({ message: "Error al iniciar sesión" });
          const { passwordHash: _, ...safeUser } = user;
          return res.json(safeUser);
        });
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
      const updated = await storage.updateUser(req.user!.id, {
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
      const updated = await storage.updateUser(req.user!.id, { profileImageUrl });
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
      const updated = await storage.updateUser(req.user!.id, { fullBodyImageUrl });
      if (!updated) return res.status(404).json({ message: "Usuario no encontrado" });
      const { passwordHash: _, ...safeUser } = updated;
      res.json(safeUser);
    } catch (error) {
      console.error("Full body upload error:", error);
      res.status(500).json({ message: "Error al subir la imagen" });
    }
  });

  app.use("/uploads/tryon", requireAuth, express.static(path.join(process.cwd(), "uploads", "tryon")));
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

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
    // Use env var if set, otherwise build from request host
    const redirectUri = process.env.TIENDANUBE_REDIRECT_URI ||
      `${req.protocol}://${req.get("host")}/auth/tiendanube/callback`;

    const state = Math.random().toString(36).substring(7);
    const params = new URLSearchParams({ state, redirect_uri: redirectUri });
    const authUrl = `https://www.tiendanube.com/apps/${clientId}/authorize?${params.toString()}`;
    console.log("[TN OAuth] Redirecting to:", authUrl);
    console.log("[TN OAuth] redirect_uri:", redirectUri);
    res.redirect(authUrl);
  });

  // Get all integrations (for frontend status check)
  app.get("/api/integrations", async (req, res) => {
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
          .set({ accessToken: access_token, updatedAt: new Date() })
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
      const authenticatedUser = req.user as { id: string; preferredSize?: string | null } | undefined;
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
                content: `You are a fashion search intent extractor. Parse the user query into JSON.

RULES:
- If the query mentions 2+ different garment types (e.g. "remera y pantalón"), set intent_type to "outfit"
- For outfit queries, must_include should be an array where EACH entry is a COMPLETE search phrase for one garment, including its color/pattern. Example: "remera gris con estampa blanca y bermuda negra" → must_include: ["remera gris con estampa blanca", "bermuda negra"]
- colors.primary = ALL colors mentioned in the query (both Spanish and English)
- colors.secondary = colors that are secondary/accent (e.g. the print color, not the base)
- exclude = things the user explicitly doesn't want (e.g. "no deportiva" → ["deportiva"])
- If the user's preferred size is provided (e.g. [User preferred size: M]), consider it as context for better matching but do NOT add it to the JSON output

JSON schema:
{
  "query_language": "es" | "en",
  "intent_type": "outfit" | "single_item",
  "occasion": "noche" | "oficina" | "gym" | "casual" | "cena" | "viaje" | "playa" | null,
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
              { role: "user", content: userSize ? `${input.query}\n\n[User preferred size: ${userSize}]` : input.query }
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
        for (const itemQuery of intent.must_include) {
          const results = await doVectorSearch(itemQuery, 20);
          for (const r of results) {
            if (!seenIds.has(r.product.id)) {
              seenIds.add(r.product.id);
              candidates.push(r.product);
              similarities.set(r.product.id, r.similarity);
            }
          }
        }
        if (candidates.length < 10) {
          const mainResults = await doVectorSearch(input.query, 40);
          for (const r of mainResults) {
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
            score += 0.15;
            reasons.push(`Color ${colorDisplayName[color] || color}`);
          }
        });
        if (intent.colors.secondary) {
          intent.colors.secondary.forEach((color: string) => {
            const synonyms = allColorWords[color] || [color];
            if (synonyms.some(s => pText.includes(s))) {
              score += 0.10;
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
          if (p.gender === intent.gender || p.gender === "unisex") {
            score += 0.05;
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
          reasons: [...new Set(reasons)].slice(0, 3),
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
            if (pTitle.includes(c)) score += 2;
            else if (pTags.includes(c)) score += 1;
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
          const exactTypeWords = [...new Set(rawTypeWords.flatMap(w => synonymMap[w] || [w]))];

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
        const complementSlots = slotDefs.filter(s =>
          !representedSlots.has(s.label) && ["Calzado", "Accesorio"].includes(s.label)
        );
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
          bundleItems.sort((a, b) => slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot));
          outfitBundles.push({
            title: "Outfit recomendado por Drevo",
            items: bundleItems.map(({ _hasUserSize, ...rest }) => rest)
          });
        }
      }

      let filteredResults = scoredResults;
      if (intent.intent_type === "outfit" && outfitBundles.length > 0) {
        const bundleIds = new Set(outfitBundles[0].items.map((i: any) => i.id));
        const allIntentColors = [...(intent.colors?.primary || []), ...(intent.colors?.secondary || [])];
        const mustIncludeTypes = (intent.must_include || []).flatMap((m: string) =>
          m.toLowerCase().match(/remera|camiseta|camisa|musculosa|polo|top|falda|pollera|bermuda|short|pantalon|pantalón|jean|cargo|jogger|calza|campera|buzo|hoodie|sweater|zapatilla|bota|gorra|mochila|bolso|vestido/g) || []
        );
        const typeSynonyms: Record<string, string[]> = {
          remera: ["remera", "camiseta", "tee"], camiseta: ["camiseta", "remera", "tee"],
          falda: ["falda", "pollera"], pollera: ["pollera", "falda"],
          pantalon: ["pantalon", "pantalón", "carpenter", "cargo", "jean"],
          "pantalón": ["pantalón", "pantalon", "carpenter", "cargo", "jean"],
          campera: ["campera", "jacket"], zapatilla: ["zapatilla", "sneaker", "sneakers"],
        };
        const expandedTypes = [...new Set(mustIncludeTypes.flatMap(t => typeSynonyms[t] || [t]))];

        const colorSynonyms: Record<string, string[]> = {
          negro: ["negro", "negra", "black"], blanca: ["blanca", "blanco", "white"],
          gris: ["gris", "grey", "gray"], rosa: ["rosa", "pink"],
          azul: ["azul", "blue"], rojo: ["rojo", "red"], verde: ["verde", "green"],
          beige: ["beige", "crudo"], marron: ["marron", "marrón", "brown"],
          celeste: ["celeste"], bordo: ["bordo", "bordó", "burgundy"],
          lila: ["lila", "purple"], coral: ["coral"], naranja: ["naranja", "orange"],
          amarillo: ["amarillo", "yellow"], black: ["black", "negro", "negra"],
          white: ["white", "blanco", "blanca"], grey: ["grey", "gray", "gris"],
          pink: ["pink", "rosa"], blue: ["blue", "azul"],
        };

        const mustItemParsed = (intent.must_include || []).map((m: string) => {
          const mLower = m.toLowerCase();
          const types = mLower.match(/remera|camiseta|camisa|musculosa|polo|top|falda|pollera|bermuda|short|pantalon|pantalón|jean|cargo|jogger|calza|campera|buzo|hoodie|sweater|zapatilla|bota|gorra|mochila|bolso|vestido|carpenter/g) || [];
          const foundColors: string[] = [];
          for (const [, syns] of Object.entries(colorSynonyms)) {
            if (syns.some(s => mLower.includes(s))) {
              for (const s of syns) { if (!foundColors.includes(s)) foundColors.push(s); }
            }
          }
          const expandedT = [...new Set(types.flatMap(t => typeSynonyms[t] || [t]))];
          return { types: expandedT, colors: foundColors };
        });

        const catSlotMap: Record<string, RegExp> = {
          tops: /remera|camiseta|tee|camisa|top|polo|musculosa|chaleco|vest|crop|body/i,
          bottoms: /pant|jean|cargo|short|pollera|falda|calza|pantalon|pantalón|chino|jogger|bermuda|carpenter/i,
          outerwear: /campera|jacket|buzo|hoodie|sweater|abrigo|bomber|anorak/i,
          footwear: /sneaker|shoe|zapa|bota|boot|sandal|chancla|calzado/i,
          accessories: /media|medias|sock|gorra|cap|hat|vincha|muñequera|mochila|bolso/i,
        };
        const mustItemCategories = mustItemParsed.map(item => {
          for (const [cat, regex] of Object.entries(catSlotMap)) {
            if (item.types.some(t => regex.test(t))) return cat;
          }
          return null;
        });
        const allCatsForFilter = await db.select().from(categories);
        const catNameByIdFilter = new Map(allCatsForFilter.map(c => [c.id, c.name.toLowerCase()]));

        filteredResults = scoredResults.filter(r => {
          if (bundleIds.has(r.id)) return false;
          const rTitle = r.title.toLowerCase();
          const rCatName = catNameByIdFilter.get(r.categoryId) || "";

          for (let i = 0; i < mustItemParsed.length; i++) {
            const item = mustItemParsed[i];
            const itemCat = mustItemCategories[i];
            const titleMatchesType = item.types.some(t => rTitle.includes(t));
            const sameCat = itemCat && rCatName === itemCat;
            if (!titleMatchesType && !sameCat) continue;
            if (item.colors.length === 0) return true;
            const titleMatchesColor = item.colors.some(c => {
              const syns = colorSynonyms[c] || [c];
              return syns.some(s => rTitle.includes(s));
            });
            if (titleMatchesColor) return true;
          }
          return false;
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
      const cached = await storage.getTryonResult(req.user!.id, req.params.productId);
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

      if (forceRegenerate !== "true") {
        const cached = await storage.getTryonResult(req.user!.id, productId);
        if (cached) {
          return res.json(cached);
        }
      }

      if (!checkTryonRateLimit(req.user!.id)) {
        return res.status(429).json({ message: "Alcanzaste el límite de pruebas virtuales. Intentá de nuevo en una hora." });
      }

      const { useProfilePhoto } = req.body;
      const user = req.user!;

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

      function readLocalImage(imgPath: string): { data: string; mimeType: string } | null {
        const stripped = imgPath.startsWith("/") ? imgPath.slice(1) : imgPath;
        const localPath = path.join(process.cwd(), stripped);
        if (!fs.existsSync(localPath)) return null;
        const bytes = fs.readFileSync(localPath);
        const ext = path.extname(localPath).replace(".", "").toLowerCase() || "png";
        const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        return { data: bytes.toString("base64"), mimeType };
      }

      const imageParts: { inlineData: { data: string; mimeType: string } }[] = [];

      if (userImageUrl.startsWith("/")) {
        const imgData = readLocalImage(userImageUrl);
        if (imgData) imageParts.push({ inlineData: imgData });
      }

      if (productImage) {
        if (productImage.startsWith("/")) {
          const imgData = readLocalImage(productImage);
          if (imgData) imageParts.push({ inlineData: imgData });
        } else {
          try {
            const parsedUrl = new URL(productImage);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
              throw new Error("Invalid product image URL protocol");
            }
            const prodImgRes = await fetch(productImage);
            if (prodImgRes.ok) {
              const prodBytes = Buffer.from(await prodImgRes.arrayBuffer());
              const contentType = prodImgRes.headers.get("content-type") || "image/jpeg";
              imageParts.push({ inlineData: { data: prodBytes.toString("base64"), mimeType: contentType } });
            }
          } catch (e) {
            console.error("Failed to fetch product image for try-on:", e);
          }
        }
      }

      if (imageParts.length < 2) {
        return res.status(400).json({ message: "No se pudieron cargar las imágenes necesarias" });
      }

      const { Modality } = await import("@google/genai");
      const { ai } = await import("./replit_integrations/image/client");

      const tryonPrompt = `VIRTUAL TRY-ON TASK:

I am giving you exactly 2 images:
- IMAGE 1: A photo of a real person (the customer)
- IMAGE 2: A clothing product called "${productTitle}"

YOUR JOB: Edit IMAGE 1 to replace the person's current top/clothing with the EXACT garment shown in IMAGE 2. This is a virtual try-on — you must digitally dress the person in the product.

MANDATORY REQUIREMENTS:
1. KEEP THE PERSON IDENTICAL: Same face, same hair, same skin tone, same pose, same body shape, same expression. Do NOT generate a different person.
2. PUT THE EXACT PRODUCT ON THEM: The garment from IMAGE 2 must appear on the person's body — same color, same pattern, same logo, same design details. Do NOT invent a different garment.
3. NATURAL FIT: The garment should look naturally worn — proper draping, wrinkles, and fit based on the person's body.
4. KEEP THE SAME FRAMING: Use a similar camera angle and framing as IMAGE 1. If the person is shown from the waist up, keep that framing. If full-body, keep full-body.
5. CLEAN BACKGROUND: Use a clean neutral studio background (white or light gray).
${physicalDesc ? `6. Person's measurements: ${physicalDesc}` : ""}

Think of it as a photo editing task: take the person from IMAGE 1 and swap their clothing with the product from IMAGE 2.`;

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
        return res.status(500).json({ message: "No se pudo generar la imagen" });
      }

      const imageBuffer = Buffer.from(generatedImagePart.inlineData.data, "base64");
      const resultFilename = `tryon-${req.user!.id.slice(0, 8)}-${productId.slice(0, 8)}-${Date.now()}.png`;
      const resultPath = path.join(process.cwd(), "uploads", "tryon", resultFilename);
      fs.writeFileSync(resultPath, imageBuffer);
      const resultImageUrl = `/uploads/tryon/${resultFilename}`;

      const tryonResult = await storage.createTryonResult({
        userId: req.user!.id,
        productId,
        userImageUrl: userImageUrl,
        resultImageUrl,
      });

      res.json(tryonResult);
    } catch (error) {
      console.error("Try-on generation error:", error);
      res.status(500).json({ message: "Error al generar la imagen de prueba virtual" });
    }
  });

  app.post(api.admin.reindex.path, async (req, res) => {
    res.status(200).json({ success: true, message: "Reindexing triggered via script" });
  });

  // Tiendanube product sync
  app.post("/api/integrations/:integrationId/sync-products", async (req, res) => {
    const { integrationId } = req.params;

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

  seedDatabase().catch(console.error);
  return httpServer;
}

async function seedDatabase() {
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
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
