import { Link } from "wouter";
import { motion } from "framer-motion";

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
}

function formatPrice(price: number, currency: string | null) {
  if (currency === "ARS") {
    return `$${price.toLocaleString("es-AR")}`;
  }
  return `$${price.toFixed(2)}`;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const mainImage = product.images[0]?.url || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=60";
  const price = product.salePrice || product.basePrice;
  const hasDiscount = product.salePrice && product.salePrice < product.basePrice;

  return (
    <Link href={`/product/${product.id}`} className="group block h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        className="flex flex-col h-full"
      >
        <div className="relative overflow-hidden aspect-[3/4] bg-neutral-900 mb-4 rounded-sm">
          <img
            src={mainImage}
            alt={product.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="lazy"
          />

          {hasDiscount && (
            <div className="absolute top-3 left-3 bg-[#C8FF00] text-black text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
              Sale
            </div>
          )}

          {product.reasons && product.reasons.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              <p className="text-xs text-[#C8FF00] font-medium line-clamp-2">
                {product.reasons[0]}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="flex justify-between items-start gap-4">
            <h3 className="text-sm font-medium text-white leading-tight group-hover:underline decoration-neutral-500 underline-offset-4">
              {product.title}
            </h3>
            <div className="text-right whitespace-nowrap">
              <span className="text-sm font-semibold text-white">
                {formatPrice(price, product.currency)}
              </span>
              {hasDiscount && (
                <span className="block text-xs text-neutral-500 line-through">
                  {formatPrice(product.basePrice, product.currency)}
                </span>
              )}
            </div>
          </div>
          <p className="text-xs text-neutral-500 uppercase tracking-wider">
            {product.brand?.name || "DREVO Selection"}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}
