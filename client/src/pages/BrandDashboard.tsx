import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Loader2, TrendingUp, MousePointerClick, ShoppingBag, DollarSign, Search, BarChart3, ArrowUpRight, Plug, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

interface DashboardData {
  hasBrand: boolean;
  brands: { id: string; name: string }[];
  overview: {
    totalProducts: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: string;
    conversionRate: string;
  };
  billing?: {
    totalCpcSpend: string;
    cpcClicks: number;
    cpcLast30d: string;
    cpcRates: Record<string, string>;
  };
  topProducts: { id: string; title: string; clicks: number; conversions: number; imageUrl: string | null }[];
  topQueries: { query: string; clicks: number; conversions: number }[];
  clicksByDay: Record<string, number>;
  integrations: { id: string; provider: string; storeId: string | null; storeName: string | null }[];
}

function StatCard({ icon: Icon, label, value, subtitle, accent }: { icon: any; label: string; value: string | number; subtitle?: string; accent?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 space-y-3",
      accent ? "border-accent/30 bg-accent/5" : "border-border bg-card"
    )}>
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accent ? "bg-accent/20" : "bg-muted-foreground/10")}>
          <Icon className={cn("w-4 h-4", accent ? "text-accent" : "text-muted-foreground")} />
        </div>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function MiniChart({ data }: { data: Record<string, number> }) {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, clicks: data[key] || 0 });
  }
  const maxClicks = Math.max(...days.map(d => d.clicks), 1);

  return (
    <div className="flex items-end gap-[2px] h-16">
      {days.map((day, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/60 rounded-t-sm transition-all hover:bg-accent"
          style={{ height: `${Math.max((day.clicks / maxClicks) * 100, 2)}%` }}
          title={`${day.date}: ${day.clicks} clicks`}
        />
      ))}
    </div>
  );
}

export default function BrandDashboard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/brand/dashboard"],
    enabled: isAuthenticated,
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center pt-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!data?.hasBrand) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="pt-28 pb-20 px-4 md:px-8 max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted-foreground/10 flex items-center justify-center mx-auto">
              <BarChart3 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">Dashboard de Marca</h1>
            <p className="text-muted-foreground">
              Para acceder al dashboard, primero necesitas conectar tu tienda de Tiendanube.
            </p>
            <Link
              href="/connect"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-black text-sm font-semibold hover:bg-accent/80 transition-colors"
            >
              <Plug className="w-4 h-4" />
              Conectar tienda
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <div className="pt-28 pb-20 px-4 md:px-8 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium tracking-widest uppercase text-accent bg-accent/10 inline-block px-2 py-0.5 rounded">
                Dashboard
              </p>
              <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                {data.brands.length === 1 ? data.brands[0].name : "Tus Marcas"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {data.integrations.length} tienda{data.integrations.length !== 1 ? "s" : ""} conectada{data.integrations.length !== 1 ? "s" : ""}
              </p>
            </div>
            <Link
              href="/connect"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Plug className="w-3.5 h-3.5" />
              Gestionar tiendas
            </Link>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={ShoppingBag} label="Productos activos" value={data.overview.totalProducts} />
            <StatCard icon={MousePointerClick} label="Clicks totales" value={data.overview.totalClicks} />
            <StatCard icon={TrendingUp} label="Conversiones" value={data.overview.totalConversions} subtitle={`${data.overview.conversionRate}% tasa`} accent />
            <StatCard icon={DollarSign} label="Revenue" value={`$${data.overview.totalRevenue}`} subtitle="Comisiones generadas" accent />
          </div>

          {/* CPC Billing */}
          {data.billing && parseFloat(data.billing.totalCpcSpend) > 0 && (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-display font-bold text-foreground">Costo por Click (CPC)</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">${data.billing.cpcLast30d}</p>
                  <p className="text-xs text-muted-foreground">Ultimos 30 dias</p>
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">{data.billing.cpcClicks}</p>
                  <p className="text-xs text-muted-foreground">Clicks facturados</p>
                </div>
                <div>
                  <p className="text-2xl font-display font-bold text-foreground">${data.billing.totalCpcSpend}</p>
                  <p className="text-xs text-muted-foreground">Total acumulado</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Cada click de un usuario hacia tu tienda tiene un costo. Tu tarifa actual: ${Object.values(data.billing.cpcRates)[0] || "0"} ARS/click
              </p>
            </div>
          )}

          {/* Clicks Chart */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-display font-bold text-foreground">Clicks ultimos 30 dias</h2>
              <span className="text-xs text-muted-foreground">{data.overview.totalClicks} total</span>
            </div>
            <MiniChart data={data.clicksByDay} />
          </div>

          {/* Two Column Layout */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Top Products */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-display font-bold text-foreground">Productos mas clickeados</h2>
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aun no hay clicks registrados.</p>
              ) : (
                <div className="space-y-3">
                  {data.topProducts.map((product, i) => (
                    <Link
                      key={product.id}
                      href={`/product/${product.id}`}
                      className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted-foreground/5 transition-colors no-underline group"
                    >
                      <span className="text-xs text-muted-foreground w-5 text-right font-mono">{i + 1}</span>
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted-foreground/10 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{product.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.clicks} click{product.clicks !== 1 ? "s" : ""}
                          {product.conversions > 0 && ` · ${product.conversions} conversion${product.conversions !== 1 ? "es" : ""}`}
                        </p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Top Queries */}
            <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
              <h2 className="text-lg font-display font-bold text-foreground">Busquedas que muestran tus productos</h2>
              {data.topQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Aun no hay busquedas registradas.</p>
              ) : (
                <div className="space-y-3">
                  {data.topQueries.map((q, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded-xl"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted-foreground/10 flex items-center justify-center shrink-0">
                        <Search className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">"{q.query}"</p>
                        <p className="text-xs text-muted-foreground">
                          {q.clicks} click{q.clicks !== 1 ? "s" : ""}
                          {q.conversions > 0 && ` · ${q.conversions} conversion${q.conversions !== 1 ? "es" : ""}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Stores */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-lg font-display font-bold text-foreground">Tiendas conectadas</h2>
            <div className="space-y-3">
              {data.integrations.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between p-3 rounded-xl bg-muted-foreground/5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00aeef]/10 flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4 text-[#00aeef]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{integration.storeName || "Tiendanube"}</p>
                      <p className="text-xs text-muted-foreground">Store ID: {integration.storeId}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 px-2.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                    Conectada
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
