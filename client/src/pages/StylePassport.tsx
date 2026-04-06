import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, Sparkles, Palette, Calendar, DollarSign, X, Shirt, Ruler, Heart } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const VIBES = [
  { id: "minimalista", label: "Minimalista", icon: "◻️" },
  { id: "urbano", label: "Urbano", icon: "🏙️" },
  { id: "elegante", label: "Elegante", icon: "✨" },
  { id: "casual", label: "Casual", icon: "☀️" },
  { id: "streetwear", label: "Streetwear", icon: "🔥" },
  { id: "clasico", label: "Clásico", icon: "🎩" },
  { id: "atrevido", label: "Atrevido", icon: "⚡" },
  { id: "bohemio", label: "Bohemio", icon: "🌿" },
  { id: "deportivo", label: "Deportivo", icon: "🏃" },
  { id: "oversized", label: "Oversized", icon: "🧥" },
];

const OCASIONES = [
  { id: "trabajo", label: "Trabajo / oficina" },
  { id: "salidas_noche", label: "Salidas de noche" },
  { id: "casual_finde", label: "Casual finde" },
  { id: "eventos", label: "Eventos y fiestas" },
  { id: "viajes", label: "Viajes" },
  { id: "deportivo", label: "Deportivo" },
  { id: "universidad", label: "Universidad / facultad" },
  { id: "citas", label: "Citas" },
];

const PRESUPUESTOS = [
  { id: "bajo", label: "Hasta $30 USD", range: "💰" },
  { id: "medio", label: "$30 - $80 USD", range: "💰💰" },
  { id: "alto", label: "$80 - $200 USD", range: "💰💰💰" },
  { id: "premium", label: "+$200 USD", range: "💰💰💰💰" },
];

const MARCAS_POPULARES = [
  "Nike", "Adidas", "Zara", "H&M", "Uniqlo", "Pull&Bear",
  "Bershka", "Lacoste", "Tommy Hilfiger", "Levi's",
  "New Balance", "Converse", "Vans", "The North Face",
  "Wrangler", "Polo Ralph Lauren",
];

const TALLES = ["XS", "S", "M", "L", "XL", "XXL"];

const COLORES_EVITAR = [
  { id: "ninguno", label: "Ninguno, me gustan todos", color: "bg-gradient-to-r from-red-400 via-green-400 to-blue-400" },
  { id: "rosa", label: "Rosa", color: "bg-pink-400" },
  { id: "naranja", label: "Naranja", color: "bg-orange-400" },
  { id: "amarillo", label: "Amarillo", color: "bg-yellow-400" },
  { id: "verde", label: "Verde", color: "bg-green-500" },
  { id: "morado", label: "Morado", color: "bg-purple-500" },
  { id: "rojo", label: "Rojo", color: "bg-red-500" },
  { id: "marron", label: "Marrón", color: "bg-amber-700" },
];

const TOTAL_STEPS = 6;

