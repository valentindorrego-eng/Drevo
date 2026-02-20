import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { useSearchProducts } from "@/hooks/use-search";
import { ProductCard } from "@/components/ProductCard";
import { Search as SearchIcon, Loader2, Sparkles, Filter, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";

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
        <div className="mb-12 max-w-3xl">
          <form onSubmit={handleSubmit} className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
            <input 
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
              placeholder="Refiná tu búsqueda..."
              data-testid="input-search"
            />
          </form>

          {searchResults?.intent && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex flex-wrap gap-2 p-3 bg-white/5 border border-white/5 rounded-lg text-xs"
            >
              <div className="flex items-center gap-1.5 text-yellow-200">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="font-medium">Intención detectada:</span>
              </div>
              <span className="text-neutral-400">Tipo: <span className="text-white capitalize">{searchResults.intent.intent_type === 'outfit' ? 'Outfit' : 'Prenda'}</span></span>
              {searchResults.intent.occasion && <span className="text-neutral-400">Ocasión: <span className="text-white capitalize">{searchResults.intent.occasion}</span></span>}
              {searchResults.intent.colors?.primary?.length > 0 && <span className="text-neutral-400">Color: <span className="text-white capitalize">{searchResults.intent.colors.primary.join(', ')}</span></span>}
              {searchResults.intent.style_tags?.length > 0 && <span className="text-neutral-400">Estilo: <span className="text-white capitalize">{searchResults.intent.style_tags.join(', ')}</span></span>}
            </motion.div>
          )}
        </div>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <p className="text-neutral-500 animate-pulse">Curando selección...</p>
          </div>
        ) : searchResults ? (
          <div className="space-y-16">
            
            {/* OUTFIT RECOMMENDATION SECTION */}
            {searchResults.outfit_bundles && searchResults.outfit_bundles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-neutral-900/40 border border-white/10 p-8 rounded-2xl"
              >
                <div className="flex items-center gap-2 mb-8">
                  <Sparkles className="w-6 h-6 text-yellow-200" />
                  <h2 className="text-2xl font-display font-bold">✨ Outfit recomendado por Drevo</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {searchResults.outfit_bundles[0].items.map((item, idx) => (
                    <div key={item.id} className="relative group">
                      <div className="absolute -top-3 left-4 z-10 bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {idx === 0 ? 'Superior' : idx === 1 ? 'Inferior' : 'Calzado'}
                      </div>
                      <ProductCard product={item} />
                    </div>
                  ))}
                </div>
                <div className="mt-8 flex justify-center">
                  <button className="flex items-center gap-2 bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-neutral-200 transition-colors">
                    <ShoppingBag className="w-5 h-5" />
                    Comprar Look Completo
                  </button>
                </div>
              </motion.div>
            )}

            {/* Results Grid */}
            <div>
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                <h3 className="text-xl font-bold">Resultados</h3>
                <span className="text-sm text-neutral-500">{searchResults.results.length} productos</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
                {searchResults.results.map((product, idx) => (
                  <ProductCard key={product.id} product={product} index={idx} />
                ))}
              </div>
            </div>
            
            {searchResults.results.length === 0 && (
              <div className="text-center py-20">
                <p className="text-neutral-500">No encontramos productos exactos para esa descripción.</p>
                <button onClick={() => setInputValue("")} className="mt-4 text-white underline underline-offset-4">Intentar otra búsqueda</button>
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
