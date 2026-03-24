import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Check, Sparkles, Palette, Calendar, DollarSign } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const VIBES = [
  { id: "minimalista", label: "Minimalista", icon: "◻️" },
  { id: "urbano", label: "Urbano", icon: "🏙️" },
  { id: "elegante", label: "Elegante", icon: "✨" },
  { id: "casual", label: "Casual", icon: "☀️" },
  { id: "streetwear", label: "Streetwear", icon: "🔥" },
  { id: "clasico", label: "Clásico", icon: "🎩" },
  { id: "atrevido", label: "Atrevido", icon: "⚡" },
  { id: "bohemio", label: "Bohemio", icon: "🌿" },
];

const OCASIONES = [
  { id: "trabajo", label: "Trabajo / oficina" },
  { id: "salidas_noche", label: "Salidas de noche" },
  { id: "casual_finde", label: "Casual finde" },
  { id: "eventos", label: "Eventos y fiestas" },
  { id: "viajes", label: "Viajes" },
  { id: "deportivo", label: "Deportivo" },
  { id: "quince", label: "Cumpleaños de 15" },
  { id: "asado", label: "Asado familiar" },
];

const PRESUPUESTOS = [
  { id: "bajo", label: "Hasta $30 USD", range: "💰" },
  { id: "medio", label: "$30 - $80 USD", range: "💰💰" },
  { id: "alto", label: "$80 - $200 USD", range: "💰💰💰" },
  { id: "premium", label: "+$200 USD", range: "💰💰💰💰" },
];

export default function StylePassport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [selectedVibes, setSelectedVibes] = useState<string[]>([]);
  const [selectedOcasiones, setSelectedOcasiones] = useState<string[]>([]);
  const [selectedPresupuesto, setSelectedPresupuesto] = useState<string>("");

  const savePassport = useMutation({
    mutationFn: async (data: { styleVibes: string[]; ocasionesFrecuentes: string[]; presupuestoRango: string }) => {
      const res = await apiRequest("POST", "/api/user/style-passport", data);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      toast({ title: "Style Passport completado", description: "Tu perfil de estilo fue guardado." });
      setLocation("/");
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

  const handleNext = () => {
    if (step === 2) {
      savePassport.mutate({
        styleVibes: selectedVibes,
        ocasionesFrecuentes: selectedOcasiones,
        presupuestoRango: selectedPresupuesto,
      });
      return;
    }
    setStep(prev => prev + 1);
  };

  const canProceed = step === 0 ? selectedVibes.length > 0 : step === 1 ? selectedOcasiones.length > 0 : !!selectedPresupuesto;

  const stepIcons = [<Palette key={0} className="w-5 h-5" />, <Calendar key={1} className="w-5 h-5" />, <DollarSign key={2} className="w-5 h-5" />];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full">
        <div className="w-full mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-[#C8FF00]" />
            <span className="text-sm font-medium text-[#C8FF00] uppercase tracking-wider">Style Passport</span>
          </div>
          <div className="flex gap-2 mb-8">
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-[#C8FF00]" : "bg-white/10"}`} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-vibes">
                  ¿Cómo te describirías?
                </h1>
                <p className="text-neutral-400">Elegí todos los que te representen.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {VIBES.map(v => (
                  <button
                    key={v.id}
                    onClick={() => toggleVibe(v.id)}
                    data-testid={`button-vibe-${v.id}`}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedVibes.includes(v.id)
                        ? "border-[#C8FF00] bg-[#C8FF00]/10 text-white"
                        : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/30"
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{v.icon}</span>
                    <span className="font-medium">{v.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-ocasiones">
                  ¿Para qué ocasiones comprás más?
                </h1>
                <p className="text-neutral-400">Elegí todas las que apliquen.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {OCASIONES.map(o => (
                  <button
                    key={o.id}
                    onClick={() => toggleOcasion(o.id)}
                    data-testid={`button-ocasion-${o.id}`}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      selectedOcasiones.includes(o.id)
                        ? "border-[#C8FF00] bg-[#C8FF00]/10 text-white"
                        : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/30"
                    }`}
                  >
                    <span className="font-medium">{o.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-display font-bold" data-testid="text-passport-title-presupuesto">
                  ¿Cuánto solés gastar por prenda?
                </h1>
                <p className="text-neutral-400">Elegí tu rango habitual.</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {PRESUPUESTOS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPresupuesto(p.id)}
                    data-testid={`button-presupuesto-${p.id}`}
                    className={`p-5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      selectedPresupuesto === p.id
                        ? "border-[#C8FF00] bg-[#C8FF00]/10 text-white"
                        : "border-white/10 bg-white/5 text-neutral-300 hover:border-white/30"
                    }`}
                  >
                    <span className="font-medium text-lg">{p.label}</span>
                    <span className="text-lg">{p.range}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full flex items-center justify-between mt-12">
          {step > 0 ? (
            <button
              onClick={() => setStep(prev => prev - 1)}
              className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors"
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
            className={`flex items-center gap-2 px-8 py-4 rounded-full font-bold text-lg transition-all ${
              canProceed
                ? "bg-[#C8FF00] text-black hover:bg-[#A3D600]"
                : "bg-white/10 text-neutral-600 cursor-not-allowed"
            }`}
          >
            {savePassport.isPending ? (
              <span className="animate-pulse">Guardando...</span>
            ) : step === 2 ? (
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
