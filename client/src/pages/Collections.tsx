import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ProductCard } from "@/components/ProductCard";
import { Link, useLocation } from "wouter";
import { Plus, Bookmark, ArrowLeft, Trash2, Loader2, Pencil, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

const EMOJI_OPTIONS = ["📌", "❤️", "🔥", "⭐", "👗", "👟", "👜", "🧥", "💎", "🎯", "🌙", "☀️", "🖤", "💜", "🤍", "✨", "🏖️", "💼", "🎉", "🏃"];

export default function Collections() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionEmoji, setNewCollectionEmoji] = useState("📌");
  const [showNewForm, setShowNewForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

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
      setNewCollectionEmoji("📌");
    },
  });

  const updateCollection = useMutation({
    mutationFn: async ({ id, name, emoji }: { id: string; name?: string; emoji?: string }) => {
      const res = await apiRequest("PUT", `/api/collections/${id}`, { name, emoji });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setEditingId(null);
      toast({ title: "Colección actualizada" });
    },
  });

  const deleteCollection = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/collections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      setSelectedCollectionId(null);
      toast({ title: "Colección eliminada" });
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

  // ─── Collection detail view ───
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

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-display font-bold" data-testid="text-collection-name">
              {collection?.emoji || "📌"} {collection?.name || "Colección"}
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingId(selectedCollectionId);
                  setEditName(collection?.name || "");
                  setEditEmoji(collection?.emoji || "📌");
                }}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (confirm("¿Eliminar esta colección y todos sus productos guardados?")) {
                    deleteCollection.mutate(selectedCollectionId);
                  }
                }}
                className="p-2 text-muted-foreground hover:text-red-400 transition-colors"
                title="Eliminar colección"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline edit */}
          {editingId === selectedCollectionId && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-4 bg-card border border-border rounded-lg space-y-3"
            >
              <div className="flex gap-3">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 bg-transparent border border-border rounded px-4 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                  autoFocus
                />
                <button
                  onClick={() => editName.trim() && updateCollection.mutate({ id: selectedCollectionId, name: editName.trim(), emoji: editEmoji })}
                  disabled={!editName.trim()}
                  className="px-4 py-2 bg-accent text-black rounded hover:bg-accent/80 transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setEditEmoji(e)}
                    className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${editEmoji === e ? "bg-accent/20 border border-accent/50 scale-110" : "bg-card border border-border hover:border-border"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

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

  // ─── Collections list view ───
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
            className="mb-8 p-4 bg-card border border-border rounded-lg space-y-3"
          >
            <div className="flex gap-3">
              <input
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Nombre de la colección..."
                className="flex-1 bg-transparent border border-border rounded px-4 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/50"
                data-testid="input-new-collection-name"
                autoFocus
              />
              <button
                onClick={() => newCollectionName.trim() && createCollection.mutate({ name: newCollectionName.trim(), emoji: newCollectionEmoji })}
                disabled={!newCollectionName.trim()}
                className="px-6 py-2 bg-accent text-black font-medium rounded hover:bg-accent/80 transition-colors disabled:opacity-50"
                data-testid="button-create-collection"
              >
                Crear
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewCollectionName(""); }}
                className="px-3 py-2 border border-border rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => setNewCollectionEmoji(e)}
                  className={`w-9 h-9 text-lg rounded-lg flex items-center justify-center transition-all ${newCollectionEmoji === e ? "bg-accent/20 border border-accent/50 scale-110" : "bg-card border border-border hover:border-border"}`}
                >
                  {e}
                </button>
              ))}
            </div>
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
              <div key={c.id} className="relative group">
                <button
                  onClick={() => setSelectedCollectionId(c.id)}
                  className="w-full p-6 bg-card border border-border rounded-xl text-left hover:border-accent/30 transition-all"
                  data-testid={`button-collection-${c.id}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{c.emoji || "📌"}</span>
                    <h3 className="text-lg font-semibold group-hover:text-accent transition-colors">{c.name}</h3>
                  </div>
                  {c.isDefault && <span className="text-xs text-muted-foreground">Colección principal</span>}
                </button>
                {/* Quick actions on hover */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(c.id);
                      setEditName(c.name);
                      setEditEmoji(c.emoji || "📌");
                    }}
                    className="p-1.5 rounded-md bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("¿Eliminar esta colección?")) deleteCollection.mutate(c.id);
                    }}
                    className="p-1.5 rounded-md bg-background/80 text-muted-foreground hover:text-red-400 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline edit for list view */}
                {editingId === c.id && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-card border border-accent/30 rounded-xl p-4 z-10 space-y-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 bg-transparent border border-border rounded px-3 py-1.5 text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-accent/50"
                        autoFocus
                      />
                      <button
                        onClick={() => editName.trim() && updateCollection.mutate({ id: c.id, name: editName.trim(), emoji: editEmoji })}
                        className="px-3 py-1.5 bg-accent text-black text-sm rounded hover:bg-accent/80"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 border border-border text-sm rounded text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJI_OPTIONS.map((e) => (
                        <button
                          key={e}
                          onClick={() => setEditEmoji(e)}
                          className={`w-8 h-8 text-base rounded flex items-center justify-center transition-all ${editEmoji === e ? "bg-accent/20 border border-accent/50" : "hover:bg-card"}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
