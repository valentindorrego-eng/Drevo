import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ProductCard } from "@/components/ProductCard";
import { Link, useLocation } from "wouter";
import { Plus, Bookmark, ArrowLeft, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Collections() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: collections = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/collections"],
    enabled: isAuthenticated,
  });

  const { data: collectionItems = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/collections", selectedCollectionId, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${selectedCollectionId}/items`, { credentials: "include" });
      if (!res.ok) throw new Error("Error");
      return res.json();
    },
    enabled: !!selectedCollectionId,
  });

  const createCollection = useMutation({
    mutationFn: async (data: { name: string; emoji?: string }) => {
      const res = await apiRequest("POST", "/api/collections", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setShowNewForm(false);
      setNewCollectionName("");
    },
  });

  const removeItem = useMutation({
    mutationFn: async ({ collectionId, productId }: { collectionId: string; productId: string }) => {
      await apiRequest("DELETE", `/api/collections/${collectionId}/items/${productId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections", selectedCollectionId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-products"] });
      toast({ title: "Producto eliminado de la colección" });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <Bookmark className="w-16 h-16 text-muted-foreground" />
          <h1 className="text-3xl font-display font-bold">Guardá tus productos favoritos</h1>
          <p className="text-muted-foreground max-w-md">Iniciá sesión para crear colecciones y guardar los productos que te gustan.</p>
          <Link href="/auth">
            <span className="px-8 py-3 bg-foreground text-background font-semibold rounded hover:bg-foreground/80 transition-colors cursor-pointer" data-testid="link-auth-collections">
              Iniciar sesión
            </span>
          </Link>
        </div>
      </div>
    );
  }

  if (selectedCollectionId) {
    const collection = collections.find((c: any) => c.id === selectedCollectionId);
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-24 pb-20 px-4 md:px-8 max-w-[1600px] mx-auto">
          <button
            onClick={() => setSelectedCollectionId(null)}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
            data-testid="button-back-collections"
          >
            <ArrowLeft className="w-4 h-4" /> Mis colecciones
          </button>

          <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-collection-name">
            {collection?.emoji || "📌"} {collection?.name || "Colección"}
          </h1>

          {itemsLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : collectionItems.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted-foreground text-lg mb-4">Esta colección está vacía.</p>
              <Link href="/search">
                <span className="text-foreground underline font-medium cursor-pointer">Explorá productos para agregar</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
              {collectionItems.map((product: any, idx: number) => (
                <div key={product.id} className="relative group/item">
                  <ProductCard product={product} index={idx} />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeItem.mutate({ collectionId: selectedCollectionId, productId: product.id });
                    }}
                    className="absolute top-2 right-2 w-8 h-8 bg-background/70 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-400 opacity-0 group-hover/item:opacity-100 transition-all z-10"
                    data-testid={`button-remove-from-collection-${product.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <div className="pt-24 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-display font-bold" data-testid="text-collections-title">Mis Colecciones</h1>
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm hover:border-border transition-all"
            data-testid="button-new-collection"
          >
            <Plus className="w-4 h-4" /> Nueva colección
          </button>
        </div>

        {showNewForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-card border border-border rounded-lg flex gap-3"
          >
            <input
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="Nombre de la colección..."
              className="flex-1 bg-transparent border border-border rounded px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
              data-testid="input-new-collection-name"
              autoFocus
            />
            <button
              onClick={() => newCollectionName.trim() && createCollection.mutate({ name: newCollectionName.trim() })}
              disabled={!newCollectionName.trim()}
              className="px-6 py-2 bg-accent text-black font-medium rounded hover:bg-accent/80 transition-colors disabled:opacity-50"
              data-testid="button-create-collection"
            >
              Crear
            </button>
          </motion.div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : collections.length === 0 ? (
          <div className="text-center py-20">
            <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-lg mb-2">Todavía no tenés colecciones.</p>
            <p className="text-muted-foreground text-sm">Guardá productos desde la búsqueda y se crearán automáticamente.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {collections.map((c: any) => (
              <button
                key={c.id}
                onClick={() => setSelectedCollectionId(c.id)}
                className="p-6 bg-card border border-border rounded-xl text-left hover:border-border transition-all group"
                data-testid={`button-collection-${c.id}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{c.emoji || "📌"}</span>
                  <h3 className="text-lg font-semibold group-hover:text-accent transition-colors">{c.name}</h3>
                </div>
                {c.isDefault && <span className="text-xs text-muted-foreground">Colección principal</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
