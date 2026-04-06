import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  CheckCircle, XCircle, Clock, Package, Truck, MapPin,
  ChevronRight, ShoppingBag, Loader2,
} from "lucide-react";

interface OrderData {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: string;
  total: string;
  commissionTotal: string;
  shippingAddress: any;
  createdAt: string;
  items: Array<{
    id: string;
    title: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    imageUrl: string;
  }>;
  brandOrders: Array<{
    id: string;
    brandName: string;
    status: string;
    subtotal: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
  }>;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pendiente", color: "text-yellow-400", icon: Clock },
  paid: { label: "Pagado", color: "text-[#C8FF00]", icon: CheckCircle },
  processing: { label: "En proceso", color: "text-blue-400", icon: Package },
  shipped: { label: "Enviado", color: "text-purple-400", icon: Truck },
  delivered: { label: "Entregado", color: "text-green-400", icon: CheckCircle },
  cancelled: { label: "Cancelado", color: "text-red-400", icon: XCircle },
};

const BRAND_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Preparando", color: "text-yellow-400" },
  created: { label: "Orden enviada a la marca", color: "text-blue-400" },
  packed: { label: "Empaquetado", color: "text-purple-400" },
  shipped: { label: "Enviado", color: "text-[#C8FF00]" },
  delivered: { label: "Entregado", color: "text-green-400" },
  cancelled: { label: "Cancelado", color: "text-red-400" },
};

export default function Order() {
  const [, params] = useRoute("/order/:id");
  const orderId = params?.id || "";
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const urlParams = new URLSearchParams(window.location.search);
  const paymentStatus = urlParams.get("status");

  useEffect(() => {
    if (paymentStatus === "success") {
      const pendingOrder = sessionStorage.getItem("drevo_pending_order");
      if (pendingOrder) {
        const cartKeys = Object.keys(localStorage).filter(k => k.startsWith("drevo_cart"));
        cartKeys.forEach(k => localStorage.removeItem(k));
        sessionStorage.removeItem("drevo_pending_order");
      }
    }
  }, [paymentStatus]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/auth");
      return;
    }
    if (!orderId) return;

    fetch(`/api/orders/${orderId}`)
      .then(r => {
        if (!r.ok) throw new Error("Order not found");
        return r.json();
      })
      .then(data => {
        setOrder(data);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [orderId, isAuthenticated]);

  const formatPrice = (p: string | number) => `$${Number(p).toLocaleString("es-AR")}`;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#C8FF00] animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navigation />
        <div className="pt-32 px-4 text-center space-y-4">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <p className="text-lg">No se encontró la orden</p>
          <Link href="/search">
            <span className="text-[#C8FF00] hover:underline cursor-pointer">Volver a explorar</span>
          </Link>
        </div>
      </div>
    );
  }

  const status = STATUS_MAP[order.status] || STATUS_MAP.pending;
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
        {/* Success/Status Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          {paymentStatus === "success" || order.paymentStatus === "approved" ? (
            <>
              <div className="w-16 h-16 bg-[#C8FF00]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-[#C8FF00]" />
              </div>
              <h1 className="text-3xl font-display font-bold">Pedido confirmado</h1>
              <p className="text-muted-foreground mt-2">Gracias por tu compra en DREVO</p>
            </>
          ) : paymentStatus === "failure" ? (
            <>
              <div className="w-16 h-16 bg-red-400/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-3xl font-display font-bold">Pago rechazado</h1>
              <p className="text-muted-foreground mt-2">Hubo un problema con tu pago. Podés intentar de nuevo.</p>
            </>
          ) : (
            <>
              <div className={`w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4`}>
                <StatusIcon className={`w-8 h-8 ${status.color}`} />
              </div>
              <h1 className="text-3xl font-display font-bold">Pedido #{order.orderNumber}</h1>
              <p className={`mt-2 font-medium ${status.color}`}>{status.label}</p>
            </>
          )}
        </motion.div>

        {/* Order Info */}
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Número de orden</p>
                <p className="font-mono text-lg font-bold">{order.orderNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{formatPrice(order.total)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(order.createdAt).toLocaleDateString("es-AR", {
                weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          </div>

          {/* Brand Orders — tracking per brand */}
          {order.brandOrders.map(bo => {
            const boStatus = BRAND_STATUS_MAP[bo.status] || BRAND_STATUS_MAP.pending;
            return (
              <div key={bo.id} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-card px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{bo.brandName}</span>
                  </div>
                  <span className={`text-xs font-medium ${boStatus.color}`}>{boStatus.label}</span>
                </div>
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">Subtotal: {formatPrice(bo.subtotal)}</p>
                  {bo.trackingNumber && (
                    <div className="mt-2 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-[#C8FF00]" />
                      {bo.trackingUrl ? (
                        <a href={bo.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#C8FF00] hover:underline">
                          Seguir envío: {bo.trackingNumber}
                        </a>
                      ) : (
                        <span className="text-sm text-muted-foreground">Tracking: {bo.trackingNumber}</span>
                      )}
                    </div>
                  )}
                </div>
                {/* Items for this brand */}
                <div className="border-t border-border divide-y divide-border">
                  {order.items
                    .filter(item => {
                      // Match items to brand orders (simplified — show all if single brand)
                      return true;
                    })
                    .map(item => (
                      <div key={item.id} className="flex gap-3 p-3">
                        <div className="w-12 h-16 bg-card rounded overflow-hidden flex-shrink-0">
                          {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{item.title}</p>
                          <p className="text-xs text-muted-foreground">Talle: {item.sizeLabel} — x{item.quantity}</p>
                        </div>
                        <p className="text-sm font-medium">{formatPrice(item.totalPrice)}</p>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="p-4 border border-border rounded-lg">
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4" /> Dirección de envío
              </p>
              <div className="text-sm text-muted-foreground">
                <p>{order.shippingAddress.fullName}</p>
                <p>{order.shippingAddress.street} {order.shippingAddress.streetNumber}{order.shippingAddress.floor ? `, ${order.shippingAddress.floor}` : ""}</p>
                <p>{order.shippingAddress.city}, {order.shippingAddress.province} — CP {order.shippingAddress.postalCode}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Link href="/search" className="flex-1">
              <span className="w-full py-3 bg-[#C8FF00] text-black font-bold rounded-xl hover:bg-[#A3D600] transition-colors flex items-center justify-center gap-2 cursor-pointer">
                Seguir comprando <ChevronRight className="w-4 h-4" />
              </span>
            </Link>
            <Link href="/profile" className="flex-1">
              <span className="w-full py-3 border border-border rounded-xl text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2 cursor-pointer">
                <ShoppingBag className="w-4 h-4" /> Mis pedidos
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
