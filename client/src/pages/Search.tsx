import { useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { useSearchProducts } from "@/hooks/use-search";
import { useAuth } from "@/hooks/useAuth";
import { ProductCard } from "@/components/ProductCard";
import { Search as SearchIcon, Loader2, Sparkles, ShoppingBag, X, Ruler, Send, MessageSquare, RotateCcw, Clock, Camera, Trash2 } from "lucide-react";
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
  localStorage.setItem("drevo_search_history", JSON.stringify(history.slice(0, 10)));
}
function clearSearchHistory() {
  localStorage.removeItem("drevo_search_history");
}

function getCachedResults(q: string) {
  try {
    const cached = sessionStorage.getItem(`drevo_search_${q}`);
    if (cached) return JSON.parse(cached);
  } catch {}
  return null;
}
function setCachedResults(q: string, data: any) {
  try {
    sessionStorage.setItem(`drevo_search_${q}`, JSON.stringify(data));
  } catch {}
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
  const [searchHistory, setSearchHistory] = useState<string[]>(getSearchHistory);
  const { mutate: search, data: searchResults, isPending } = useSearchProducts();
  const refinementInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchInputDesktopRef = useRef<HTMLInputElement>(null);

  const [cachedData, setCachedData] = useState<any>(null);

  const displayResults = searchResults || cachedData;

  const userSize = user?.preferredSize || null;

  useEffect(() => {
    if (displayResults?.sizeFilter) {
      setSizeFilterEnabled(displayResults.sizeFilter.enabled);
    }
  }, [displayResults?.sizeFilter?.enabled]);

  useEffect(() => {
    if (searchResults && query) {
      setCachedResults(query, searchResults);
      setCachedData(searchResults);
    }
  }, [searchResults, query]);

  useEffect(() => {
    if (query) {
      setInputValue(query);
      addToSearchHistory(query);
      setSearchHistory(getSearchHistory());

      const cached = getCachedResults(query);
      if (cached) {
        setCachedData(cached);
      } else {
        search({ query, userSize: userSize || undefined, sizeFilterEnabled: userSize ? sizeFilterEnabled : undefined });
      }
    }
  }, [query]);

  useEffect(() => {
    if (query && userSize) {
      search({ query, userSize: userSize || undefined, sizeFilterEnabled: userSize ? sizeFilterEnabled : undefined });
    }
  }, [sizeFilterEnabled]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      const newQuery = inputValue.trim();
      setRefinements([]);
      addToSearchHistory(newQuery);
      setSearchHistory(getSearchHistory());
      setLocation(`/search?q=${encodeURIComponent(newQuery)}`);
    }
  }, [inputValue, setLocation]);

  const handleRefine = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!refinementInput.trim()) return;
    const combinedQuery = `${query}, ${refinementInput.trim()}`;
    setRefinements(prev => [...prev, refinementInput.trim()]);
    setRefinementInput("");
    addToSearchHistory(combinedQuery);
    setSearchHistory(getSearchHistory());
    setLocation(`/search?q=${encodeURIComponent(combinedQuery)}`);
  }, [refinementInput, query, setLocation]);

  const handleToggleSizeFilter = useCallback(() => {
    setSizeFilterEnabled(prev => !prev);
  }, []);

  const handleNewSearch = useCallback(() => {
    setInputValue("");
    setRefinements([]);
    setCachedData(null);
    setLocation("/search");
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputDesktopRef.current?.focus();
    }, 100);
  }, [setLocation]);

  const handleHistoryClick = useCallback((q: string) => {
    setInputValue(q);
    setLocation(`/search?q=${encodeURIComponent(q)}`);
  }, [setLocation]);

  const handleClearHistory = useCallback(() => {
    clearSearchHistory();
    setSearchHistory([]);
  }, []);

  const handleBuyOutfit = useCallback(async (items: any[]) => {
    for (const item of items) {
      if (item.externalUrl) {
        const referralUrl = await trackClick(item.id, query);
        window.open(referralUrl || item.externalUrl, "_blank", "noopener,noreferrer");
      }
    }
  }, [query]);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-12 px-4 md:px-8 max-w-[1600px] mx-auto">
        <div className="lg:flex lg:gap-8">
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-28 space-y-6 p-6 bg-white/[0.02] border border-white/5 rounded-xl">
              <RefinementPanelContent
                query={query}
                displayResults={displayResults}
                sizeFilterEnabled={sizeFilterEnabled}
                refinements={refinements}
                refinementInput={refinementInput}
                onRefinementInputChange={setRefinementInput}
                onRefine={handleRefine}
                onToggleSizeFilter={handleToggleSizeFilter}
                onNewSearch={handleNewSearch}
                refinementInputRef={refinementInputRef}
              />
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <div className="mb-8 lg:hidden">
              <div className="flex gap-2">
                <form onSubmit={handleSubmit} className="relative flex-1">
                  <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                  <input
                    ref={searchInputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
                    placeholder="Buscá por estilo, ocasión, vibe..."
                    data-testid="input-search"
                    enterKeyHint="search"
                  />
                  {inputValue ? (
                    <button
                      type="button"
                      onClick={() => setInputValue("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                      data-testid="button-clear-search"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C8FF00]"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  )}
                </form>
                <VisualSearchButton className="!py-4" />
              </div>

              {displayResults?.intent && (
                <div className="mt-3 flex flex-wrap gap-2 overflow-x-auto pb-2">
                  {displayResults.intent.style_tags?.map((tag: string) => (
                    <span key={tag} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {tag}
                    </span>
                  ))}
                  {displayResults.intent.colors?.primary?.map((c: string) => (
                    <span key={c} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {c}
                    </span>
                  ))}
                  {displayResults.intent.occasion && (
                    <span className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize whitespace-nowrap">
                      {displayResults.intent.occasion}
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
                    ref={searchInputDesktopRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="w-full bg-neutral-900/50 border border-white/10 rounded-xl py-4 pl-12 pr-12 text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all text-lg"
                    placeholder="Buscá por estilo, ocasión, vibe..."
                    data-testid="input-search-desktop"
                  />
                  {inputValue ? (
                    <button
                      type="button"
                      onClick={() => setInputValue("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#C8FF00]"
                    >
                      <Send className="w-5 h-5" />
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
            ) : displayResults ? (
              <div className="space-y-16">
                
                {displayResults.outfit_bundles && displayResults.outfit_bundles.length > 0 && (
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
                    
                    <div className={`grid grid-cols-1 gap-8 relative z-10 ${displayResults.outfit_bundles![0].items.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                      {displayResults.outfit_bundles![0].items.map((item: any, idx: number) => {
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
                        onClick={() => handleBuyOutfit(displayResults.outfit_bundles![0].items)}
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
                    <span className="text-sm text-neutral-500 font-medium">{displayResults.results.length} productos encontrados</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-12">
                    {displayResults.results.map((product: any, idx: number) => (
                      <ProductCard key={product.id} product={product} index={idx} />
                    ))}
                  </div>
                </div>
                
                {displayResults.results.length === 0 && (
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
              <div className="py-16 space-y-8">
                <div className="text-center opacity-30">
                  <SearchIcon className="w-16 h-16 mx-auto mb-6 text-neutral-700" />
                  <p className="text-xl font-display">Ingresá una búsqueda para comenzar tu viaje de estilo.</p>
                </div>

                {searchHistory.length > 0 && (
                  <div className="max-w-md mx-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4" /> Búsquedas recientes
                      </h3>
                      <button
                        onClick={handleClearHistory}
                        className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1 transition-colors"
                        data-testid="button-clear-history"
                      >
                        <Trash2 className="w-3 h-3" /> Limpiar
                      </button>
                    </div>
                    <div className="space-y-2">
                      {searchHistory.map((q, i) => (
                        <button
                          key={`${q}-${i}`}
                          onClick={() => handleHistoryClick(q)}
                          className="w-full text-left flex items-center gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-xl transition-colors group"
                          data-testid={`button-history-${i}`}
                        >
                          <Clock className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 flex-shrink-0" />
                          <span className="text-neutral-300 group-hover:text-white text-sm truncate">{q}</span>
                          <Send className="w-3 h-3 text-neutral-700 group-hover:text-[#C8FF00] ml-auto flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>

        {query && (
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
                  <RefinementPanelContent
                    query={query}
                    displayResults={displayResults}
                    sizeFilterEnabled={sizeFilterEnabled}
                    refinements={refinements}
                    refinementInput={refinementInput}
                    onRefinementInputChange={setRefinementInput}
                    onRefine={handleRefine}
                    onToggleSizeFilter={handleToggleSizeFilter}
                    onNewSearch={() => { setMobileRefineOpen(false); handleNewSearch(); }}
                    refinementInputRef={refinementInputRef}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </div>
  );
}

function RefinementPanelContent({
  query,
  displayResults,
  sizeFilterEnabled,
  refinements,
  refinementInput,
  onRefinementInputChange,
  onRefine,
  onToggleSizeFilter,
  onNewSearch,
  refinementInputRef,
}: {
  query: string;
  displayResults: any;
  sizeFilterEnabled: boolean;
  refinements: string[];
  refinementInput: string;
  onRefinementInputChange: (v: string) => void;
  onRefine: (e?: React.FormEvent) => void;
  onToggleSizeFilter: () => void;
  onNewSearch: () => void;
  refinementInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider">Búsqueda actual</h3>
        <p className="text-white font-medium">{query}</p>
      </div>

      {displayResults?.intent && (
        <div>
          <h3 className="text-sm font-semibold text-neutral-300 mb-2 uppercase tracking-wider flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[#C8FF00]" /> Filtros detectados
          </h3>
          <div className="flex flex-wrap gap-2">
            {displayResults.intent.intent_type && (
              <span className="text-xs px-2 py-1 bg-[#C8FF00]/10 text-[#C8FF00] rounded-full border border-[#C8FF00]/20">
                {displayResults.intent.intent_type === "outfit" ? "Outfit" : "Prenda"}
              </span>
            )}
            {displayResults.intent.occasion && (
              <span className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10">
                {displayResults.intent.occasion}
              </span>
            )}
            {displayResults.intent.style_tags?.map((tag: string) => (
              <span key={tag} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize">
                {tag}
              </span>
            ))}
            {displayResults.intent.colors?.primary?.map((c: string) => (
              <span key={c} className="text-xs px-2 py-1 bg-white/10 text-white rounded-full border border-white/10 capitalize">
                {c}
              </span>
            ))}
          </div>
          {displayResults.sizeFilter && (
            <button
              onClick={onToggleSizeFilter}
              className={`mt-2 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                sizeFilterEnabled
                  ? "bg-[#C8FF00]/15 text-[#C8FF00] border border-[#C8FF00]/30"
                  : "bg-white/5 text-neutral-400 border border-white/10"
              }`}
              data-testid="button-toggle-size-filter"
            >
              <Ruler className="w-3 h-3" />
              Talle {displayResults.sizeFilter.size} {sizeFilterEnabled ? "activo" : "desactivado"}
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

      <form onSubmit={onRefine} className="flex gap-2">
        <input
          ref={refinementInputRef}
          value={refinementInput}
          onChange={(e) => onRefinementInputChange(e.target.value)}
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
        onClick={onNewSearch}
        className="w-full flex items-center justify-center gap-2 text-sm text-neutral-500 hover:text-white py-2 border border-white/10 rounded-lg transition-colors"
        data-testid="button-new-search"
      >
        <RotateCcw className="w-3 h-3" /> Nueva búsqueda
      </button>
    </div>
  );
}
