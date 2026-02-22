import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Search } from "lucide-react";
import { useState } from "react";
import { Navigation } from "@/components/Navigation";

export default function Landing() {
  const [, setLocation] = useLocation();
  const [prompt, setPrompt] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      setLocation(`/search?q=${encodeURIComponent(prompt)}`);
    }
  };

  const examples = [
    "Outfit minimalista negro para noche",
    "Streetwear japonés oversize",
    "Look oficina verano relajado",
    "Vestido cocktail asimétrico"
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs font-medium text-neutral-300 mb-4">
              <Sparkles className="w-3 h-3 text-yellow-200" />
              <span>Fashion Intelligence Engine</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-[0.9]">
              Encontrá ropa <br className="hidden md:block"/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-400 to-white">con intención.</span>
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
                  className="bg-white text-black p-3 rounded-md hover:bg-neutral-200 transition-colors font-medium flex items-center gap-2"
                >
                  <span className="hidden sm:inline">Buscar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Prompt Chips */}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {examples.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setLocation(`/search?q=${encodeURIComponent(ex)}`)}
                  className="px-4 py-2 text-sm bg-white/5 border border-white/5 rounded-full text-neutral-400 hover:text-white hover:border-white/20 hover:bg-white/10 transition-all duration-300"
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
