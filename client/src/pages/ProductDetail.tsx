import { useRoute, Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useProduct } from "@/hooks/use-search";
import { useState } from "react";
import { ArrowLeft, Share2, Heart, Info, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:id");
  const id = params?.id || "";
  const { data: product, isLoading, error } = useProduct(id);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

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

  // Mock variants if not present in response for demo
  const variants = product.variants || [
    { sizeLabel: "S", stockQty: 10 },
    { sizeLabel: "M", stockQty: 5 },
    { sizeLabel: "L", stockQty: 0 },
    { sizeLabel: "XL", stockQty: 2 }
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />
      
      <div className="pt-24 pb-20 px-4 md:px-8 max-w-7xl mx-auto">
        <Link href="/search" className="inline-flex items-center gap-2 text-neutral-500 hover:text-white mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Volver a la búsqueda</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24">
          
          {/* Gallery Section */}
          <div className="lg:col-span-7 space-y-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="aspect-[3/4] w-full bg-neutral-900 overflow-hidden rounded-lg"
            >
              <img 
                src={product.images?.[0]?.url || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=1200"} 
                alt={product.title}
                className="w-full h-full object-cover"
              />
            </motion.div>
            
            {/* Thumbnails grid */}
            {product.images?.length > 1 && (
              <div className="grid grid-cols-4 gap-4">
                {product.images.slice(1).map((img: any, idx: number) => (
                  <div key={idx} className="aspect-[3/4] bg-neutral-900 rounded-md overflow-hidden cursor-pointer opacity-70 hover:opacity-100 transition-opacity">
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="lg:col-span-5 relative">
            <div className="sticky top-32 space-y-8">
              
              <div className="space-y-2 border-b border-white/10 pb-8">
                <div className="flex justify-between items-start">
                  <h2 className="text-sm font-medium tracking-wide text-neutral-400 uppercase">
                    {product.brand?.name || "DREVO Selection"}
                  </h2>
                  <div className="flex gap-4">
                    <button className="text-neutral-400 hover:text-white transition-colors">
                      <Share2 className="w-5 h-5" />
                    </button>
                    <button className="text-neutral-400 hover:text-red-500 transition-colors">
                      <Heart className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-semibold leading-tight">
                  {product.title}
                </h1>
                <p className="text-2xl font-light pt-2">
                  ${product.salePrice || product.basePrice}
                </p>
              </div>

              {/* Size Selector */}
              <div className="space-y-4">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-neutral-300">Seleccionar Talle</span>
                  <button className="text-neutral-500 underline">Guía de talles</button>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {variants.map((v: any) => {
                    const isOutOfStock = v.stockQty <= 0;
                    return (
                      <button
                        key={v.sizeLabel}
                        disabled={isOutOfStock}
                        onClick={() => setSelectedSize(v.sizeLabel)}
                        className={cn(
                          "h-12 border rounded flex items-center justify-center text-sm font-medium transition-all",
                          selectedSize === v.sizeLabel
                            ? "bg-white text-black border-white"
                            : "bg-transparent text-white border-white/20 hover:border-white",
                          isOutOfStock && "opacity-30 cursor-not-allowed decoration-slice line-through"
                        )}
                      >
                        {v.sizeLabel}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3 pt-4">
                <button className="w-full bg-white text-black h-14 rounded font-semibold text-lg hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2">
                  <span>Agregar al carrito</span>
                  <ShoppingBag className="w-5 h-5" />
                </button>
                <p className="text-center text-xs text-neutral-500">
                  Envío gratis en compras superiores a $100.000
                </p>
              </div>

              {/* Description Accordion (Simplified) */}
              <div className="border-t border-white/10 pt-6 space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> Descripción
                </h3>
                <p className="text-neutral-400 text-sm leading-relaxed">
                  {product.description || "Una prenda esencial diseñada para elevar tu guardarropa diario. Confeccionada con materiales de primera calidad para asegurar durabilidad y confort."}
                </p>
                
                {product.tags && (
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
    </div>
  );
}
