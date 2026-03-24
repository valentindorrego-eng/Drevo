import { z } from 'zod';
import { products, productVariants, productImages, productTags, brands } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Return type for search
export const searchResultProductSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  basePrice: z.number(),
  salePrice: z.number().nullable(),
  currency: z.string().nullable(),
  brand: z.object({ name: z.string(), slug: z.string() }).nullable(),
  images: z.array(z.object({ url: z.string(), position: z.number().nullable() })),
  variants: z.array(z.object({ sizeLabel: z.string(), stockQty: z.number().nullable() })),
  tags: z.array(z.string()),
  similarity: z.number(),
  reasons: z.array(z.string()).optional()
});

export const searchResponseSchema = z.object({
  query: z.string(),
  intent: z.any().optional(),
  results: z.array(searchResultProductSchema),
  suggested_filters: z.object({
    sizes: z.array(z.string()),
    brands: z.array(z.string())
  }).optional(),
  outfit_bundles: z.array(z.object({
    title: z.string(),
    items: z.array(searchResultProductSchema.extend({ slot: z.string().optional() }))
  })).optional(),
  sizeFilter: z.object({
    size: z.string(),
    enabled: z.boolean(),
  }).optional(),
});

export const api = {
  search: {
    searchProducts: {
      method: 'POST' as const,
      path: '/api/search' as const,
      input: z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).optional(),
        userSize: z.string().optional(),
        sizeFilterEnabled: z.boolean().optional(),
      }),
      responses: {
        200: searchResponseSchema,
        400: errorSchemas.validation,
        500: errorSchemas.internal
      }
    }
  },
  products: {
    get: {
      method: 'GET' as const,
      path: '/api/products/:id' as const,
      responses: {
        200: z.any(), // Product with related data
        404: errorSchemas.notFound
      }
    }
  },
  admin: {
    reindex: {
      method: 'POST' as const,
      path: '/api/admin/reindex' as const,
      input: z.object({
        secret: z.string()
      }),
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        401: z.object({ message: z.string() }),
        500: errorSchemas.internal
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type SearchRequest = z.infer<typeof api.search.searchProducts.input>;
export type SearchResponse = z.infer<typeof api.search.searchProducts.responses[200]>;
