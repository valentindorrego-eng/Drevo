import { useRoute, Link, useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useProduct } from "@/hooks/use-search";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { ArrowLeft, Share2, Heart, Info, ShoppingBag, Check, ExternalLink, Sparkles, Search as SearchIcon, Bookmark } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TryOnModal } from "@/components/TryOnModal";
import { trackClick } from "@/hooks/useClickTracker";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id || "";
  const { data: product, isLoading, error } = useProduct(id);
  const [, setLocation] = useLocation();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const { addItem } = useCart();
  const { toast } = useToast();
  const { user, isAuthenticated } = useAuth();

  const { data: savedProducts = [] } = useQuery<string[]>({
    queryKey: ["/api/user/saved-products"],
    enabled: isAuthenticated,
  });

  const { data: userCollections = [] } = useQuery<any[]>({
    queryKey: ["/api/collections"],
    enabled: isAuthenticated,
  });

  const isSaved = savedProducts.includes(id);

  const saveToCollection = useMutation({
    mutationFn: async () => {
      let collectionId: string;
      if (userCollections.length === 0) {
        const res = await apiRequest("POST", "/api/collections", { name: "Guardados", emoji: "❤️" });
        const c = await res.json();
        collectionId = c.id;
      } else {
        collectionId = userCollections[0].id;
      }
      await apiRequest("POST", `/api/collections/${collectionId}/items`, { productId: id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: "Guardado", description: "Producto agregado a tu colección." });
    },
  });

  const removeFromCollection = useMutation({
    mutationFn: async () => {
      if (userCollections.length > 0) {
        await apiRequest("DELETE", `/api/collections/${userCollections[0].id}/items/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/saved-products"] });
      toast({ title: "Eliminado de guardados" });
    },
  });

  const handleBookmark = () => {
    if (!isAuthenticated) {
      toast({ title: "Iniciá sesión", description: "Guardá tus productos favoritos con una cuenta.", variant: "destructive" });
      return;
    }
    if (isSaved) {
      removeFromCollection.mutate();
    } else {
      saveToCollection.mutate();
    }
  };

  const handleExternalClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!product?.externalUrl) return;
    const referralUrl = await trackClick(id);
    window.open(referralUrl || product.externalUrl, "_blank", "noopener,noreferrer");
  };

  const handleSearchSimilar = () => {
    if (product) {
      const brandName = product.brand?.name || "";
      const q = `Similar a ${product.title}${brandName ? ` de ${brandName}` : ""}`;
      setLocation(`/search?q=${encodeURIComponent(q)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 flex flex-col items-center justify-center text-center gap-4 px-4">
          <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mb-2">
            <SearchIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-display font-bold">Producto no encontrado</h2>
          <p className="text-muted-foreground max-w-md">Es posible que el producto haya sido eliminado o que el enlace sea incorrecto.</p>
          <div className="flex gap-3 mt-4">
            <Link href="/search" className="px-6 py-2.5 bg-foreground text-background rounded font-semibold hover:bg-neutral-200 transition-colors">
              Buscar productos
            </Link>
            <Link href="/" className="px-6 py-2.5 border border-border rounded font-medium text-neutral-300 hover:text-foreground transition-colors">
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const variants = product.variants || [];
  const hasVariants = variants.length > 0;
  const images = product.images || [];
  const currentImage = images[selectedImageIdx]?.url || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200";

  const handleAddToCart = () => {
    const sizeToUse = hasVariants ? selectedSize : "Único";
    if (!sizeToUse) {
      toast({ title: "Seleccioná un talle", description: "Elegí tu talle antes de agregar al carrito.", variant: "destructive" });
      return;
    }
    const selectedSizeResolved = sizeToUse;

    const variant = product.variants?.find((v: any) => v.sizeLabel === selectedSizeResolved);
    addItem({
      id: product.id,
      title: product.title,
      basePrice: Number(product.basePrice),
      salePrice: product.salePrice ? Number(product.salePrice) : null,
      currency: product.currency || "ARS",
      imageUrl: images[0]?.url || "",
      brand: product.brand?.name || "DREVO",
      brandId: product.brandId || null,
      sizeLabel: selectedSizeResolved,
      externalUrl: product.externalUrl || null,
      variantId: variant?.id || null,
    });

    setJustAdded(true);
    toast({ title: "Agregado al carrito", description: `${product.title} (${selectedSizeResolved})` });
    setTimeout(() => setJustAdded(false), 2000);
  };

  const price = Number(product.salePrice || product.basePrice);
  const originalPrice = product.salePrice ? Number(product.basePrice) : null;
  const currency = product.currency || "ARS";

  const formatPrice = (p: number) => {
    return currency === "ARS"
      ? `$${p.toLocaleString("es-AR")}`
      : `$${p.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-8 transition-colors"
          data-testid="link-back-search"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">

          <div className="lg:col-span-7 space-y-4">
            <motion.div
              key={selectedImageIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="aspect-[3/4] w-full bg-card overflow-hidden rounded-lg"
            >
              <img
                src={currentImage}
                alt={product.title}
                className="w-full h-full object-cover"
                data-testid="img-product-main"
              />
            </motion.div>

            {images.length > 1 && (
              <div className="grid grid-cols-4 gap-4">
                {images.map((img: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImageIdx(idx)}
                    className={cn(
                      "aspect-[3/4] bg-card rounded-md overflow-hidden cursor-pointer transition-opacity",
                      selectedImageIdx === idx ? "opacity-100 ring-2 ring-white" : "opacity-60 hover:opacity-100"
                    )}
                    data-testid={`button-thumbnail-${idx}`}
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 relative">
            <div className="sticky top-32 space-y-8">

              <div className="space-y-2 border-b border-border pb-8">
                <div className="flex justify-between items-start">
                  <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase" data-testid="text-brand-name">
                    {product.brand?.name || "DREVO Selection"}
                  </h2>
                  <div className="flex gap-4">
                    <button
                      onClick={async () => {
                        const url = window.location.href;
                        const shareData = { title: product.title, text: `Mirá ${product.title} en DREVO`, url };
                        if (navigator.share) {
                          try { await navigator.share(shareData); } catch {}
                        } else {
                          await navigator.clipboard.writeText(url);
                          toast({ title: "Link copiado", description: "El enlace fue copiado al portapapeles." });
                        }
                      }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Compartir producto"
                      data-testid="button-share"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleBookmark}
                      className={cn(
                        "transition-colors",
                        isSaved ? "text-accent" : "text-muted-foreground hover:text-accent"
                      )}
                      data-testid="button-favorite"
                    >
                      {isSaved ? <Bookmark className="w-5 h-5 fill-current" /> : <Bookmark className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-semibold leading-tight" data-testid="text-product-title">
                  {product.title}
                </h1>
                <div className="flex items-baseline gap-3 pt-2">
                  <p className="text-2xl font-light" data-testid="text-product-price">
                    {formatPrice(price)}
                  </p>
                  {originalPrice && (
                    <p className="text-lg text-muted-foreground line-through" data-testid="text-original-price">
                      {formatPrice(originalPrice)}
                    </p>
                  )}
                </div>
              </div>

              {variants.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-300">Seleccionar Talle</span>
                    <button className="text-muted-foreground underline">Guía de talles</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {variants.map((v: any) => {
                      const isOutOfStock = v.stockQty <= 0;
                      const label = v.sizeLabel || v.size_label || "?";
                      return (
                        <button
                          key={label}
                          disabled={isOutOfStock}
                          onClick={() => setSelectedSize(label)}
                          data-testid={`button-size-${label}`}
                          className={cn(
                            "h-12 border rounded flex items-center justify-center text-sm font-medium transition-all",
                            selectedSize === label
                              ? "bg-foreground text-background border-foreground"
                              : "bg-transparent text-foreground border-border hover:border-foreground",
                            isOutOfStock && "opacity-30 cursor-not-allowed decoration-slice line-through"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-4">
                <button
                  onClick={handleAddToCart}
                  disabled={justAdded}
                  data-testid="button-add-to-cart"
                  className={cn(
                    "w-full h-14 rounded font-semibold text-lg transition-all flex items-center justify-center gap-2",
                    justAdded
                      ? "bg-green-600 text-white"
                      : "bg-foreground text-background hover:bg-neutral-200"
                  )}
                >
                  <AnimatePresence mode="wait">
                    {justAdded ? (
                      <motion.span key="added" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                        <Check className="w-5 h-5" /> Agregado
                      </motion.span>
                    ) : (
                      <motion.span key="add" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                        Agregar al carrito <ShoppingBag className="w-5 h-5" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>

                <button
                  onClick={() => {
                    if (!user) {
                      toast({ title: "Iniciá sesión", description: "Necesitás una cuenta para usar el probador virtual.", variant: "destructive" });
                      return;
                    }
                    setTryOnOpen(true);
                  }}
                  data-testid="button-try-on"
                  className="w-full h-12 bg-foreground border border-accent/30 rounded font-medium text-sm text-accent hover:bg-foreground/90 hover:border-accent/50 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Probar producto
                </button>

                {product.externalUrl && (
                  <a
                    href={product.externalUrl}
                    onClick={handleExternalClick}
                    data-testid="link-buy-external"
                    className="w-full h-12 border border-border rounded font-medium text-sm text-neutral-300 hover:text-foreground hover:border-foreground transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    Ver en tienda oficial <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <button
                  onClick={handleSearchSimilar}
                  data-testid="button-search-similar"
                  className="w-full h-12 border border-border rounded font-medium text-sm text-muted-foreground hover:text-foreground hover:border-white/30 transition-all flex items-center justify-center gap-2"
                >
                  <SearchIcon className="w-4 h-4" /> Buscar algo similar
                </button>

                <p className="text-center text-xs text-muted-foreground">
                  Envío gratis en compras superiores a $100.000
                </p>
              </div>

              <div className="border-t border-border pt-6 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> Descripción
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed" data-testid="text-product-description">
                  {product.description || "Una prenda esencial diseñada para elevar tu guardarropa diario. Confeccionada con materiales de primera calidad para asegurar durabilidad y confort."}
                </p>

                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {product.tags.map((t: any) => (
                      <span key={t.tag} className="text-xs px-2 py-1 bg-card rounded text-muted-foreground">
                        #{t.tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>

      <TryOnModal
        productId={id}
        productTitle={product.title}
        productImage={currentImage}
        isOpen={tryOnOpen}
        onClose={() => setTryOnOpen(false)}
      />
    </div>
  );
}
