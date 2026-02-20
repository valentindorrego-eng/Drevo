import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { useSearchProducts } from "@/hooks/use-search";
import { ProductCard } from "@/components/ProductCard";
import { Search as SearchIcon, Loader2, Sparkles, Filter, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Search() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const query = searchParams.get("q") || "";
  
  const [inputValue, setInputValue] = useState(query);
  const { mutate: search, data: searchResults, isPending } = useSearchProducts();

  useEffect(() => {
    if (query) {
      search({ query });
      setInputValue(query);
    }
  }, [query, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      setLocation(`/search?q=${encodeURIComponent(inputValue)}`);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-12 px-4 md:px-8 max-w-[1600px] mx-auto">
        
        {/* Search Header */}
        <div className="mb-12 max-w-3xl">
          <form onSubmit={handleSubmit} className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
            <input 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
              placeholder="Refiná tu búsqueda..."
            />
          </form>

          {/* AI Intent Badge */}
          {searchResults?.intent && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex items-start gap-3 p-4 bg-white/5 border border-white/5 rounded-lg"
            >
              <Sparkles className="w-5 h-5 text-yellow-200 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-neutral-300">
                  <span className="font-medium text-white">Intención detectada:</span> {" "}
                  Estamos buscando un estilo <span className="text-white italic">"{searchResults.intent?.style || 'personalizado'}"</span> {" "}
                  para <span className="text-white italic">"{searchResults.intent?.occasion || 'cualquier ocasión'}"</span>.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Content Area */}
        {isPending ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-neutral-500 animate-pulse">Curando selección...</p>
          </div>
        ) : searchResults ? (
          <div className="space-y-16">
            
            {/* Suggested Filters */}
            {searchResults.suggested_filters && (
              <div className="flex flex-wrap gap-3 pb-4 border-b border-white/5">
                <div className="flex items-center gap-2 text-sm text-neutral-500 mr-2">
                  <Filter className="w-4 h-4" />
                  <span>Sugerencias:</span>
                </div>
                {searchResults.suggested_filters.brands.slice(0, 4).map(brand => (
                  <button key={brand} className="px-3 py-1.5 text-xs bg-white/5 border border-white/5 hover:border-white/20 text-neutral-300 rounded-md transition-colors">
                    {brand}
                  </button>
                ))}
                {searchResults.suggested_filters.sizes.map(size => (
                  <button key={size} className="px-3 py-1.5 text-xs bg-white/5 border border-white/5 hover:border-white/20 text-neutral-300 rounded-md transition-colors">
                    Talle {size}
                  </button>
                ))}
              </div>
            )}

            {/* Results Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
              {searchResults.results.map((product, idx) => (
                <ProductCard key={product.id} product={product} index={idx} />
              ))}
            </div>
            
            {searchResults.results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-neutral-500">No encontramos productos exactos para esa descripción.</p>
                <button 
                  onClick={() => setInputValue("")} 
                  className="mt-4 text-white underline underline-offset-4"
                >
                  Intentar otra búsqueda
                </button>
              </div>
            )}

            {/* Outfit Bundles (If any) */}
            {searchResults.outfit_bundles && searchResults.outfit_bundles.length > 0 && (
              <div className="border-t border-white/10 pt-16">
                <h2 className="text-2xl font-display font-bold mb-8">Outfits Sugeridos</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  {searchResults.outfit_bundles.map((bundle, i) => (
                    <div key={i} className="bg-neutral-900/30 border border-white/5 p-6 rounded-xl">
                      <h3 className="text-lg font-semibold mb-4">{bundle.title}</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {bundle.items.map(item => (
                          <ProductCard key={item.id} product={item} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-32 opacity-50">
            <SearchIcon className="w-12 h-12 mx-auto mb-4 text-neutral-700" />
            <p>Ingresá una búsqueda para comenzar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
