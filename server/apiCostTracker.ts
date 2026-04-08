import { pool } from "./db";

// Pricing per 1M tokens (USD) — updated April 2026
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] || PRICING["gpt-4o-mini"];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

export async function logApiUsage(params: {
  service: string;
  model?: string;
  endpoint?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const { service, model, endpoint, inputTokens = 0, outputTokens = 0, metadata } = params;
    const totalTokens = params.totalTokens || (inputTokens + outputTokens);
    const estimatedCostUsd = model ? estimateCost(model, inputTokens, outputTokens) : 0;

    await pool.query(
      `INSERT INTO api_usage_logs (service, model, endpoint, input_tokens, output_tokens, total_tokens, estimated_cost_usd, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [service, model || null, endpoint || null, inputTokens, outputTokens, totalTokens, estimatedCostUsd.toFixed(6), metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    // Don't let cost tracking break the app
    console.error("[CostTracker] Error logging:", err);
  }
}

// Ensure table exists on startup
export async function ensureApiUsageTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      service text NOT NULL,
      model text,
      endpoint text,
      input_tokens integer DEFAULT 0,
      output_tokens integer DEFAULT 0,
      total_tokens integer DEFAULT 0,
      estimated_cost_usd numeric DEFAULT 0,
      metadata jsonb,
      created_at timestamp DEFAULT now()
    )
  `);
}
