import { Link } from "wouter";
import { type SearchResultProductSchema } from "@shared/routes"; // Note: This might need to be exported from a types file if not directly available, assume inferred type for now
import { motion } from "framer-motion";
import { z } from "zod";

// Re-defining locally if not exported, or assume it matches the schema structure
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

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const mainImage = product.images[0]?.url || "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&auto=format&fit=crop&q=60"; // fallback

  return (
    <Link href={`/product/${product.id}`} className="group block h-full">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.05 }}
        className="flex flex-col h-full"
      >
        {/* Image Container */}
        <div className="relative overflow-hidden aspect-[3/4] bg-neutral-900 mb-4">
          <img 
            src={mainImage} 
            alt={product.title}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          
          {/* AI Match Reason Badge */}
          {product.reasons && product.reasons.length > 0 && (
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300">
              <p className="text-xs text-neutral-300 font-medium line-clamp-2">
                ✨ {product.reasons[0]}
              </p>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-1">
          <div className="flex justify-between items-start gap-4">
            <h3 className="text-sm font-medium text-white leading-tight group-hover:underline decoration-neutral-500 underline-offset-4">
              {product.title}
            </h3>
            <span className="text-sm font-semibold text-white whitespace-nowrap">
              ${product.salePrice || product.basePrice}
            </span>
          </div>
          <p className="text-xs text-neutral-500 uppercase tracking-wider">
            {product.brand?.name || "Unknown Brand"}
          </p>
        </div>
      </motion.div>
    </Link>
  );
}
