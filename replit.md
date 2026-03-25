# DREVO - AI-Powered Fashion Marketplace

## Overview

DREVO is a vertical fashion marketplace MVP where users search for clothing by intent (vibe, occasion, style) using natural language, and the platform returns AI-ranked product results across brands. The core differentiator is an "AI intent search" — users type queries like "outfit minimalista negro para noche" and get semantically matched, re-ranked products with outfit bundle suggestions.

The app is a monorepo with a React (Vite) frontend, Express backend, PostgreSQL database with pgvector for vector similarity search, and OpenAI integration for embeddings and intent extraction. The UI copy is primarily in Spanish (Argentina).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (client/)
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: wouter (lightweight client-side router)
- **State/Data Fetching**: TanStack React Query with mutation-based search
- **UI Components**: shadcn/ui (Radix primitives + Tailwind CSS), extensive component library in `client/src/components/ui/`
- **Animations**: Framer Motion for page transitions and product card animations
- **Styling**: Tailwind CSS with CSS variables for theming. Strictly dark mode (#000 background, white text). Fonts: Inter (body) + Space Grotesk (display/headers)
- **Key Pages**:
  - `/` — Landing page with hero, search bar, prompt chips
  - `/search?q=...` — AI search results with outfit bundles and product grid
  - `/product/:id` — Product detail page
  - `/cart` — Functional cart with localStorage persistence, quantity controls, and links to buy on the original store
- **Path Aliases**: `@/` → `client/src/`, `@shared/` → `shared/`, `@assets/` → `attached_assets/`

### Backend (server/)
- **Framework**: Express 5 on Node.js, running via tsx
- **Entry Point**: `server/index.ts` creates HTTP server, registers routes, serves static/Vite
- **API Routes**: Defined in `server/routes.ts`, with shared type definitions in `shared/routes.ts`
- **Key API Endpoint**: `POST /api/search` — the core AI search endpoint that:
  1. Extracts structured intent from natural language using OpenAI chat completions (GPT-4o-mini)
  2. Generates query embeddings using OpenAI embeddings API (text-embedding-3-small)
  3. Performs vector similarity search via pgvector's `match_products` RPC
  4. Re-ranks results with a scoring function (similarity × 0.65 + color/occasion/style/stock boosts)
  5. Composes outfit bundles (TOP + BOTTOM + FOOTWEAR) for outfit-type queries
  6. Returns ranked products with match reasons
- **Dev Mode**: Vite dev server middleware with HMR (`server/vite.ts`)
- **Production**: Static file serving from `dist/public` (`server/static.ts`)

### Shared Code (shared/)
- `shared/schema.ts` — Drizzle ORM schema definitions (PostgreSQL tables)
- `shared/routes.ts` — API route definitions with Zod validation schemas for request/response types

### Database
- **Engine**: PostgreSQL (Replit-provisioned) with pgvector extension
- **ORM**: Drizzle ORM with `drizzle-kit` for schema push (`npm run db:push`)
- **Core Tables**:
  - `categories` — Product categories (hierarchical via parent_id)
  - `brands` — Brand profiles (name, slug, country, status, commission rate)
  - `products` — Product listings (title, description, price, brand, category, gender, status)
  - `product_variants` — Size/SKU/stock variants per product
  - `product_images` — Product image URLs with position ordering
  - `product_tags` — Freeform tags per product (used for search matching)
  - `product_embeddings` — Vector embeddings (pgvector) per product for semantic search
  - `search_queries` — Log of user search queries with extracted intent
  - `brand_integrations` — OAuth tokens for connected stores (Tiendanube)
  - `users` — User accounts with email/password or Google OAuth, physical attributes (height, weight, body type, preferred size), profile image
  - `tryon_results` — Cached virtual try-on results (userId, productId, userImageUrl, resultImageUrl)
- **Vector Search**: pgvector extension with a `match_products` SQL RPC function for cosine similarity search
- **Seeding**: Application auto-seeds dummy brands, products, categories, variants, tags, and images on startup

### AI/Search Pipeline
1. User submits natural language query
2. OpenAI chat completion extracts structured intent (occasion, colors, style tags, intent type, preferred categories)
3. Heuristic fallback enriches intent for common Spanish/English fashion terms
4. OpenAI embeddings API generates query vector
5. pgvector `match_products` retrieves top ~40 candidates by cosine similarity
6. Server-side re-ranking applies boosts: color match (+0.15), color conflict (-0.20), occasion match (+0.08), style match (+0.05), in-stock (+0.05), size available (+0.08) / size unavailable (-0.50)
7. For outfit queries, compose bundle: pick best product per category slot (tops, bottoms, footwear, outerwear), with size preference in all slot and complement candidate sorting
8. Size-aware filtering: when user has `preferredSize` set, results without stock in that size are penalized and optionally filtered out (fallback to unfiltered if <3 results remain)
9. Return ranked results with human-readable match reasons and optional `sizeFilter` metadata

### Build System
- **Dev**: `npm run dev` → `tsx server/index.ts` with Vite middleware
- **Build**: `npm run build` → Vite builds client to `dist/public`, esbuild bundles server to `dist/index.cjs`
- **Production**: `npm start` → `node dist/index.cjs`
- **DB Push**: `npm run db:push` → `drizzle-kit push`
- **Reindex**: `npx tsx scripts/reindex.ts` → regenerates all product embeddings

### Storage Layer
- `server/storage.ts` — `DatabaseStorage` class implementing `IStorage` interface for product queries, user CRUD, and search query logging
- `server/auth.ts` — Passport.js configuration with local (email+bcrypt) and Google OAuth strategies, session serialization

### Authentication
- **Session**: express-session with connect-pg-simple (PostgreSQL session store), session regeneration on login/register, full destruction on logout
- **Strategies**: Passport.js local strategy (email + bcryptjs), Google OAuth 2.0 (optional, requires GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)
- **Key Pages**: `/auth` (login/register), `/profile` (user profile with physical attributes)
- **API Routes**: POST `/api/auth/register`, POST `/api/auth/login`, POST `/api/auth/logout`, GET `/api/auth/me`, PUT `/api/auth/profile`
- **Frontend**: `useAuth` hook wrapping TanStack Query for auth state management

## External Dependencies

### Required Services
- **PostgreSQL Database**: Auto-provisioned by Replit. Must have pgvector extension enabled. Connection via `DATABASE_URL` environment variable.
- **OpenAI API**: Used for two purposes:
  1. **Embeddings** (`text-embedding-3-small` by default, configurable via `OPENAI_EMBEDDING_MODEL` secret) — generates vector representations of products and search queries
  2. **Chat Completions** (`gpt-4o-mini` by default, configurable via `OPENAI_CHAT_MODEL` secret) — extracts structured fashion intent from natural language queries
  - Requires `OPENAI_API_KEY` secret. Search degrades gracefully (basic text matching) if key is missing.

### Virtual Try-On Pipeline
- Uses **Gemini 2.5 Flash Image** (`gemini-2.5-flash-image`) via Replit AI Integrations
- Multimodal input: user photo + product image sent as base64 inline data
- Single-call generation: Gemini receives both images and generates the try-on result directly
- Optimized prompt focused on garment replacement with ultra-realistic output
- Per-user rate limiting (5 generations/hour), DB-backed caching with latest-result retrieval
- Auth-gated `/uploads/tryon` route for privacy
- Integration files: `server/replit_integrations/image/` (client + routes)

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit` — ORM and migration tooling for PostgreSQL
- `openai` — Official OpenAI SDK (embeddings + intent extraction)
- `@google/genai` — Google Gemini SDK (virtual try-on image generation via Replit AI Integrations)
- `express` v5 — HTTP server
- `@tanstack/react-query` — Client-side data fetching/caching
- `framer-motion` — Animations
- `wouter` — Client-side routing
- `zod` + `drizzle-zod` — Schema validation
- `shadcn/ui` ecosystem (Radix primitives, Tailwind, class-variance-authority)
- `pg` — PostgreSQL client (node-postgres)
- `p-limit` + `p-retry` — Batch processing rate limiting and retries

### Environment Variables
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Replit) |
| `OPENAI_API_KEY` | Yes | OpenAI API key for embeddings and chat |
| `OPENAI_EMBEDDING_MODEL` | No | Override embedding model (default: `text-embedding-3-small`) |
| `OPENAI_CHAT_MODEL` | No | Override chat model for intent extraction (default: `gpt-4o-mini`) |
| `OPENAI_VISION_MODEL` | No | Override vision model for product image analysis during sync (default: `gpt-4o`) |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | Auto | Gemini API base URL (auto-set by Replit AI Integrations) |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Auto | Gemini API key (auto-set by Replit AI Integrations) |
| `SESSION_SECRET` | Yes (prod) | Session signing secret (required in production, has dev fallback) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID (enables Google login) |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |