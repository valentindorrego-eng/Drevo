import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Search, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { Navigation } from "@/components/Navigation";

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

export default function Landing() {
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    setSearchHistory(getSearchHistory());
  }, []);

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
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <Navigation />
      <main className="relative pt-32 pb-20 px-4 md:px-8 max-w-7xl mx-auto min-h-screen flex flex-col justify-center">
        
        {/* Hero Section */}
        <div className="w-full max-w-4xl mx-auto text-center space-y-8 md:space-y-12 mb-20">
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#C8FF00]/20 bg-[#C8FF00]/5 text-xs font-medium text-[#C8FF00] mb-4">
              <Sparkles className="w-3 h-3" />
              <span>Fashion Intelligence Engine</span>
            </div>

            <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-[0.9]">
              Encontrá ropa <br className="hidden md:block"/>
              <span className="text-[#C8FF00]">con intención.</span>
            </h1>
            
            <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto font-light leading-relaxed">
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
              <div className="relative flex items-center bg-[#0A0A0A] border border-white/10 rounded-lg p-2 shadow-2xl">
                <Search className="w-5 h-5 text-neutral-500 ml-3" />
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describí tu look ideal..."
                  className="flex-1 bg-transparent border-none text-white placeholder:text-neutral-600 focus:ring-0 px-4 py-3 text-lg"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-[#C8FF00] text-black p-3 rounded-md hover:bg-[#A3D600] transition-colors font-medium flex items-center gap-2"
                >
                  <span className="hidden sm:inline">Buscar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {searchHistory.length > 0 && !prompt && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <span className="text-xs text-neutral-600 flex items-center gap-1 mr-1"><Clock className="w-3 h-3" /> Recientes:</span>
                {searchHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setLocation(`/search?q=${encodeURIComponent(h)}`)}
                    className="px-3 py-1.5 text-xs bg-white/5 border border-white/10 rounded-full text-neutral-300 hover:text-white hover:border-white/30 transition-all"
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
                  className="px-4 py-2 text-sm bg-white/5 border border-white/5 rounded-full text-neutral-400 hover:text-[#C8FF00] hover:border-[#C8FF00]/30 hover:bg-[#C8FF00]/5 transition-all duration-300"
                  data-testid={`button-example-${i}`}
                >
                  {ex}
                </button>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Decorative Visuals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-40 grayscale hover:grayscale-0 transition-all duration-700 ease-in-out pointer-events-none select-none">
          {[
            // Unsplash Fashion Images with credits
            "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&auto=format&fit=crop&q=60", // Fashion editorial 1
            "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&auto=format&fit=crop&q=60", // Fashion editorial 2
            "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&auto=format&fit=crop&q=60", // Fashion editorial 3
            "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600&auto=format&fit=crop&q=60"  // Fashion editorial 4
          ].map((src, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 + (i * 0.1) }}
              className={`aspect-[3/4] rounded-lg overflow-hidden ${i % 2 === 0 ? 'mt-12' : ''}`}
            >
              <img src={src} alt="Fashion visual" className="w-full h-full object-cover" />
            </motion.div>
          ))}
        </div>

      </main>
    </div>
  );
}
