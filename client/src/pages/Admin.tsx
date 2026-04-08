import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Mail, Package, Store, Search, MousePointerClick,
  DollarSign, TrendingUp, Activity, Clock, ShoppingBag,
  Zap, Eye, ChevronDown, ArrowUpRight, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";

const ADMIN_KEY_STORAGE = "drevo_admin_key";

function useAdminQuery<T>(endpoint: string, enabled = true): { data: T | null; isLoading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const key = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (!key) { setIsLoading(false); return; }

    fetch(endpoint, { headers: { "x-admin-key": key } })
      .then(r => {
        if (!r.ok) throw new Error(r.status === 401 ? "unauthorized" : "Error");
        return r.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [endpoint, enabled]);

  return { data, isLoading, error };
}

// ─── Login Screen ───

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/internal/overview", { headers: { "x-admin-key": key } });
      if (res.ok) {
        sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
        onLogin();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-[#C8FF00]/10 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7 text-[#C8FF00]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DREVO Admin</h1>
          <p className="text-sm text-neutral-500">Panel interno de analytics</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setError(false); }}
            placeholder="Admin key"
            className={cn(
              "w-full h-12 px-4 rounded-xl bg-[#1A1A1A] border text-white text-sm placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]/50",
              error ? "border-red-500" : "border-neutral-800"
            )}
          />
          {error && <p className="text-red-400 text-xs">Clave incorrecta</p>}
          <button
            type="submit"
            className="w-full h-12 rounded-xl bg-[#C8FF00] text-black font-semibold text-sm hover:bg-[#C8FF00]/80 transition-colors"
          >
            Entrar
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─── Stat Cards ───

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: any; label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 space-y-3",
      accent ? "border-[#C8FF00]/30 bg-[#C8FF00]/5" : "border-neutral-800 bg-[#1A1A1A]"
    )}>
      <div className="flex items-center gap-2">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accent ? "bg-[#C8FF00]/20" : "bg-neutral-700/50")}>
          <Icon className={cn("w-4 h-4", accent ? "text-[#C8FF00]" : "text-neutral-400")} />
        </div>
        <span className="text-xs text-neutral-500 font-medium">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        {sub && <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Tabs ───

type Tab = "overview" | "waitlist" | "users" | "costs" | "searches" | "brands";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: Activity },
    { id: "users", label: "Usuarios", icon: Users },
    { id: "waitlist", label: "Waitlist", icon: Mail },
    { id: "costs", label: "Costos API", icon: DollarSign },
    { id: "searches", label: "Busquedas", icon: Search },
    { id: "brands", label: "Marcas", icon: Store },
  ];

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
            active === t.id
              ? "bg-[#C8FF00] text-black"
              : "text-neutral-400 hover:text-white hover:bg-neutral-800"
          )}
        >
          <t.icon className="w-3.5 h-3.5" />
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Overview Tab ───

function OverviewTab() {
  const { data, isLoading } = useAdminQuery<any>("/api/internal/overview");

  if (isLoading || !data) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Usuarios" value={data.users.total} sub={`+${data.users.last24h} hoy · +${data.users.last7d} esta semana`} accent />
        <StatCard icon={Mail} label="Waitlist" value={data.waitlist.total} />
        <StatCard icon={Package} label="Productos" value={data.products.active} sub={`${data.products.total} total`} />
        <StatCard icon={Store} label="Marcas" value={data.brands.total} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Search} label="Busquedas" value={data.searches.total} sub={`+${data.searches.last24h} hoy`} />
        <StatCard icon={MousePointerClick} label="Clicks" value={data.clicks.total} sub={`+${data.clicks.last24h} hoy`} />
        <StatCard icon={ShoppingBag} label="Ordenes" value={data.orders.total} />
        <StatCard icon={DollarSign} label="Revenue" value={`$${data.orders.revenue}`} sub="ARS" accent />
      </div>
    </div>
  );
}

// ─── Waitlist Tab ───

