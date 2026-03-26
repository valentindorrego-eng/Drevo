import { useQuery, useMutation } from "@tanstack/react-query";
import { api, type SearchRequest, type SearchResponse } from "@shared/routes";
import { useAuth } from "./useAuth";

export function useSearchProducts() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: SearchRequest) => {
      const body: SearchRequest = { ...data };
      if (user?.preferredSize && body.userSize === undefined) {
        body.userSize = user.preferredSize;
      }
      if (body.sizeFilterEnabled === undefined && body.userSize) {
        body.sizeFilterEnabled = true;
      }

      const res = await fetch(api.search.searchProducts.path, {
        method: api.search.searchProducts.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        throw new Error("Failed to search products");
      }
      
      return api.search.searchProducts.responses[200].parse(await res.json());
    },
  });
}

export function useSayMore() {
  return useMutation({
    mutationFn: async (data: { productId: string; refinement: string }) => {
      const res = await fetch("/api/search/say-more", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to refine search");
      return await res.json();
    },
  });
}

export function useVisualSearch() {
  return useMutation({
    mutationFn: async (data: { image: File; context?: string }) => {
      const formData = new FormData();
      formData.append("image", data.image);
      if (data.context) formData.append("context", data.context);
      const res = await fetch("/api/search/visual", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to search by image");
      return await res.json();
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: [api.products.get.path, id],
    queryFn: async () => {
      const url = api.products.get.path.replace(":id", id);
      const res = await fetch(url);
      
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch product");
      
      return await res.json();
    },
    enabled: !!id,
  });
}
