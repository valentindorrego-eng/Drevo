import { Link, useLocation } from "wouter";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Sparkles, Search, Zap, ShieldCheck, Eye, Send, Check, ChevronDown } from "lucide-react";
import { useState, useRef } from "react";
import { Navigation } from "@/components/Navigation";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function Landing() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "landing" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Error al registrar");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: <Search className="w-5 h-5" />,
      title: "Búsqueda por intención",
      desc: "Escribí lo que querés vestir en lenguaje natural. Nuestra IA entiende estilo, ocasión, colores y contexto.",
    },
    {
      icon: <Eye className="w-5 h-5" />,
      title: "Búsqueda visual",
      desc: "Sacá una foto o subí una imagen. DREVO encuentra productos similares en múltiples marcas.",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Resultados inteligentes",
      desc: "No son filtros. Es inteligencia artificial que entiende qué querés y te explica por qué cada producto matchea.",
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: "Marcas reales",
      desc: "Productos de catálogos verificados. Comprás directo en la tienda oficial de cada marca.",
    },
  ];

  const examples = [
    { query: "Outfit para after office porteño", tags: ["casual elegante", "urbano", "noche"] },
    { query: "Look para asado de finde", tags: ["casual", "cómodo", "argentino"] },
    { query: "Vestido para casamiento como invitada", tags: ["elegante", "evento", "mujer"] },
    { query: "Ropa cómoda para viajar en avión", tags: ["travel", "comfort", "minimal"] },
  ];

  return (
    <div className="min-h-screen bg-black text-white selection:bg-[#C8FF00] selection:text-black overflow-x-hidden">
      <Navigation />

      {/* ═══ HERO ═══ */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex flex-col justify-center items-center px-4 pt-24 pb-16"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(200,255,0,0.03)_0%,_transparent_70%)]" />

        <motion.div
          initial="hidden"
          animate="visible"
          className="relative z-10 text-center max-w-5xl mx-auto space-y-8"
        >
          <motion.div variants={fadeUp} custom={0} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#C8FF00]/20 bg-[#C8FF00]/5">
            <Sparkles className="w-3.5 h-3.5 text-[#C8FF00]" />
            <span className="text-xs font-medium text-[#C8FF00] tracking-wide uppercase">Early Access</span>
          </motion.div>

          <motion.h1 variants={fadeUp} custom={1} className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold tracking-tighter leading-[0.9]">
            Describí lo que querés vestir.
            <br />
            <span className="text-[#C8FF00]">Nosotros lo encontramos.</span>
          </motion.h1>

          <motion.p variants={fadeUp} custom={2} className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto font-light leading-relaxed">
            DREVO es el motor de descubrimiento de moda por intención. Escribí en lenguaje natural,
            subí una foto, o describí la ocasión. Nuestra IA busca en catálogos reales de múltiples marcas.
          </motion.p>

          {/* Waitlist Form */}
          <motion.div variants={fadeUp} custom={3} className="max-w-md mx-auto w-full">
            {!submitted ? (
              <form onSubmit={handleWaitlist} className="relative">
                <div className="flex items-center bg-[#0A0A0A] border border-white/10 rounded-lg p-1.5 focus-within:border-[#C8FF00]/40 transition-colors">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="flex-1 bg-transparent border-none text-white placeholder:text-neutral-600 focus:ring-0 focus:outline-none px-4 py-3 text-base"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-[#C8FF00] text-black px-6 py-3 rounded-md font-semibold text-sm hover:bg-[#A3D600] transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span className="hidden sm:inline">Acceso anticipado</span>
                        <span className="sm:hidden">Unirme</span>
                      </>
                    )}
                  </button>
                </div>
                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                <p className="text-neutral-600 text-xs mt-3">Gratis. Sin spam. Serás de los primeros en probar DREVO.</p>
              </form>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 justify-center bg-[#C8FF00]/10 border border-[#C8FF00]/30 rounded-lg px-6 py-4"
              >
                <Check className="w-5 h-5 text-[#C8FF00]" />
                <span className="text-[#C8FF00] font-medium">Estás en la lista. Te avisamos cuando esté listo.</span>
              </motion.div>
            )}
          </motion.div>

          {/* CTA to try the app */}
          <motion.div variants={fadeUp} custom={4} className="pt-2">
            <button
              onClick={() => setLocation("/search")}
              className="text-sm text-neutral-500 hover:text-white transition-colors underline underline-offset-4 decoration-neutral-700 hover:decoration-white"
            >
              O probá el buscador ahora →
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-5 h-5 text-neutral-600 animate-bounce" />
        </motion.div>
      </motion.section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="py-24 px-4 md:px-8 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <p className="text-xs font-medium tracking-widest uppercase text-[#C8FF00] mb-3">Cómo funciona</p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight">
            Moda descubierta por inteligencia,<br className="hidden md:block" />
            no por filtros.
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 mb-20">
          {[
            { step: "01", title: "Describí", desc: "Escribí lo que querés vestir: ocasión, estilo, colores, vibe. Sin filtros rígidos." },
            { step: "02", title: "IA interpreta", desc: "Nuestra inteligencia artificial extrae intención, contexto y compatibilidad de tu búsqueda." },
            { step: "03", title: "Descubrí", desc: "Recibís productos reales de múltiples marcas, rankeados por relevancia semántica." },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative group"
            >
              <div className="text-6xl font-display font-bold text-white/[0.03] absolute -top-4 -left-2 select-none">{item.step}</div>
              <div className="relative border border-white/5 rounded-2xl p-8 bg-white/[0.02] hover:border-[#C8FF00]/20 transition-colors duration-500">
                <span className="text-[#C8FF00] text-xs font-mono font-bold tracking-wider">{item.step}</span>
                <h3 className="text-xl font-display font-bold mt-3 mb-2">{item.title}</h3>
                <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Features grid */}
        <div className="grid sm:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex gap-4 p-6 border border-white/5 rounded-xl bg-white/[0.01] hover:border-white/10 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-[#C8FF00]/10 flex items-center justify-center text-[#C8FF00] shrink-0">
                {feature.icon}
              </div>
              <div>
                <h4 className="font-display font-semibold mb-1">{feature.title}</h4>
                <p className="text-sm text-neutral-400 leading-relaxed">{feature.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ SEARCH EXAMPLES ═══ */}
      <section className="py-24 px-4 md:px-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <p className="text-xs font-medium tracking-widest uppercase text-[#C8FF00] mb-3">Búsquedas reales</p>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Así busca la gente en DREVO.
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 gap-4">
            {examples.map((ex, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                onClick={() => setLocation(`/search?q=${encodeURIComponent(ex.query)}`)}
                className="text-left p-5 border border-white/5 rounded-xl bg-white/[0.02] hover:border-[#C8FF00]/30 hover:bg-[#C8FF00]/[0.02] transition-all duration-300 group"
              >
                <div className="flex items-start gap-3">
                  <Search className="w-4 h-4 text-neutral-500 group-hover:text-[#C8FF00] mt-0.5 transition-colors shrink-0" />
                  <div>
                    <p className="font-medium text-white group-hover:text-[#C8FF00] transition-colors">{ex.query}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {ex.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-neutral-500">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FOR BRANDS ═══ */}
      <section className="py-24 px-4 md:px-8 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <p className="text-xs font-medium tracking-widest uppercase text-[#C8FF00] mb-3">Para marcas</p>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              Tu catálogo merece ser descubierto.
            </h2>
            <p className="text-neutral-400 max-w-xl mx-auto leading-relaxed">
              Conectá tu tienda de Tiendanube en minutos. DREVO indexa tu catálogo con inteligencia artificial
              y lo muestra a usuarios que realmente buscan lo que vendés. Sin pauta. Sin keywords. Solo intención real.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/connect"
                className="inline-flex items-center justify-center gap-2 bg-white text-black px-6 py-3 rounded-lg font-semibold text-sm hover:bg-neutral-200 transition-colors"
              >
                Conectar mi tienda
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href="mailto:valentindorrego@gmail.com?subject=DREVO%20-%20Quiero%20conectar%20mi%20marca"
                className="inline-flex items-center justify-center gap-2 border border-white/10 text-white px-6 py-3 rounded-lg font-semibold text-sm hover:border-white/30 transition-colors"
              >
                Contactar al equipo
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="py-24 px-4 md:px-8 border-t border-white/5">
        <div className="max-w-lg mx-auto text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-4">
              Sé de los primeros.
            </h2>
            <p className="text-neutral-400 mb-8">
              Dejá tu email y accedé antes que nadie al futuro del descubrimiento de moda.
            </p>

            {!submitted ? (
              <form onSubmit={handleWaitlist} className="flex items-center bg-[#0A0A0A] border border-white/10 rounded-lg p-1.5 focus-within:border-[#C8FF00]/40 transition-colors">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  className="flex-1 bg-transparent border-none text-white placeholder:text-neutral-600 focus:ring-0 focus:outline-none px-4 py-3 text-base"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#C8FF00] text-black px-6 py-3 rounded-md font-semibold text-sm hover:bg-[#A3D600] transition-colors disabled:opacity-50 shrink-0"
                >
                  {loading ? "..." : "Unirme"}
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 justify-center bg-[#C8FF00]/10 border border-[#C8FF00]/30 rounded-lg px-6 py-4">
                <Check className="w-5 h-5 text-[#C8FF00]" />
                <span className="text-[#C8FF00] font-medium">Ya estás en la lista.</span>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="border-t border-white/5 py-12 px-4 md:px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-display font-bold tracking-tighter">
              <span className="text-white">DRE</span><span className="text-[#C8FF00]">VO</span>
            </span>
            <span className="text-neutral-600 text-xs ml-2">La capa de inteligencia sobre la moda.</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-neutral-500">
            <Link href="/search" className="hover:text-white transition-colors">Buscar</Link>
            <Link href="/connect" className="hover:text-white transition-colors">Para marcas</Link>
            <a href="mailto:valentindorrego@gmail.com" className="hover:text-white transition-colors">Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
