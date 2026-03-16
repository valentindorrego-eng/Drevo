import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { useSearchProducts } from "@/hooks/use-search";
import { ProductCard } from "@/components/ProductCard";
import { Search as SearchIcon, Loader2, Sparkles, ShoppingBag } from "lucide-react";
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
      const newQuery = inputValue.trim();
      setLocation(`/search?q=${encodeURIComponent(newQuery)}`);
      search({ query: newQuery });
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
              className="mt-4 p-4 bg-white/5 border border-white/5 rounded-lg"
            >
              <div className="flex items-center gap-2 mb-2 text-[#C8FF00]">
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-bold uppercase tracking-wider">Intención detectada</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <p className="text-neutral-400">Intención: <span className="text-white font-medium">{searchResults.intent.intent_type === 'outfit' ? 'Outfit' : 'Prenda'}</span></p>
                {searchResults.intent.style_tags?.length > 0 && (
                  <p className="text-neutral-400">Estilo: <span className="text-white font-medium capitalize">{searchResults.intent.style_tags.join(', ')}</span></p>
                )}
                {searchResults.intent.colors?.primary?.length > 0 && (
                  <p className="text-neutral-400">Color: <span className="text-white font-medium capitalize">{searchResults.intent.colors.primary.join(', ')}</span></p>
                )}
                {searchResults.intent.occasion && (
                  <p className="text-neutral-400">Ocasión: <span className="text-white font-medium capitalize">{searchResults.intent.occasion}</span></p>
                )}
              </div>
            </motion.div>
          )}
        </div>

        {isPending ? (
          <div className="flex flex-col items-center justify-center py-32 space-y-6">
            <Loader2 className="w-10 h-10 text-[#C8FF00] animate-spin" />
            <p className="text-neutral-500 animate-pulse font-display">Curando selección...</p>
          </div>
        ) : searchResults ? (
          <div className="space-y-16">
            
            {/* OUTFIT RECOMMENDATION SECTION */}
            {searchResults.outfit_bundles && searchResults.outfit_bundles.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-neutral-900/40 border border-white/10 p-8 rounded-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Sparkles className="w-32 h-32 text-[#C8FF00]" />
                </div>

                <div className="flex items-center gap-3 mb-8 relative z-10">
                  <div className="bg-[#C8FF00]/10 p-2 rounded-lg">
                    <Sparkles className="w-6 h-6 text-[#C8FF00]" />
                  </div>
                  <h2 className="text-3xl font-display font-bold tracking-tight">Outfit recomendado por Drevo</h2>
                </div>
                
                <div className={`grid grid-cols-1 gap-8 relative z-10 ${searchResults.outfit_bundles[0].items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                  {searchResults.outfit_bundles[0].items.map((item, idx) => {
                    const label = item.slot || ['Superior', 'Inferior', 'Calzado', 'Accesorio'][idx] || 'Accesorio';
                    return (
                      <div key={item.id} className="relative group">
                        <div className="absolute -top-3 left-4 z-10 bg-[#C8FF00] text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest shadow-xl">
                          {label}
                        </div>
                        <ProductCard product={item} />
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-12 flex justify-center relative z-10">
                  <button className="flex items-center gap-3 bg-[#C8FF00] text-black px-10 py-4 rounded-full font-bold hover:bg-[#A3D600] transition-all hover:scale-105 active:scale-95 shadow-2xl">
                    <ShoppingBag className="w-5 h-5" />
                    Comprar Look Completo
                  </button>
                </div>
              </motion.div>
            )}

            {/* Results Grid */}
            <div>
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                <h3 className="text-2xl font-display font-bold tracking-tight">Explorar Resultados</h3>
                <span className="text-sm text-neutral-500 font-medium">{searchResults.results.length} productos encontrados</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-12">
                {searchResults.results.map((product, idx) => (
                  <ProductCard key={product.id} product={product} index={idx} />
                ))}
              </div>
            </div>
            
            {searchResults.results.length === 0 && (
              <div className="text-center py-32 bg-neutral-900/20 rounded-2xl border border-white/5">
                <p className="text-neutral-500 text-lg mb-6">No encontramos productos exactos para esa descripción.</p>
                <button 
                  onClick={() => { setInputValue(""); setLocation("/home"); }} 
                  className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-neutral-200 transition-all"
                >
                  Intentar otra búsqueda
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-32 opacity-30">
            <SearchIcon className="w-16 h-16 mx-auto mb-6 text-neutral-700" />
            <p className="text-xl font-display">Ingresá una búsqueda para comenzar tu viaje de estilo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
