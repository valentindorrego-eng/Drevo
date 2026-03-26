import { useLocation } from "wouter";
import { useEffect, useState, useRef } from "react";
import { Navigation } from "@/components/Navigation";
import { useSearchProducts } from "@/hooks/use-search";
import { useAuth } from "@/hooks/useAuth";
import { ProductCard } from "@/components/ProductCard";
import { Search as SearchIcon, Loader2, Sparkles, ShoppingBag, X, Ruler, Send, MessageSquare, RotateCcw, Clock, Camera } from "lucide-react";
import { VisualSearchButton } from "@/components/VisualSearchButton";
import { motion, AnimatePresence } from "framer-motion";
import { trackClick } from "@/hooks/useClickTracker";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

function getSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem("drevo_search_history") || "[]"); } catch { return []; }
}
function addToSearchHistory(q: string) {
  const history = getSearchHistory().filter(h => h !== q);
  history.unshift(q);
  localStorage.setItem("drevo_search_history", JSON.stringify(history.slice(0, 5)));
}

export default function Search() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const query = searchParams.get("q") || "";
  const { user } = useAuth();
  
  const [inputValue, setInputValue] = useState(query);
  const [refinementInput, setRefinementInput] = useState("");
  const [sizeFilterEnabled, setSizeFilterEnabled] = useState(true);
  const [refinements, setRefinements] = useState<string[]>([]);
  const [mobileRefineOpen, setMobileRefineOpen] = useState(false);
  const { mutate: search, data: searchResults, isPending } = useSearchProducts();
  const refinementInputRef = useRef<HTMLInputElement>(null);

  const userSize = user?.preferredSize || null;

  useEffect(() => {
    if (searchResults?.sizeFilter) {
      setSizeFilterEnabled(searchResults.sizeFilter.enabled);
    }
  }, [searchResults?.sizeFilter?.enabled]);

  useEffect(() => {
    if (query) {
      search({ query, userSize: userSize || undefined, sizeFilterEnabled: userSize ? sizeFilterEnabled : undefined });
      setInputValue(query);
      addToSearchHistory(query);
    }
  }, [query, search, userSize, sizeFilterEnabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const newQuery = inputValue.trim();
      setRefinements([]);
      addToSearchHistory(newQuery);
      setLocation(`/search?q=${encodeURIComponent(newQuery)}`);
      search({ query: newQuery, userSize: userSize || undefined, sizeFilterEnabled: userSize ? sizeFilterEnabled : undefined });
    }
  };

  const handleRefine = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!refinementInput.trim()) return;
    const combinedQuery = `${query}, ${refinementInput.trim()}`;
    setRefinements(prev => [...prev, refinementInput.trim()]);
    setRefinementInput("");
    addToSearchHistory(combinedQuery);
    setLocation(`/search?q=${encodeURIComponent(combinedQuery)}`);
    search({ query: combinedQuery, userSize: userSize || undefined, sizeFilterEnabled: userSize ? sizeFilterEnabled : undefined });
  };

  const handleToggleSizeFilter = () => {
    setSizeFilterEnabled(!sizeFilterEnabled);
  };

  const handleNewSearch = () => {
    setInputValue("");
    setRefinements([]);
    setLocation("/search");
  };

  const handleBuyOutfit = async (items: any[]) => {
    for (const item of items) {
      if (item.externalUrl) {
        const referralUrl = await trackClick(item.id, query);
        window.open(referralUrl || item.externalUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  const RefinementPanel = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider">Búsqueda actual</h3>
        <p className="text-white font-medium">{query}</p>
      </div>

      {searchResults?.intent && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[#C8FF00]" /> Filtros detectados
          </h3>
          <div className="flex flex-wrap gap-2">
            {searchResults.intent.intent_type && (
              <span className="text-xs px-2 py-1 bg-[#C8FF00]/10 text-[#C8FF00] rounded-full border border-[#C8FF00]/20">
                {searchResults.intent.intent_type === "outfit" ? "Outfit" : "Prenda"}
              </span>
            )}
            {searchResults.intent.occasion && (
              <span className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10">
                {searchResults.intent.occasion}
              </span>
            )}
            {searchResults.intent.style_tags?.map((tag: string) => (
              <span key={tag} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize">
                {tag}
              </span>
            ))}
            {searchResults.intent.colors?.primary?.map((c: string) => (
              <span key={c} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize">
                {c}
              </span>
            ))}
          </div>
          {searchResults.sizeFilter && (
            <button
              onClick={handleToggleSizeFilter}
              className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                sizeFilterEnabled
                  ? "bg-[#C8FF00]/15 text-[#C8FF00] border border-[#C8FF00]/30"
                  : "bg-white/5 text-neutral-400 border border-white/10"
              }`}
              data-testid="button-toggle-size-filter"
            >
              <Ruler className="w-3 h-3" />
              Talle {searchResults.sizeFilter.size} {sizeFilterEnabled ? "activo" : "desactivado"}
            </button>
          )}
        </div>
      )}

      {refinements.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider">Refinamientos</h3>
          <div className="space-y-2">
            {refinements.map((r, i) => (
              <div key={i} className="text-xs px-3 py-2 bg-white/5 rounded-lg text-neutral-300 border border-white/5">
                + {r}
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleRefine} className="flex gap-2">
        <input
          ref={refinementInputRef}
          value={refinementInput}
          onChange={(e) => setRefinementInput(e.target.value)}
          placeholder="Refinar búsqueda..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
          data-testid="input-refine-search"
        />
        <button
          type="submit"
          disabled={!refinementInput.trim()}
          className="p-2 bg-[#C8FF00] text-black rounded-lg hover:bg-[#A3D600] transition-colors disabled:opacity-30"
          data-testid="button-refine-submit"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      <button
        onClick={handleNewSearch}
        className="w-full flex items-center justify-center gap-2 text-sm text-neutral-500 hover:text-white py-2 border border-white/10 rounded-lg transition-colors"
        data-testid="button-new-search"
      >
        <RotateCcw className="w-3 h-3" /> Nueva búsqueda
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-12 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="lg:flex lg:gap-8">
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-28 space-y-6 p-6 bg-white/[0.02] border border-white/5 rounded-xl">
              <RefinementPanel />
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="mb-8 lg:hidden">
              <div className="flex gap-2">
                <form onSubmit={handleSubmit} className="relative flex-1">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                  <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
                    placeholder="Refiná tu búsqueda..."
                    data-testid="input-search"
                  />
                  {inputValue && (
                    <button
                      type="button"
                      onClick={() => setInputValue("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                      data-testid="button-clear-search"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </form>
                <VisualSearchButton className="!py-4" />
              </div>

              {searchResults?.intent && (
                <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-2">
                  {searchResults.intent.style_tags?.map((tag: string) => (
                    <span key={tag} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                  {searchResults.intent.colors?.primary?.map((c: string) => (
                    <span key={c} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {c}
                    </span>
                  ))}
                  {searchResults.intent.occasion && (
                    <span className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {searchResults.intent.occasion}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="hidden lg:block mb-8 max-w-3xl">
              <div className="flex gap-2">
                <form onSubmit={handleSubmit} className="relative flex-1">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                  <input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
                    placeholder="Refiná tu búsqueda..."
                    data-testid="input-search-desktop"
                  />
                  {inputValue && (
                    <button
                      type="button"
                      onClick={() => setInputValue("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </form>
                <VisualSearchButton className="!py-4" />
              </div>
            </div>

            {isPending ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-6">
                <Loader2 className="w-10 h-10 text-[#C8FF00] animate-spin" />
                <p className="text-neutral-500 animate-pulse font-display">Curando selección...</p>
              </div>
            ) : searchResults ? (
              <div className="space-y-16">
                
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
                    
                    <div className={`grid grid-cols-1 gap-8 relative z-10 ${searchResults.outfit_bundles![0].items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                      {searchResults.outfit_bundles![0].items.map((item: any, idx: number) => {
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
                      <button
                        onClick={() => handleBuyOutfit(searchResults.outfit_bundles![0].items)}
                        className="flex items-center gap-3 bg-[#C8FF00] text-black px-10 py-4 rounded-full font-bold hover:bg-[#A3D600] transition-all hover:scale-105 active:scale-95 shadow-2xl"
                        data-testid="button-buy-outfit"
                      >
                        <ShoppingBag className="w-5 h-5" />
                        Comprar Look Completo
                      </button>
                    </div>
                  </motion.div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                    <h3 className="text-2xl font-display font-bold tracking-tight">Explorar Resultados</h3>
                    <span className="text-sm text-neutral-500 font-medium">{searchResults.results.length} productos encontrados</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-12">
                    {searchResults.results.map((product: any, idx: number) => (
                      <ProductCard key={product.id} product={product} index={idx} />
                    ))}
                  </div>
                </div>
                
                {searchResults.results.length === 0 && (
                  <div className="text-center py-32 bg-neutral-900/20 rounded-2xl border border-white/5">
                    <p className="text-neutral-500 text-lg mb-6">No encontramos productos exactos para esa descripción.</p>
                    <button 
                      onClick={handleNewSearch}
                      className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-neutral-200 transition-all"
                      data-testid="button-try-again"
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
          </main>
        </div>

        <div className="lg:hidden fixed bottom-6 right-6 z-40">
          <Sheet open={mobileRefineOpen} onOpenChange={setMobileRefineOpen}>
            <SheetTrigger asChild>
              <button
                className="w-14 h-14 bg-[#C8FF00] text-black rounded-full shadow-2xl flex items-center justify-center hover:bg-[#A3D600] transition-all active:scale-95"
                data-testid="button-mobile-refine"
              >
                <MessageSquare className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-black border-white/10 text-white rounded-t-2xl max-h-[70vh] overflow-y-auto">
              <div className="p-4">
                <RefinementPanel />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
