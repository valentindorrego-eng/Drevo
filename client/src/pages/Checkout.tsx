import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navigation } from "@/components/Navigation";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  MapPin, CreditCard, ChevronRight, Loader2, ShoppingBag,
  Plus, Check, Truck, Shield,
} from "lucide-react";

interface Address {
  id: string;
  fullName: string;
  phone: string | null;
  street: string;
  streetNumber: string;
  floor: string | null;
  city: string;
  province: string;
  postalCode: string;
}

type Step = "address" | "review" | "processing";

const PROVINCES = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba",
  "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja",
  "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan",
  "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero",
  "Tierra del Fuego", "Tucumán",
];

export default function Checkout() {
  const [, setLocation] = useLocation();
  const { items, totalPrice, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("address");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Address form
  const [form, setForm] = useState({
    fullName: user?.displayName || "",
    phone: "",
    street: "",
    streetNumber: "",
    floor: "",
    city: "",
    province: "",
    postalCode: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/auth?redirect=/checkout");
      return;
    }
    if (items.length === 0) {
      setLocation("/cart");
      return;
    }
    // Load addresses
    fetch("/api/addresses").then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setAddresses(data);
        const defaultAddr = data.find((a: Address) => (a as any).isDefault);
        if (defaultAddr) setSelectedAddressId(defaultAddr.id);
        else if (data.length > 0) setSelectedAddressId(data[0].id);
        else setShowAddressForm(true);
      }
    }).catch(() => {});
  }, [isAuthenticated, items.length]);

  // Group items by brand for display
  const brandGroups = items.reduce((acc, item) => {
    const key = item.brand || "DREVO";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, typeof items>);

  const formatPrice = (p: number) => `$${p.toLocaleString("es-AR")}`;

  const handleSaveAddress = async () => {
    if (!form.fullName || !form.street || !form.streetNumber || !form.city || !form.province || !form.postalCode) {
      setError("Completá todos los campos obligatorios");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, isDefault: true }),
      });
      const addr = await res.json();
      if (res.ok) {
        setAddresses(prev => [...prev, addr]);
        setSelectedAddressId(addr.id);
        setShowAddressForm(false);
      } else {
        setError(addr.message || "Error al guardar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedAddressId) {
      setError("Seleccioná una dirección de envío");
      return;
    }
    setStep("processing");
    setError("");
    try {
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map(i => ({
            id: i.id,
            sizeLabel: i.sizeLabel,
            quantity: i.quantity,
            variantId: i.variantId || null,
            imageUrl: i.imageUrl,
          })),
          addressId: selectedAddressId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error al crear la orden");

      sessionStorage.setItem("drevo_pending_order", data.orderId);

      const redirectUrl = data.paymentUrl || data.sandboxUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }

      clearCart();
      setLocation(`/order/${data.orderId}?status=success`);
    } catch (err: any) {
      setError(err.message || "Error al procesar");
      setStep("review");
    }
  };

  if (items.length === 0 && step !== "processing") {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-5xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {[
            { key: "address", label: "Dirección", icon: MapPin },
            { key: "review", label: "Confirmar", icon: ShoppingBag },
            { key: "processing", label: "Pago", icon: CreditCard },
          ].map((s, i) => {
            const isActive = s.key === step;
            const isPast = (step === "review" && i === 0) || (step === "processing" && i < 2);
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <ChevronRight className="w-4 h-4 text-neutral-600" />}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                  isActive ? "bg-[#C8FF00]/10 text-[#C8FF00] border border-[#C8FF00]/30" :
                  isPast ? "bg-white/5 text-white border border-white/10" :
                  "text-neutral-600 border border-transparent"
                }`}>
                  {isPast ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Step: Address */}
            {step === "address" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#C8FF00]" />
                  Dirección de envío
                </h2>

                {addresses.length > 0 && !showAddressForm && (
                  <div className="space-y-3 mb-4">
                    {addresses.map(addr => (
                      <button
                        key={addr.id}
                        onClick={() => setSelectedAddressId(addr.id)}
                        className={`w-full text-left p-4 rounded-lg border transition-all ${
                          selectedAddressId === addr.id
                            ? "border-[#C8FF00]/30 bg-[#C8FF00]/5"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20"
                        }`}
                      >
                        <p className="font-medium">{addr.fullName}</p>
                        <p className="text-sm text-neutral-400">
                          {addr.street} {addr.streetNumber}{addr.floor ? `, ${addr.floor}` : ""}
                        </p>
                        <p className="text-sm text-neutral-400">
                          {addr.city}, {addr.province} — CP {addr.postalCode}
                        </p>
                        {addr.phone && <p className="text-sm text-neutral-500 mt-1">{addr.phone}</p>}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowAddressForm(true)}
                      className="w-full p-3 border border-dashed border-white/10 rounded-lg text-sm text-neutral-400 hover:text-white hover:border-white/20 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Agregar otra dirección
                    </button>
                  </div>
                )}

                {showAddressForm && (
                  <div className="space-y-4 p-5 bg-white/[0.02] border border-white/10 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-xs text-neutral-500 mb-1">Nombre completo *</label>
                        <input
                          value={form.fullName}
                          onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Calle *</label>
                        <input
                          value={form.street}
                          onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-neutral-500 mb-1">Número *</label>
                          <input
                            value={form.streetNumber}
                            onChange={e => setForm(f => ({ ...f, streetNumber: e.target.value }))}
                            className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-neutral-500 mb-1">Piso/Dpto</label>
                          <input
                            value={form.floor}
                            onChange={e => setForm(f => ({ ...f, floor: e.target.value }))}
                            className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Ciudad *</label>
                        <input
                          value={form.city}
                          onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Provincia *</label>
                        <select
                          value={form.province}
                          onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        >
                          <option value="">Seleccionar...</option>
                          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Código Postal *</label>
                        <input
                          value={form.postalCode}
                          onChange={e => setForm(f => ({ ...f, postalCode: e.target.value }))}
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-neutral-500 mb-1">Teléfono</label>
                        <input
                          value={form.phone}
                          onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                          placeholder="+54 9 ..."
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8FF00]/30"
                        />
                      </div>
                    </div>

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <div className="flex gap-3">
                      <button
                        onClick={handleSaveAddress}
                        disabled={isLoading}
                        className="flex-1 py-3 bg-[#C8FF00] text-black font-bold rounded-lg hover:bg-[#A3D600] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Guardar dirección
                      </button>
                      {addresses.length > 0 && (
                        <button
                          onClick={() => setShowAddressForm(false)}
                          className="px-4 py-3 border border-white/10 rounded-lg text-sm text-neutral-400 hover:text-white transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {selectedAddressId && !showAddressForm && (
                  <button
                    onClick={() => { setStep("review"); setError(""); }}
                    className="w-full py-4 bg-[#C8FF00] text-black font-bold rounded-xl hover:bg-[#A3D600] transition-colors flex items-center justify-center gap-2 text-lg mt-4"
                  >
                    Continuar <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </motion.div>
            )}

            {/* Step: Review */}
            {step === "review" && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-[#C8FF00]" />
                  Revisá tu pedido
                </h2>

                {/* Items grouped by brand */}
                {Object.entries(brandGroups).map(([brand, brandItems]) => (
                  <div key={brand} className="mb-6 border border-white/10 rounded-lg overflow-hidden">
                    <div className="bg-white/[0.03] px-4 py-3 border-b border-white/5 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-neutral-400" />
                      <span className="text-sm font-medium text-neutral-300">Envío de <span className="text-white">{brand}</span></span>
                    </div>
                    <div className="divide-y divide-white/5">
                      {brandItems.map(item => {
                        const price = item.salePrice || item.basePrice;
                        return (
                          <div key={`${item.id}-${item.sizeLabel}`} className="flex gap-4 p-4">
                            <div className="w-16 h-20 bg-neutral-900 rounded overflow-hidden flex-shrink-0">
                              {item.imageUrl && <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.title}</p>
                              <p className="text-xs text-neutral-500 mt-0.5">Talle: {item.sizeLabel} — Cant: {item.quantity}</p>
                            </div>
                            <p className="text-sm font-semibold whitespace-nowrap">{formatPrice(price * item.quantity)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Selected address summary */}
                {selectedAddressId && (
                  <div className="p-4 border border-white/10 rounded-lg mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Dirección de envío
                      </p>
                      <button onClick={() => setStep("address")} className="text-xs text-[#C8FF00] hover:underline">
                        Cambiar
                      </button>
                    </div>
                    {(() => {
                      const addr = addresses.find(a => a.id === selectedAddressId);
                      if (!addr) return null;
                      return (
                        <div className="text-sm text-neutral-400">
                          <p>{addr.fullName}</p>
                          <p>{addr.street} {addr.streetNumber}{addr.floor ? `, ${addr.floor}` : ""}</p>
                          <p>{addr.city}, {addr.province} — CP {addr.postalCode}</p>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("address")}
                    className="px-6 py-4 border border-white/10 rounded-xl text-neutral-400 hover:text-white transition-colors"
                  >
                    Atrás
                  </button>
                  <button
                    onClick={handleCheckout}
                    className="flex-1 py-4 bg-[#C8FF00] text-black font-bold rounded-xl hover:bg-[#A3D600] transition-colors flex items-center justify-center gap-2 text-lg"
                  >
                    <CreditCard className="w-5 h-5" />
                    Pagar {formatPrice(totalPrice)}
                  </button>
                </div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-600">
                  <Shield className="w-3.5 h-3.5" />
                  Pago seguro procesado por MercadoPago
                </div>
              </motion.div>
            )}

            {/* Step: Processing */}
            {step === "processing" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16 space-y-6">
                <Loader2 className="w-12 h-12 text-[#C8FF00] animate-spin mx-auto" />
                <div>
                  <p className="text-xl font-display font-bold">Procesando tu pedido...</p>
                  <p className="text-sm text-neutral-500 mt-2">Te redirigiremos a MercadoPago para completar el pago</p>
                </div>
              </motion.div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          {step !== "processing" && (
            <div className="lg:col-span-1">
              <div className="sticky top-28 bg-white/[0.02] border border-white/10 rounded-lg p-5 space-y-4">
                <h3 className="font-display font-bold text-lg">Resumen</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-neutral-400">
                    <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400">
                    <span>Envío</span>
                    <span className="text-neutral-500">A calcular</span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-4 flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="text-2xl font-bold">{formatPrice(totalPrice)}</span>
                </div>

                <p className="text-[10px] text-neutral-600 leading-tight">
                  Cada marca realiza su propio envío. Podrás recibir múltiples paquetes según las marcas incluidas en tu pedido.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
