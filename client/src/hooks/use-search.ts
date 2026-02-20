import { useQuery, useMutation } from "@tanstack/react-query";
import { api, type SearchRequest, type SearchResponse } from "@shared/routes";

// Hooks for Search Functionality

export function useSearchProducts() {
  return useMutation({
    mutationFn: async (data: SearchRequest) => {
      const res = await fetch(api.search.searchProducts.path, {
        method: api.search.searchProducts.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        throw new Error("Failed to search products");
      }
      
      return api.search.searchProducts.responses[200].parse(await res.json());
    },
  });
}

// Hook for fetching a single product detail
export function useProduct(id: string) {
  return useQuery({
    queryKey: [api.products.get.path, id],
    queryFn: async () => {
      // In a real app, this would use a proper typed endpoint from shared/routes
      // Since shared/routes defines responses[200] as z.any(), we cast locally if needed
      // or just return the raw JSON for now.
      const url = api.products.get.path.replace(":id", id);
      const res = await fetch(url);
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      
      return await res.json();
    },
    enabled: !!id,
  });
}
