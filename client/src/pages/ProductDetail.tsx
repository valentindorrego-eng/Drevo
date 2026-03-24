import { useRoute, Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useProduct } from "@/hooks/use-search";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import { ArrowLeft, Share2, Heart, Info, ShoppingBag, Check, ExternalLink, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { TryOnModal } from "@/components/TryOnModal";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id || "";
  const { data: product, isLoading, error } = useProduct(id);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const { addItem } = useCart();
  const { toast } = useToast();
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white gap-4">
        <p>Producto no encontrado.</p>
        <Link href="/" className="text-neutral-400 hover:text-white underline">Volver al inicio</Link>
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

    addItem({
      id: product.id,
      title: product.title,
      basePrice: Number(product.basePrice),
      salePrice: product.salePrice ? Number(product.salePrice) : null,
      currency: product.currency || "ARS",
      imageUrl: images[0]?.url || "",
      brand: product.brand?.name || "DREVO",
      sizeLabel: selectedSizeResolved,
      externalUrl: product.externalUrl || null,
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
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <Link href="/search" className="inline-flex items-center gap-2 text-neutral-500 hover:text-white mb-8 transition-colors" data-testid="link-back-search">
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a la búsqueda</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">

          <div className="lg:col-span-7 space-y-4">
            <motion.div
              key={selectedImageIdx}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="aspect-[3/4] w-full bg-neutral-900 overflow-hidden rounded-lg"
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
                      "aspect-[3/4] bg-neutral-900 rounded-md overflow-hidden cursor-pointer transition-opacity",
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

              <div className="space-y-2 border-b border-white/10 pb-8">
                <div className="flex justify-between items-start">
                  <h2 className="text-sm font-medium tracking-wide text-neutral-400 uppercase" data-testid="text-brand-name">
                    {product.brand?.name || "DREVO Selection"}
                  </h2>
                  <div className="flex gap-4">
                    <button className="text-neutral-400 hover:text-white transition-colors" data-testid="button-share">
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button className="text-neutral-400 hover:text-red-500 transition-colors" data-testid="button-favorite">
                      <Heart className="w-5 h-5" />
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
                    <p className="text-lg text-neutral-500 line-through" data-testid="text-original-price">
                      {formatPrice(originalPrice)}
                    </p>
                  )}
                </div>
              </div>

              {variants.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-neutral-300">Seleccionar Talle</span>
                    <button className="text-neutral-500 underline">Guía de talles</button>
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
                              ? "bg-white text-black border-white"
                              : "bg-transparent text-white border-white/20 hover:border-white",
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
                      : "bg-white text-black hover:bg-neutral-200"
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
                  className="w-full h-12 border border-[#C8FF00]/30 rounded font-medium text-sm text-[#C8FF00] hover:bg-[#C8FF00]/10 hover:border-[#C8FF00]/50 transition-all flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Probar producto
                </button>

                {product.externalUrl && (
                  <a
                    href={product.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-buy-external"
                    className="w-full h-12 border border-white/20 rounded font-medium text-sm text-neutral-300 hover:text-white hover:border-white transition-all flex items-center justify-center gap-2"
                  >
                    Ver en tienda oficial <ExternalLink className="w-4 h-4" />
                  </a>
                )}

                <p className="text-center text-xs text-neutral-500">
                  Envío gratis en compras superiores a $100.000
                </p>
              </div>

              <div className="border-t border-white/10 pt-6 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> Descripción
                </h3>
                <p className="text-neutral-400 text-sm leading-relaxed" data-testid="text-product-description">
                  {product.description || "Una prenda esencial diseñada para elevar tu guardarropa diario. Confeccionada con materiales de primera calidad para asegurar durabilidad y confort."}
                </p>

                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {product.tags.map((t: any) => (
                      <span key={t.tag} className="text-xs px-2 py-1 bg-white/5 rounded text-neutral-400">
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
