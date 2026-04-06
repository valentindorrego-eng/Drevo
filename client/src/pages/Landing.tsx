import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Search, Clock, ShoppingBag, Loader2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Navigation } from "@/components/Navigation";
import { VisualSearchButton } from "@/components/VisualSearchButton";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem("drevo_search_history") || "[]");
  } catch { return []; }
}

function addToSearchHistory(q: string) {
  const history = getSearchHistory().filter(h => h !== q);
  history.unshift(q);
  localStorage.setItem("drevo_search_history", JSON.stringify(history.slice(0, 5)));
}

interface FeedProduct {
  id: string;
  title: string;
  price: string | null;
  salePrice: string | null;
  brand: { name: string } | null;
  images: { url: string; position: number }[];
  tags: { tag: string }[];
}

function FeedProductCard({ product, index }: { product: FeedProduct; index: number }) {
  const imageUrl = product.images?.sort((a, b) => a.position - b.position)[0]?.url;
  const price = product.salePrice || product.price;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Link href={`/product/${product.id}`} className="group block no-underline">
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-card border border-border/50 group-hover:border-accent/30 transition-all duration-300">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-muted-foreground/10 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-muted-foreground/30" />
            </div>
          )}
          {product.salePrice && (
            <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              SALE
            </div>
          )}
        </div>
        <div className="mt-2.5 space-y-0.5 px-0.5">
          <p className="text-xs text-muted-foreground">{product.brand?.name || "DREVO"}</p>
          <p className="text-sm font-medium text-foreground truncate">{product.title}</p>
          {price && (
            <p className="text-sm font-bold text-accent">${price}</p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default function Landing() {
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const { isAuthenticated, user } = useAuth();
  const [feedProducts, setFeedProducts] = useState<FeedProduct[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedPersonalized, setFeedPersonalized] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const feedLoaded = useRef(false);

  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

  const loadFeed = useCallback(async (offset = 0) => {
    if (offset === 0) setFeedLoading(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(`/api/feed?limit=20&offset=${offset}`, { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (offset === 0) {
        setFeedProducts(data.products);
      } else {
        setFeedProducts(prev => [...prev, ...data.products]);
      }
      setFeedPersonalized(data.personalized);
      setHasMore(data.hasMore);
    } catch {
      console.error("Failed to load feed");
    } finally {
      setFeedLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    if (!feedLoaded.current) {
      feedLoaded.current = true;
      loadFeed(0);
    }
  }, [loadFeed]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      addToSearchHistory(prompt.trim());
      setLocation(`/search?q=${encodeURIComponent(prompt.trim())}`);
    }
  };

  const examples = [
    "Outfit para after office porteño",
    "Look para asado de finde",
    "Vestido para casamiento como invitada",
    "Ropa para primer día de trabajo",
    "Look para boliche, algo atrevido",
    "Outfit casual para la facu",
  ];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-foreground selection:text-background">
      <Navigation />
      <main className="relative pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto">

        {/* Hero Section */}
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 md:space-y-12 mb-16">

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/20 bg-foreground text-xs font-medium text-accent mb-4">
              <Sparkles className="w-3 h-3" />
              <span>Fashion Intelligence Engine</span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-[0.9]">
              Encontrá ropa <br className="hidden md:block"/>
              <span className="text-accent">con intención.</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
              Olvidate de los filtros. Describí lo que buscás, cómo te querés sentir o para qué ocasión, y dejá que nuestra IA cure tu estilo.
            </p>
          </motion.div>

          {/* Search Input Hero */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-2xl mx-auto"
          >
            <form onSubmit={handleSearch} className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-neutral-800 to-neutral-600 rounded-lg blur opacity-25 group-hover:opacity-40 transition-opacity duration-500"></div>
              <div className="relative flex items-center bg-card border border-border rounded-lg p-2 shadow-2xl">
                <Search className="w-5 h-5 text-muted-foreground ml-3" />
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describí tu look ideal..."
                  className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground focus:ring-0 px-4 py-3 text-lg"
                  autoFocus
                />
                <VisualSearchButton className="!rounded-md !p-3 !border-0 !bg-card" />
                <button
                  type="submit"
                  className="bg-accent text-black p-3 rounded-md hover:bg-accent/80 transition-colors font-medium flex items-center gap-2"
                >
                  <span className="hidden sm:inline">Buscar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {searchHistory.length > 0 && !prompt && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="text-xs text-muted-foreground flex items-center gap-1 mr-1"><Clock className="w-3 h-3" /> Recientes:</span>
                {searchHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setLocation(`/search?q=${encodeURIComponent(h)}`)}
                    className="px-3 py-1.5 text-xs bg-card border border-border rounded-full text-neutral-300 hover:text-foreground hover:border-white/30 transition-all"
                    data-testid={`button-history-${i}`}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => {
                    addToSearchHistory(ex);
                    setLocation(`/search?q=${encodeURIComponent(ex)}`);
                  }}
                  className="px-4 py-2 text-sm bg-card border border-border rounded-full text-muted-foreground hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all duration-300"
                  data-testid={`button-example-${i}`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Personalized Feed */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-xl md:text-2xl font-display font-bold text-foreground">
                {feedPersonalized ? "Para vos" : "Explorá"}
              </h2>
              {feedPersonalized && (
                <span className="text-[10px] uppercase tracking-wider text-accent bg-foreground px-2 py-0.5 rounded-full font-medium">
                  Personalizado
                </span>
              )}
            </div>
            {isAuthenticated && !user?.stylePassportCompleted && (
              <Link href="/style-passport" className="text-sm text-accent hover:underline flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                Completá tu perfil para recomendaciones personalizadas
              </Link>
            )}
          </div>

          {feedLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : feedProducts.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {feedProducts.map((p, i) => (
                  <FeedProductCard key={p.id} product={p} index={i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={() => loadFeed(feedProducts.length)}
                    disabled={loadingMore}
                    className="px-8 py-3 rounded-full border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all flex items-center gap-2"
                  >
                    {loadingMore ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</>
                    ) : (
                      "Ver más"
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No hay productos disponibles todavía.</p>
            </div>
          )}
        </motion.section>

      </main>
    </div>
  );
}
