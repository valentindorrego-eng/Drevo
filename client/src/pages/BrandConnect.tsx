import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navigation } from "@/components/Navigation";
import { CheckCircle2, AlertCircle, Loader2, Store, RefreshCw, Plug } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Integration {
  id: string;
  provider: string;
  storeId: string | null;
  createdAt: string;
}

export default function BrandConnect() {
  const searchParams = new URLSearchParams(window.location.search);
  const justConnected = searchParams.get("connected") === "1";
  const connectionError = searchParams.get("error");

  const [syncResult, setSyncResult] = useState<{ synced: number; errors: string[] } | null>(null);

  const { data, isLoading } = useQuery<{ integrations: Integration[] }>({
    queryKey: ["/api/integrations"],
  });

  const integrations = data?.integrations ?? [];
  const tiendanubeIntegration = integrations.find(i => i.provider === "tiendanube");
  const isConnected = !!tiendanubeIntegration;

  const syncMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/sync-products`);
      return res.json();
    },
    onSuccess: (data) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
  });

  const handleConnect = () => {
    window.location.href = "/auth/tiendanube/start";
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-28 pb-20 px-4 md:px-8 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-10"
        >
          {/* Header */}
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-widest uppercase text-[#C8FF00]">
              Integraciones
            </p>
            <h1 className="text-4xl font-display font-bold tracking-tight">
              Conectá tu tienda
            </h1>
            <p className="text-neutral-400 text-base leading-relaxed">
              Conectá tu catálogo de Tiendanube para que tus productos aparezcan en DREVO con búsqueda semántica AI.
            </p>
          </div>

          {/* Success / Error banner from OAuth redirect */}
          {justConnected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-[#C8FF00]/10 border border-[#C8FF00]/30 rounded-xl px-4 py-3"
            >
              <CheckCircle2 className="w-5 h-5 text-[#C8FF00] shrink-0" />
              <span className="text-sm text-[#C8FF00]">
                ¡Tienda conectada exitosamente! Ahora podés sincronizar tus productos.
              </span>
            </motion.div>
          )}
          {connectionError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span className="text-sm text-red-400">
                Hubo un error al conectar la tienda. Intentá de nuevo.
              </span>
            </motion.div>
          )}

          {/* Tiendanube Card */}
          <div className="border border-white/10 rounded-2xl overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#00aeef]/10 flex items-center justify-center">
                  <Store className="w-5 h-5 text-[#00aeef]" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Tiendanube</p>
                  <p className="text-xs text-neutral-500">Nuvemshop · Argentina</p>
                </div>
              </div>

              {isLoading ? (
                <Loader2 className="w-4 h-4 text-neutral-500 animate-spin" />
              ) : isConnected ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8FF00] bg-[#C8FF00]/10 px-3 py-1 rounded-full border border-[#C8FF00]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8FF00] inline-block" />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 inline-block" />
                  No conectado
                </span>
              )}
            </div>

            {/* Card body */}
            <div className="px-6 py-5 space-y-4">
              {isConnected && tiendanubeIntegration?.storeId && (
                <p className="text-xs text-neutral-500">
                  Store ID: <span className="text-neutral-300 font-mono">{tiendanubeIntegration.storeId}</span>
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleConnect}
                  data-testid="button-connect-tiendanube"
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-colors"
                >
                  <Plug className="w-4 h-4" />
                  {isConnected ? "Reconectar Tiendanube" : "Conectar Tiendanube"}
                </button>

                {isConnected && (
                  <button
                    onClick={() => syncMutation.mutate(tiendanubeIntegration!.id)}
                    disabled={syncMutation.isPending}
                    data-testid="button-sync-products"
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[#C8FF00]/40 text-[#C8FF00] text-sm font-semibold hover:bg-[#C8FF00]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {syncMutation.isPending ? "Sincronizando..." : "Sincronizar productos"}
                  </button>
                )}
              </div>

              {/* Sync result */}
              {syncResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 rounded-xl bg-white/5 border border-white/10 px-4 py-3 space-y-1"
                >
                  <p className="text-sm font-medium text-white">
                    Sincronización completada
                  </p>
                  <p className="text-xs text-neutral-400">
                    {syncResult.synced} producto{syncResult.synced !== 1 ? "s" : ""} importado{syncResult.synced !== 1 ? "s" : ""}
                    {syncResult.errors.length > 0 && ` · ${syncResult.errors.length} errores`}
                  </p>
                </motion.div>
              )}

              {syncMutation.isError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Error al sincronizar. Verificá que la tienda esté conectada correctamente.
                </p>
              )}
            </div>
          </div>

          {/* Info block */}
          <div className="text-xs text-neutral-600 space-y-1 leading-relaxed">
            <p>Al conectar tu tienda, DREVO importa tu catálogo y genera embeddings semánticos para cada producto.</p>
            <p>La sincronización es idempotente: podés ejecutarla varias veces sin duplicar productos.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
