import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Search, Clock, ShoppingBag, Loader2, Zap, Eye, Store, TrendingUp, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Navigation } from "@/components/Navigation";
import { VisualSearchButton } from "@/components/VisualSearchButton";
import { useAuth } from "@/hooks/useAuth";

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

// Stats that update from API
function useStats() {
  const [stats, setStats] = useState({ brands: 0, products: 0 });
  useEffect(() => {
    fetch("/api/feed?limit=1&offset=0")
      .then(r => r.json())
      .then(data => {
        if (data.totalProducts) setStats(s => ({ ...s, products: data.totalProducts }));
      })
      .catch(() => {});
    // Count unique brands from feed data
    fetch("/api/feed?limit=100&offset=0")
      .then(r => r.json())
      .then(data => {
        if (data.products) {
          const uniqueBrands = new Set(data.products.map((p: any) => p.brand).filter(Boolean));
          setStats(s => ({ ...s, brands: uniqueBrands.size }));
        }
      })
      .catch(() => {});
  }, []);
  return stats;
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
  const stats = useStats();

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
      <main className="relative">

        {/* ═══ HERO SECTION ═══ */}
        <section className="pt-32 pb-16 px-4 md:px-8 max-w-7xl mx-auto text-center">
          <div className="w-full max-w-4xl mx-auto space-y-8 md:space-y-12">

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/10 text-xs font-medium text-accent mb-4">
                <Sparkles className="w-3 h-3" />
                <span>Fashion Intelligence Engine</span>
              </div>

              <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-[0.9]">
                Encontrá ropa <br className="hidden md:block"/>
                <span className="text-accent">con intención.</span>
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                Describí lo que buscás — la ocasión, el vibe, cómo te querés sentir — y nuestra IA te encuentra las prendas perfectas de {stats.brands > 0 ? `${stats.brands}+` : "cientos de"} marcas argentinas.
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
        </section>

        {/* ═══ HOW IT WORKS ═══ */}
        <section className="py-20 px-4 md:px-8 border-t border-border/30">
          <div className="max-w-6xl mx-auto">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-14"
            >
              <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                Cómo funciona
              </h2>
              <p className="text-muted-foreground mt-3 max-w-lg mx-auto">
                De la idea a la prenda en segundos. Sin filtros, sin scroll infinito.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 md:gap-12">
              {[
                {
                  icon: Search,
                  step: "01",
                  title: "Describí",
                  desc: "Contale a DREVO qué buscás: la ocasión, el estilo, los colores, cómo te querés sentir. Hablale como a un amigo."
                },
                {
                  icon: Zap,
                  step: "02",
                  title: "Descubrí",
                  desc: "Nuestra IA busca entre miles de productos de marcas argentinas y te muestra exactamente lo que necesitás."
                },
                {
                  icon: ShoppingBag,
                  step: "03",
                  title: "Comprá",
                  desc: "Encontrá el precio, probalo virtualmente y comprá directo. Todo en un solo lugar."
                },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.15 }}
                  className="relative group"
                >
                  <div className="p-8 rounded-2xl border border-border/50 bg-card/50 hover:border-accent/20 transition-all duration-300">
                    <span className="text-5xl font-display font-bold text-accent/15 absolute top-4 right-6">{item.step}</span>
                    <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
                      <item.icon className="w-5 h-5 text-accent" />
                    </div>
                    <h3 className="text-xl font-display font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ STATS BAR ═══ */}
        <section className="py-12 px-4 md:px-8 border-t border-border/30 bg-accent/[0.03]">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { value: stats.brands > 0 ? `${stats.brands}+` : "140+", label: "Marcas argentinas" },
                { value: stats.products > 0 ? `${Math.round(stats.products / 100) * 100}+` : "1,400+", label: "Productos" },
                { value: "IA", label: "Búsqueda semántica" },
                { value: "AR", label: "Probador virtual" },
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <div className="text-3xl md:text-4xl font-display font-bold text-accent">{stat.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ VALUE PROPS ═══ */}
        <section className="py-20 px-4 md:px-8 border-t border-border/30">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                  No es un buscador.<br/>
                  <span className="text-accent">Es tu estilista.</span>
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Los buscadores tradicionales te muestran lo que ya sabés que querés. DREVO entiende lo que necesitás aunque no sepas cómo buscarlo.
                </p>
                <ul className="space-y-4">
                  {[
                    { icon: Eye, text: "Probador virtual con IA — mirá cómo te queda antes de comprar" },
                    { icon: Store, text: "Marcas argentinas reales — no genéricos importados" },
                    { icon: TrendingUp, text: "Recomendaciones que mejoran con cada búsqueda" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                        <item.icon className="w-4 h-4 text-accent" />
                      </div>
                      <span className="text-sm text-muted-foreground">{item.text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative"
              >
                {/* Mock search demo */}
                <div className="rounded-2xl border border-border/50 bg-card/80 p-6 space-y-4">
                  <div className="flex items-center gap-3 px-4 py-3 bg-background/50 rounded-lg border border-border/50">
                    <Search className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground italic">"algo elegante para un cumpleaños de noche"</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-accent">
                    <Zap className="w-3 h-3" />
                    <span>DREVO encontró 47 resultados en 0.8s</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {feedProducts.slice(0, 3).map((p, i) => {
                      const img = p.images?.sort((a, b) => a.position - b.position)[0]?.url;
                      return img ? (
                        <div key={i} className="aspect-[3/4] rounded-lg overflow-hidden bg-muted">
                          <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ) : (
                        <div key={i} className="aspect-[3/4] rounded-lg bg-muted/20" />
                      );
                    })}
                    {feedProducts.length < 3 && Array.from({ length: 3 - feedProducts.length }).map((_, i) => (
                      <div key={`placeholder-${i}`} className="aspect-[3/4] rounded-lg bg-muted/20 animate-pulse" />
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-2">
                    <span>Vestidos, tops, jumpsuits de 12 marcas</span>
                    <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══ FOR BRANDS CTA ═══ */}
        <section className="py-16 px-4 md:px-8 border-t border-border/30 bg-accent/[0.03]">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-5"
            >
              <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
                ¿Tenés una marca de moda?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Conectá tu tienda a DREVO y llegá a miles de consumidores que buscan exactamente lo que vendés. Sin publicidad, sin comisión hasta tu primera venta.
              </p>
              <div className="flex flex-wrap justify-center gap-4 pt-2">
                <Link
                  href="/connect"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black rounded-lg font-medium hover:bg-accent/80 transition-colors"
                >
                  <Store className="w-4 h-4" />
                  Conectar mi tienda
                </Link>
                <Link
                  href="/search?q=marcas"
                  className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-lg font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                >
                  Ver marcas en DREVO
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ═══ PRODUCT FEED ═══ */}
        <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
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
                  Completá tu perfil para recomendaciones
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
          </motion.div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className="py-12 px-4 md:px-8 border-t border-border/30">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <span className="text-xl font-display font-bold tracking-tight">DREVO</span>
              <span className="text-xs text-muted-foreground">Fashion Intelligence</span>
            </div>
            <nav className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/search" className="hover:text-foreground transition-colors">Buscar</Link>
              <Link href="/connect" className="hover:text-foreground transition-colors">Para marcas</Link>
              <Link href="/style-passport" className="hover:text-foreground transition-colors">Style Passport</Link>
            </nav>
            <p className="text-xs text-muted-foreground/60">
              Hecho en Argentina
            </p>
          </div>
        </footer>

      </main>
    </div>
  );
}
