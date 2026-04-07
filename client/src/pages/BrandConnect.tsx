import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Navigation } from "@/components/Navigation";
import { CheckCircle2, AlertCircle, Loader2, Store, RefreshCw, Plug, Plus } from "lucide-react";
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
  const connectedStoreId = searchParams.get("store_id");
  const connectionError = searchParams.get("error");
  const errorDetail = searchParams.get("detail");

  const [syncResults, setSyncResults] = useState<Record<string, { synced: number; errors: string[] }>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ integrations: Integration[] }>({
    queryKey: ["/api/integrations"],
  });

  const integrations = data?.integrations ?? [];
  const tiendanubeIntegrations = integrations.filter(i => i.provider === "tiendanube");

  const syncMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      setSyncingId(integrationId);
      const res = await apiRequest("POST", `/api/integrations/${integrationId}/sync-products`);
      return { id: integrationId, result: await res.json() };
    },
    onSuccess: ({ id, result }) => {
      setSyncResults(prev => ({ ...prev, [id]: result }));
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    },
    onSettled: () => {
      setSyncingId(null);
    },
  });

  const handleConnect = () => {
    window.location.href = "/auth/tiendanube/start";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <div className="pt-28 pb-20 px-4 md:px-8 max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-10"
        >
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-widest uppercase text-accent bg-foreground inline-block px-2 py-0.5 rounded">
              Integraciones
            </p>
            <h1 className="text-4xl font-display font-bold tracking-tight">
              Conectá tu tienda
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Conectá tu catálogo de Tiendanube para que tus productos aparezcan en DREVO con búsqueda semántica AI.
            </p>
          </div>

          {justConnected && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-foreground border border-accent/30 rounded-xl px-4 py-3"
            >
              <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
              <span className="text-sm text-accent">
                ¡Tienda {connectedStoreId ? `(ID: ${connectedStoreId})` : ""} conectada exitosamente! Ahora podés sincronizar tus productos.
              </span>
            </motion.div>
          )}
          {connectionError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 space-y-1"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-sm font-medium text-red-400">
                  Error al conectar: <code className="font-mono text-xs">{connectionError}</code>
                </span>
              </div>
              {errorDetail && (
                <p className="text-xs text-red-400/70 font-mono pl-7 break-all">
                  {decodeURIComponent(errorDetail)}
                </p>
              )}
              <p className="text-xs text-red-400/70 pl-7">
                Revisá que la URL de callback en el DevHub de Tiendanube sea exactamente: <br/>
                <code className="font-mono">{window.location.origin}/auth/tiendanube/callback</code>
              </p>
            </motion.div>
          )}

          {tiendanubeIntegrations.length > 0 && tiendanubeIntegrations.map((integration) => (
            <div key={integration.id} className="border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00aeef]/10 flex items-center justify-center">
                    <Store className="w-5 h-5 text-[#00aeef]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Tiendanube</p>
                    <p className="text-xs text-muted-foreground">Store ID: <span className="text-foreground font-mono">{integration.storeId}</span></p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-foreground px-3 py-1 rounded-full border border-accent/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                  Conectado
                </span>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => syncMutation.mutate(integration.id)}
                    disabled={syncingId !== null}
                    data-testid={`button-sync-${integration.storeId}`}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-foreground border border-accent/40 text-accent text-sm font-semibold hover:bg-foreground/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncingId === integration.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {syncingId === integration.id ? "Sincronizando..." : "Sincronizar productos"}
                  </button>
                </div>

                {syncResults[integration.id] && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 rounded-xl bg-card border border-border px-4 py-3 space-y-1"
                  >
                    <p className="text-sm font-medium text-foreground">Sincronización completada</p>
                    <p className="text-xs text-muted-foreground">
                      {syncResults[integration.id].synced} producto{syncResults[integration.id].synced !== 1 ? "s" : ""} importado{syncResults[integration.id].synced !== 1 ? "s" : ""}
                      {syncResults[integration.id].errors.length > 0 && ` · ${syncResults[integration.id].errors.length} errores`}
                    </p>
                  </motion.div>
                )}
              </div>
            </div>
          ))}

          {tiendanubeIntegrations.length === 0 && !isLoading && (
            <div className="border border-border rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#00aeef]/10 flex items-center justify-center">
                    <Store className="w-5 h-5 text-[#00aeef]" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Tiendanube</p>
                    <p className="text-xs text-muted-foreground">Nuvemshop · Argentina</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-card px-3 py-1 rounded-full border border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                  No conectado
                </span>
              </div>
              <div className="px-6 py-5">
                <button
                  onClick={handleConnect}
                  data-testid="button-connect-tiendanube"
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold hover:bg-neutral-200 transition-colors"
                >
                  <Plug className="w-4 h-4" />
                  Conectar Tiendanube
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleConnect}
            data-testid="button-add-store"
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-dashed border-border text-muted-foreground text-sm font-medium hover:border-border hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4" />
            Conectar otra tienda de Tiendanube
          </button>

          <div className="text-xs text-muted-foreground space-y-1 leading-relaxed">
            <p>Al conectar tu tienda, DREVO importa tu catálogo y genera embeddings semánticos para cada producto.</p>
            <p>La sincronización es idempotente: podés ejecutarla varias veces sin duplicar productos.</p>
            <p>Para conectar otra tienda, asegurate de cerrar sesión en Tiendanube primero, o usá una ventana de incógnito.</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
