import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  Package, Clock, CheckCircle, XCircle, Truck, ChevronRight,
  ShoppingBag, Loader2, ArrowLeft,
} from "lucide-react";

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  total: string;
  currency: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  pending: { label: "Pendiente", color: "text-yellow-400", bgColor: "bg-yellow-400/10", icon: Clock },
  paid: { label: "Pagado", color: "text-accent", bgColor: "bg-foreground", icon: CheckCircle },
  processing: { label: "En proceso", color: "text-blue-400", bgColor: "bg-blue-400/10", icon: Package },
  shipped: { label: "Enviado", color: "text-purple-400", bgColor: "bg-purple-400/10", icon: Truck },
  delivered: { label: "Entregado", color: "text-green-400", bgColor: "bg-green-400/10", icon: CheckCircle },
  cancelled: { label: "Cancelado", color: "text-red-400", bgColor: "bg-red-400/10", icon: XCircle },
};

export default function Orders() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/auth");
      return;
    }
    if (!isAuthenticated) return;

    fetch("/api/orders", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setOrders(Array.isArray(data) ? data : []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [isAuthenticated, authLoading]);

  const formatPrice = (p: string | number) => `$${Number(p).toLocaleString("es-AR")}`;
  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 flex justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-3xl mx-auto">
        <Link href="/profile">
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer" data-testid="link-back-profile">
            <ArrowLeft className="w-4 h-4" /> Mi perfil
          </span>
        </Link>

        <h1 className="text-3xl font-display font-bold mb-8" data-testid="text-orders-title">Mis Compras</h1>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-6">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center">
              <ShoppingBag className="w-10 h-10 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-lg" data-testid="text-no-orders">Todavía no hiciste ninguna compra</p>
            <Link href="/search">
              <span className="px-8 py-3 bg-foreground text-background font-semibold rounded-lg hover:bg-foreground/80 transition-colors cursor-pointer" data-testid="link-explore-orders">
                Explorar productos
              </span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, idx) => {
              const config = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
              const StatusIcon = config.icon;
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Link href={`/order/${order.id}`}>
                    <div
                      className="border border-border rounded-xl p-5 bg-card hover:border-border transition-colors cursor-pointer group"
                      data-testid={`order-card-${order.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center`}>
                            <StatusIcon className={`w-4.5 h-4.5 ${config.color}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-sm" data-testid={`text-order-number-${order.id}`}>
                              #{order.orderNumber}
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className={`text-xs px-2.5 py-1 rounded-full ${config.bgColor} ${config.color} font-medium`}>
                          {config.label}
                        </span>
                        <span className="font-bold text-lg" data-testid={`text-order-total-${order.id}`}>
                          {formatPrice(order.total)}
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
