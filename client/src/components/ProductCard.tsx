import { Link } from "wouter";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useState } from "react";
import { SayMoreModal } from "./SayMoreModal";

type Product = {
  id: string;
  title: string;
  basePrice: number;
  salePrice: number | null;
  currency: string | null;
  brand: { name: string; slug: string } | null;
  images: { url: string; position: number | null }[];
  reasons?: string[];
};

interface ProductCardProps {
  product: Product;
  index?: number;
  showSayMore?: boolean;
}

function formatPrice(price: number, currency: string | null) {
  if (currency === "ARS") {
    return `$${price.toLocaleString("es-AR")}`;
  }
  return `$${price.toFixed(2)}`;
}

export function ProductCard({ product, index = 0, showSayMore = true }: ProductCardProps) {
  const [sayMoreOpen, setSayMoreOpen] = useState(false);
  const mainImage = product.images[0]?.url || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=60";
  const price = product.salePrice || product.basePrice;
  const hasDiscount = product.salePrice && product.salePrice < product.basePrice;

  return (
    <>
      <div className="group block h-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: index * 0.05 }}
          className="flex flex-col h-full"
        >
          <Link href={`/product/${product.id}`} className="block">
            <div className="relative overflow-hidden aspect-[3/4] bg-card mb-4 rounded-lg">
              <img
                src={mainImage}
                alt={product.title}
                className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105 group-hover:brightness-110"
                loading="lazy"
              />

              {hasDiscount && (
                <div className="absolute top-3 left-3 bg-[#C8FF00] text-black text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
                  Sale
                </div>
              )}

              {product.reasons && product.reasons.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-background/90 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-xs text-[#C8FF00] font-medium line-clamp-2">
                    {product.reasons[0]}
                  </p>
                </div>
              )}
            </div>
          </Link>

          <div className="space-y-1">
            <div className="flex justify-between items-start gap-2">
              <Link href={`/product/${product.id}`} className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground leading-tight group-hover:underline decoration-neutral-500 underline-offset-4">
                  {product.title}
                </h3>
              </Link>
              <div className="flex items-center gap-2 flex-shrink-0">
                {showSayMore && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSayMoreOpen(true); }}
                    className="p-1.5 rounded-full bg-card border border-border text-muted-foreground hover:bg-[#C8FF00]/10 hover:text-[#C8FF00] hover:border-[#C8FF00]/20 transition-all opacity-0 group-hover:opacity-100"
                    title="Say More — encontrar similares"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                <div className="text-right whitespace-nowrap">
                  <span className="text-sm font-semibold text-foreground">
                    {formatPrice(price, product.currency)}
                  </span>
                  {hasDiscount && (
                    <span className="block text-xs text-muted-foreground line-through">
                      {formatPrice(product.basePrice, product.currency)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">
              {product.brand?.name || "DREVO Selection"}
            </p>
          </div>
        </motion.div>
      </div>

      <SayMoreModal
        product={product}
        isOpen={sayMoreOpen}
        onClose={() => setSayMoreOpen(false)}
      />
    </>
  );
}
