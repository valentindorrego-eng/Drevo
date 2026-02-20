-- Migration to setup pgvector and similarity match function
CREATE EXTENSION IF NOT EXISTS vector;

CREATE OR REPLACE FUNCTION match_products (
  query_embedding vector(1536),
  match_count int DEFAULT null,
  min_similarity float DEFAULT 0
) RETURNS TABLE (
  product_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.product_id,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM product_embeddings pe
  JOIN products p ON p.id = pe.product_id
  WHERE p.status = 'active'
    AND 1 - (pe.embedding <=> query_embedding) > min_similarity
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;