import { Navigation } from "@/components/Navigation";
import { Link } from "wouter";
import { useCart } from "@/context/CartContext";
import { ShoppingBag, ArrowRight, Trash2, Plus, Minus, ExternalLink, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { trackClick } from "@/hooks/useClickTracker";

export default function Cart() {
  const { items, removeItem, updateQuantity, clearCart, totalItems, totalPrice } = useCart();

  const formatPrice = (p: number) => `$${p.toLocaleString("es-AR")}`;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navigation />
        <div className="pt-32 px-4 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-4">
            <ShoppingBag className="w-10 h-10 text-neutral-400" />
          </div>
          <h1 className="text-3xl font-display font-bold" data-testid="text-cart-empty">Tu carrito está vacío</h1>
          <p className="text-neutral-400 max-w-md">
            Parece que todavía no agregaste nada. Explorá nuestra colección curada por IA para encontrar tu próximo look.
          </p>
          <Link href="/search">
            <span className="mt-8 px-8 py-3 bg-white text-black font-semibold rounded hover:bg-neutral-200 transition-colors inline-flex items-center gap-2 cursor-pointer" data-testid="link-explore-products">
              Explorar Productos <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />

      <div className="pt-24 pb-20 px-4 md:px-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-3xl font-display font-bold" data-testid="text-cart-title">
            Tu Carrito <span className="text-neutral-500 text-xl font-normal">({totalItems} {totalItems === 1 ? "item" : "items"})</span>
          </h1>
          <button
            onClick={clearCart}
            className="text-sm text-neutral-500 hover:text-red-400 transition-colors"
            data-testid="button-clear-cart"
          >
            Vaciar carrito
          </button>
        </div>

        <div className="space-y-6">
          <AnimatePresence>
            {items.map((item) => {
              const price = item.salePrice || item.basePrice;
              const itemKey = `${item.id}-${item.sizeLabel}`;
              return (
                <motion.div
                  key={itemKey}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="flex gap-5 border border-white/10 rounded-lg p-4 bg-white/[0.02]"
                  data-testid={`cart-item-${item.id}`}
                >
                  <Link href={`/product/${item.id}`}>
                    <div className="w-24 h-32 bg-neutral-900 rounded overflow-hidden flex-shrink-0 cursor-pointer">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-600">
                          <ShoppingBag className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <p className="text-xs text-neutral-500 uppercase tracking-wide">{item.brand}</p>
                      <Link href={`/product/${item.id}`}>
                        <h3 className="font-semibold text-lg truncate hover:underline cursor-pointer" data-testid={`text-cart-item-title-${item.id}`}>
                          {item.title}
                        </h3>
                      </Link>
                      <p className="text-sm text-neutral-400 mt-1">Talle: {item.sizeLabel}</p>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(item.id, item.sizeLabel, item.quantity - 1)}
                          className="w-8 h-8 border border-white/20 rounded flex items-center justify-center hover:border-white transition-colors"
                          data-testid={`button-decrease-${item.id}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-sm font-medium w-6 text-center" data-testid={`text-quantity-${item.id}`}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.sizeLabel, item.quantity + 1)}
                          className="w-8 h-8 border border-white/20 rounded flex items-center justify-center hover:border-white transition-colors"
                          data-testid={`button-increase-${item.id}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="flex items-center gap-4">
                        <p className="font-semibold text-lg" data-testid={`text-cart-item-price-${item.id}`}>
                          {formatPrice(price * item.quantity)}
                        </p>
                        <button
                          onClick={() => removeItem(item.id, item.sizeLabel)}
                          className="text-neutral-500 hover:text-red-400 transition-colors"
                          data-testid={`button-remove-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {item.externalUrl && (
                      <a
                        href={item.externalUrl}
                        onClick={async (e) => {
                          e.preventDefault();
                          const referralUrl = await trackClick(item.id);
                          window.open(referralUrl || item.externalUrl!, "_blank", "noopener,noreferrer");
                        }}
                        className="text-xs text-neutral-500 hover:text-white transition-colors mt-2 inline-flex items-center gap-1 self-start cursor-pointer"
                        data-testid={`link-external-${item.id}`}
                      >
                        Comprar en tienda oficial <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="mt-10 border-t border-white/10 pt-8 space-y-6">
          <div className="flex justify-between items-center text-lg">
            <span className="text-neutral-300">Subtotal</span>
            <span className="font-bold text-2xl" data-testid="text-cart-total">{formatPrice(totalPrice)}</span>
          </div>
          <p className="text-xs text-neutral-500">Impuestos y costos de envío se calculan al finalizar la compra.</p>

          <div className="space-y-3">
            <Link href="/checkout">
              <span className="w-full h-14 bg-[#C8FF00] text-black rounded-xl font-bold text-lg hover:bg-[#A3D600] transition-colors flex items-center justify-center gap-2 cursor-pointer" data-testid="link-checkout">
                <CreditCard className="w-5 h-5" />
                Finalizar compra
              </span>
            </Link>

            <Link href="/search">
              <span className="w-full h-12 border border-white/20 rounded font-medium text-sm text-neutral-300 hover:text-white hover:border-white transition-all flex items-center justify-center gap-2 cursor-pointer" data-testid="link-continue-shopping">
                Seguir comprando <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