export default function StylePassport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedOcasiones, setSelectedOcasiones] = useState<string[]>([]);
  const [selectedPresupuesto, setSelectedPresupuesto] = useState<string>("");
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>([]);
  const [customMarca, setCustomMarca] = useState("");
  const [selectedTalle, setSelectedTalle] = useState<string>("");
  const [selectedColoresEvitar, setSelectedColoresEvitar] = useState<string[]>([]);
  const [genero, setGenero] = useState<string>("");

  const savePassport = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/user/style-passport", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      toast({ title: "Listo!", description: "Tu perfil de estilo fue guardado. El estilista ya te conoce." });
      setLocation("/stylist");
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo guardar tu perfil de estilo.", variant: "destructive" });
    },
  });

  const toggleVibe = (id: string) => {
    setSelectedVibes(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const toggleOcasion = (id: string) => {
    setSelectedOcasiones(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  };

  const toggleMarca = (marca: string) => {
    setSelectedMarcas(prev => prev.includes(marca) ? prev.filter(m => m !== marca) : [...prev, marca]);
  };

  const addCustomMarca = () => {
    const m = customMarca.trim();
    if (m && !selectedMarcas.includes(m)) {
      setSelectedMarcas(prev => [...prev, m]);
      setCustomMarca("");
    }
  };

  const toggleColor = (id: string) => {
    if (id === "ninguno") {
      setSelectedColoresEvitar(prev => prev.includes("ninguno") ? [] : ["ninguno"]);
      return;
    }
    setSelectedColoresEvitar(prev => {
      const without = prev.filter(c => c !== "ninguno");
      return without.includes(id) ? without.filter(c => c !== id) : [...without, id];
    });
  };

  const handleNext = () => {
    if (step === TOTAL_STEPS - 1) {
      savePassport.mutate({
        styleVibes: selectedVibes,
        ocasionesFrecuentes: selectedOcasiones,
        presupuestoRango: selectedPresupuesto,
        marcasFavoritas: selectedMarcas,
        coloresEvitar: selectedColoresEvitar.includes("ninguno") ? [] : selectedColoresEvitar,
        preferredSize: selectedTalle || null,
        genero: genero || null,
      });
      return;
    }
    setStep(prev => prev + 1);
  };

  const canProceed =
    step === 0 ? !!genero :
    step === 1 ? selectedVibes.length > 0 :
    step === 2 ? selectedOcasiones.length > 0 :
    step === 3 ? !!selectedPresupuesto :
    step === 4 ? true : // marcas es opcional
    step === 5 ? true : // colores es opcional
    false;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full">
        <div className="w-full mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 bg-foreground px-3 py-1 rounded-full">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent uppercase tracking-wider">Style Passport</span>
              </span>
            </div>
            <button
              onClick={() => setLocation("/")}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm"
              data-testid="button-passport-skip"
            >
              Omitir <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-1 mb-8">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-accent" : "bg-border"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Paso {step + 1} de {TOTAL_STEPS}</p>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Gender */}
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold">
                  Primero lo básico
                </h1>
                <p className="text-muted-foreground">Así podemos mostrarte ropa que te quede.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {[
                  { id: "hombre", label: "Hombre" },
                  { id: "mujer", label: "Mujer" },
                  { id: "no_binario", label: "No binario / Prefiero no decir" },
                ].map(g => (
                  <button
                    key={g.id}
                    onClick={() => setGenero(g.id)}
                    className={cn(
                      "p-5 rounded-xl border text-left transition-all text-lg font-medium",
                      genero === g.id
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 1: Vibes */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-vibes">
                  ¿Cómo te describirías?
                </h1>
                <p className="text-muted-foreground">Elegí todos los que te representen.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {VIBES.map(v => (
                  <button
                    key={v.id}
                    onClick={() => toggleVibe(v.id)}
                    data-testid={`button-vibe-${v.id}`}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      selectedVibes.includes(v.id)
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    <span className="text-2xl mb-2 block">{v.icon}</span>
                    <span className="font-medium">{v.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 2: Occasions */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-ocasiones">
                  ¿Para qué ocasiones comprás más?
                </h1>
                <p className="text-muted-foreground">Elegí todas las que apliquen.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {OCASIONES.map(o => (
                  <button
                    key={o.id}
                    onClick={() => toggleOcasion(o.id)}
                    data-testid={`button-ocasion-${o.id}`}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all",
                      selectedOcasiones.includes(o.id)
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    <span className="font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 3: Budget */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-presupuesto">
                  ¿Cuánto solés gastar por prenda?
                </h1>
                <p className="text-muted-foreground">Elegí tu rango habitual.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {PRESUPUESTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPresupuesto(p.id)}
                    data-testid={`button-presupuesto-${p.id}`}
                    className={cn(
                      "p-5 rounded-xl border text-left transition-all flex items-center justify-between",
                      selectedPresupuesto === p.id
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    <span className="font-medium text-lg">{p.label}</span>
                    <span className="text-lg">{p.range}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Step 4: Favorite brands */}
          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold">
                  ¿Qué marcas te gustan?
                </h1>
                <p className="text-muted-foreground">Elegí las que más comprás o te gustaría comprar. Podés agregar otras.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {MARCAS_POPULARES.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleMarca(m)}
                    className={cn(
                      "px-4 py-2 rounded-full border text-sm font-medium transition-all",
                      selectedMarcas.includes(m)
                        ? "border-accent bg-accent/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-foreground/30"
                    )}
                  >
                    {m}
                  </button>
                ))}
                {selectedMarcas.filter(m => !MARCAS_POPULARES.includes(m)).map(m => (
                  <button
                    key={m}
                    onClick={() => toggleMarca(m)}
                    className="px-4 py-2 rounded-full border border-accent bg-accent/10 text-foreground text-sm font-medium transition-all"
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customMarca}
                  onChange={e => setCustomMarca(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustomMarca()}
                  placeholder="Agregar otra marca..."
                  className="flex-1 px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground text-sm outline-none focus:border-accent/50"
                />
                <button
                  onClick={addCustomMarca}
                  disabled={!customMarca.trim()}
                  className="px-4 py-3 rounded-xl bg-accent text-black font-medium text-sm disabled:opacity-30"
                >
                  Agregar
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Opcional — si no elegís ninguna, te mostramos de todo.</p>
            </motion.div>
          )}

          {/* Step 5: Size + Colors to avoid */}
          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-10"
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-3xl md:text-4xl font-display font-bold">
                    Últimos detalles
                  </h1>
                  <p className="text-muted-foreground">Para afinar las recomendaciones.</p>
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <Ruler className="w-4 h-4" /> Tu talle habitual
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TALLES.map(t => (
                      <button
                        key={t}
                        onClick={() => setSelectedTalle(t)}
                        className={cn(
                          "w-14 h-14 rounded-xl border font-bold text-sm transition-all",
                          selectedTalle === t
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-foreground flex items-center gap-2">
                    <Palette className="w-4 h-4" /> ¿Hay algún color que no te guste?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COLORES_EVITAR.map(c => (
                      <button
                        key={c.id}
                        onClick={() => toggleColor(c.id)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all",
                          selectedColoresEvitar.includes(c.id)
                            ? "border-accent bg-accent/10 text-foreground"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        )}
                      >
                        <span className={cn("w-4 h-4 rounded-full", c.color)} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Todo esto es opcional, podés avanzar sin completar.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full flex items-center justify-between mt-12">
          {step > 0 ? (
            <button
              onClick={() => setStep(prev => prev - 1)}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-passport-back"
            >
              <ArrowLeft className="w-4 h-4" /> Anterior
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed || savePassport.isPending}
            data-testid="button-passport-next"
            className={cn(
              "flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition-all",
              canProceed
                ? "bg-accent text-black hover:bg-accent/80"
                : "bg-border text-muted-foreground cursor-not-allowed"
            )}
          >
            {savePassport.isPending ? (
              <span className="animate-pulse">Guardando...</span>
            ) : step === TOTAL_STEPS - 1 ? (
              <><Check className="w-5 h-5" /> Completar</>
            ) : (
              <>Siguiente <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
