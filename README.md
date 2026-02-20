# DREVO - Fashion Marketplace MVP

DREVO is a vertical marketplace powered by AI intent search.

## How to run this project

This project is built directly in the Replit environment using Node.js, Express, React, Vite, and Drizzle ORM with a built-in Replit Postgres Database (which automatically supports pgvector).

1. **Set Environment Variables:**
   - Go to the Secrets panel in Replit.
   - Add your `OPENAI_API_KEY` for embeddings and intent extraction.
   - (Optional) Add `OPENAI_EMBEDDING_MODEL` and `OPENAI_CHAT_MODEL`.

2. **Database:**
   - The database is automatically provisioned by Replit.
   - The Drizzle schema is automatically pushed to the database.
   - The application seed logic automatically sets up `pgvector`, the `match_products` RPC, and dummy data when the application starts. 
   - A Supabase migration script is also provided in `supabase/migrations/001_init.sql` per the requirements, but you don't need to run it manually since Replit Postgres handles it.

3. **Start the App:**
   - Click the "Run" button in Replit to start the server.
   - It will automatically run `npm run dev`.

4. **Reindex Embeddings:**
   - Open a Shell tab.
   - Run the script: `npx tsx scripts/reindex.ts`
   - This will generate vector embeddings for all active products using OpenAI.

Now, navigate to `/home` in the preview window to test the AI search intent!
