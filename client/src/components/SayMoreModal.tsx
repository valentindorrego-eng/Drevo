import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { useSayMore } from "@/hooks/use-search";
import { ProductCard } from "./ProductCard";
import { Link } from "wouter";

interface SayMoreModalProps {
  product: {
    id: string;
    title: string;
    images: { url: string; position: number | null }[];
    basePrice: number;
    salePrice: number | null;
    currency: string | null;
    brand: { name: string; slug: string } | null;
  };
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_REFINEMENTS = [
  "Más barato",
  "Otro color",
  "Más formal",
  "Más casual",
  "Sin estampa",
  "Más holgado",
  "Para mujer",
  "Para hombre",
];

export function SayMoreModal({ product, isOpen, onClose }: SayMoreModalProps) {
  const [input, setInput] = useState("");
  const { mutate: sayMore, data: results, isPending, reset } = useSayMore();

  const handleSubmit = (refinement: string) => {
    if (!refinement.trim()) return;
    sayMore({ productId: product.id, refinement: refinement.trim() });
  };

  const handleClose = () => {
    reset();
    setInput("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center"
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="w-full md:max-w-2xl max-h-[85vh] bg-neutral-950 border border-white/10 rounded-t-2xl md:rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-900">
                  <img
                    src={product.images[0]?.url}
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white line-clamp-1">{product.title}</h3>
                  <p className="text-xs text-neutral-500">{product.brand?.name}</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-2 text-neutral-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(85vh-140px)]">
              {!results && !isPending && (
                <>
                  <p className="text-sm text-neutral-400 mb-4">
                    <Sparkles className="w-4 h-4 inline text-accent mr-1" />
                    ¿Qué cambiarías de este producto?
                  </p>

                  {/* Quick refinements */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {QUICK_REFINEMENTS.map((ref) => (
                      <button
                        key={ref}
                        onClick={() => handleSubmit(ref)}
                        className="text-xs px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-neutral-300 hover:bg-accent/10 hover:text-accent hover:border-accent/20 transition-all"
                      >
                        {ref}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {isPending && (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="w-8 h-8 text-accent animate-spin" />
                  <p className="text-neutral-500 text-sm animate-pulse">Buscando alternativas...</p>
                </div>
              )}

              {results && (
                <>
                  <div className="mb-4">
                    <p className="text-xs text-neutral-500 mb-1">Buscando: "{results.generatedQuery}"</p>
                    <p className="text-sm text-white font-medium">{results.results.length} alternativas encontradas</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {results.results.slice(0, 8).map((p: any, idx: number) => (
                      <div key={p.id} onClick={handleClose}>
                        <ProductCard product={p} index={idx} />
                      </div>
                    ))}
                  </div>
                  {results.results.length === 0 && (
                    <p className="text-center text-neutral-500 py-8">No encontramos alternativas con esos criterios.</p>
                  )}
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/5">
              <form onSubmit={(e) => { e.preventDefault(); handleSubmit(input); }} className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Como este pero..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-accent/30"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isPending}
                  className="px-4 py-3 bg-accent text-black rounded-xl font-medium hover:bg-accent/80 transition-colors disabled:opacity-30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