function WaitlistTab() {
  const { data, isLoading } = useAdminQuery<any[]>("/api/internal/waitlist");

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">{data?.length || 0} emails en waitlist</h2>
        <button
          onClick={() => {
            if (!data) return;
            const csv = "email,source,date\n" + data.map((e: any) => `${e.email},${e.source},${e.created_at}`).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "drevo_waitlist.csv"; a.click();
          }}
          className="text-xs text-[#C8FF00] hover:underline"
        >
          Exportar CSV
        </button>
      </div>
      <div className="rounded-xl border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#1A1A1A]">
            <tr>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Email</th>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Fuente</th>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data?.map((entry: any) => (
              <tr key={entry.id} className="hover:bg-neutral-800/50">
                <td className="px-4 py-3 text-white">{entry.email}</td>
                <td className="px-4 py-3 text-neutral-400">{entry.source}</td>
                <td className="px-4 py-3 text-neutral-500">{new Date(entry.created_at).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Users Tab ───

function UsersTab() {
  const { data, isLoading } = useAdminQuery<any[]>("/api/internal/users");

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">{data?.length || 0} usuarios registrados</h2>
      <div className="rounded-xl border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-[#1A1A1A]">
            <tr>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Usuario</th>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Auth</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Style Passport</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Busquedas</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Clicks</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Guardados</th>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data?.map((u: any) => (
              <tr key={u.id} className="hover:bg-neutral-800/50">
                <td className="px-4 py-3">
                  <p className="text-white text-sm">{u.display_name || "Sin nombre"}</p>
                  <p className="text-neutral-500 text-xs">{u.email}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", u.is_google ? "bg-blue-500/10 text-blue-400" : "bg-neutral-700 text-neutral-300")}>
                    {u.is_google ? "Google" : "Email"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {u.style_passport_completed ? (
                    <span className="text-[#C8FF00] text-xs">Completado</span>
                  ) : (
                    <span className="text-neutral-600 text-xs">No</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center text-neutral-300">{u.search_count}</td>
                <td className="px-4 py-3 text-center text-neutral-300">{u.click_count}</td>
                <td className="px-4 py-3 text-center text-neutral-300">{u.saved_count}</td>
                <td className="px-4 py-3 text-neutral-500 text-xs">{new Date(u.created_at).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Costs Tab ───

function CostsTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useAdminQuery<any>(`/api/internal/costs?days=${days}`);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Costos de APIs</h2>
        <div className="flex gap-2">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                days === d ? "bg-[#C8FF00] text-black" : "bg-neutral-800 text-neutral-400 hover:text-white"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon={DollarSign} label={`Costo total (${days}d)`} value={`$${data.summary.totalCostUsd}`} sub="USD" accent />
            <StatCard icon={Zap} label="Tokens usados" value={data.summary.totalTokens.toLocaleString()} />
            <StatCard icon={Activity} label="Llamadas API" value={data.summary.totalCalls} />
          </div>

          {data.byService.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="px-4 py-3 bg-[#1A1A1A]">
                <h3 className="text-sm font-medium text-white">Por servicio</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#1A1A1A]/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-neutral-500 font-medium">Servicio</th>
                    <th className="text-left px-4 py-2 text-neutral-500 font-medium">Modelo</th>
                    <th className="text-right px-4 py-2 text-neutral-500 font-medium">Llamadas</th>
                    <th className="text-right px-4 py-2 text-neutral-500 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 text-neutral-500 font-medium">Costo USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {data.byService.map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-neutral-800/50">
                      <td className="px-4 py-2 text-white">{s.service}</td>
                      <td className="px-4 py-2 text-neutral-400 text-xs font-mono">{s.model || "—"}</td>
                      <td className="px-4 py-2 text-right text-neutral-300">{s.calls}</td>
                      <td className="px-4 py-2 text-right text-neutral-300">{s.tokens.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-[#C8FF00] font-medium">${s.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.byEndpoint.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="px-4 py-3 bg-[#1A1A1A]">
                <h3 className="text-sm font-medium text-white">Por endpoint</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-[#1A1A1A]/50">
                  <tr>
                    <th className="text-left px-4 py-2 text-neutral-500 font-medium">Endpoint</th>
                    <th className="text-right px-4 py-2 text-neutral-500 font-medium">Llamadas</th>
                    <th className="text-right px-4 py-2 text-neutral-500 font-medium">Costo USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {data.byEndpoint.map((e: any, i: number) => (
                    <tr key={i} className="hover:bg-neutral-800/50">
                      <td className="px-4 py-2 text-white font-mono text-xs">{e.endpoint || "—"}</td>
                      <td className="px-4 py-2 text-right text-neutral-300">{e.calls}</td>
                      <td className="px-4 py-2 text-right text-[#C8FF00] font-medium">${e.cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.byDay.length > 0 && (
            <div className="rounded-xl border border-neutral-800 p-5 space-y-3">
              <h3 className="text-sm font-medium text-white">Costo diario</h3>
              <div className="flex items-end gap-[2px] h-24">
                {data.byDay.map((d: any, i: number) => {
                  const maxCost = Math.max(...data.byDay.map((x: any) => parseFloat(x.cost)), 0.001);
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-[#C8FF00]/60 rounded-t-sm hover:bg-[#C8FF00] transition-colors"
                      style={{ height: `${Math.max((parseFloat(d.cost) / maxCost) * 100, 2)}%` }}
                      title={`${d.date}: $${d.cost} USD (${d.calls} calls)`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {data.summary.totalCalls === 0 && (
            <div className="text-center py-12 text-neutral-500">
              <Zap className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p>No hay datos de costos todavia.</p>
              <p className="text-xs mt-1">Los costos se empiezan a trackear a partir de ahora.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Searches Tab ───

function SearchesTab() {
  const { data, isLoading } = useAdminQuery<any[]>("/api/internal/searches");

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">Ultimas 100 busquedas</h2>
      <div className="space-y-2">
        {data?.map((s: any) => (
          <div key={s.id} className="rounded-xl border border-neutral-800 bg-[#1A1A1A] p-4 space-y-2">
            <div className="flex items-start justify-between">
              <p className="text-white font-medium">"{s.query_text}"</p>
              <span className="text-xs text-neutral-500 whitespace-nowrap ml-4">
                {new Date(s.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {s.user_email && (
              <p className="text-xs text-neutral-500">{s.user_email}</p>
            )}
            {s.parsed_intent && (
              <div className="flex flex-wrap gap-1.5">
                {s.parsed_intent.occasion && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">{s.parsed_intent.occasion}</span>
                )}
                {s.parsed_intent.style_tags?.map((t: string) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">{t}</span>
                ))}
                {s.parsed_intent.colors?.primary?.map((c: string) => (
                  <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">{c}</span>
                ))}
                {s.parsed_intent.gender && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">{s.parsed_intent.gender}</span>
                )}
              </div>
            )}
          </div>
        ))}
        {(!data || data.length === 0) && (
          <div className="text-center py-12 text-neutral-500">
            <Search className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>No hay busquedas registradas.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Brands Tab ───

function BrandsTab() {
  const { data, isLoading } = useAdminQuery<any[]>("/api/internal/brands");

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-white">{data?.length || 0} marcas</h2>
      <div className="rounded-xl border border-neutral-800 overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead className="bg-[#1A1A1A]">
            <tr>
              <th className="text-left px-4 py-3 text-neutral-500 font-medium">Marca</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Tipo</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Productos</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">Clicks</th>
              <th className="text-center px-4 py-3 text-neutral-500 font-medium">CPC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {data?.map((b: any) => (
              <tr key={b.id} className="hover:bg-neutral-800/50">
                <td className="px-4 py-3">
                  <p className="text-white">{b.name}</p>
                  <p className="text-neutral-600 text-xs">{b.slug}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full",
                    b.is_connected ? "bg-[#C8FF00]/10 text-[#C8FF00]" : "bg-neutral-700 text-neutral-400"
                  )}>
                    {b.is_connected ? "Conectada" : "Scraped"}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-neutral-300">{b.product_count}</td>
                <td className="px-4 py-3 text-center text-neutral-300">{b.click_count}</td>
                <td className="px-4 py-3 text-center text-neutral-400">
                  {parseFloat(b.cpc_rate) > 0 ? `$${b.cpc_rate}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Loading ───

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#C8FF00] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Main ───

export default function Admin() {
  const [authed, setAuthed] = useState(!!sessionStorage.getItem(ADMIN_KEY_STORAGE));
  const [tab, setTab] = useState<Tab>("overview");

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium tracking-widest uppercase text-[#C8FF00] bg-[#C8FF00]/10 inline-block px-2 py-0.5 rounded">
              Internal
            </p>
            <h1 className="text-3xl font-bold tracking-tight">DREVO Admin</h1>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem(ADMIN_KEY_STORAGE); setAuthed(false); }}
            className="text-xs text-neutral-500 hover:text-white transition-colors"
          >
            Cerrar sesion
          </button>
        </div>

        {/* Tabs */}
        <TabBar active={tab} onChange={setTab} />

        {/* Content */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && <OverviewTab />}
          {tab === "waitlist" && <WaitlistTab />}
          {tab === "users" && <UsersTab />}
          {tab === "costs" && <CostsTab />}
          {tab === "searches" && <SearchesTab />}
          {tab === "brands" && <BrandsTab />}
        </motion.div>
      </div>
    </div>
  );
}
