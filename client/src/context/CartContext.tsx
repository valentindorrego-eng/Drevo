import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export interface CartItem {
  id: string;
  title: string;
  basePrice: number;
  salePrice: number | null;
  currency: string;
  imageUrl: string;
  brand: string;
  brandId: string | null;
  sizeLabel: string;
  quantity: number;
  externalUrl: string | null;
  variantId?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string, sizeLabel: string) => void;
  updateQuantity: (id: string, sizeLabel: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | null>(null);

const CART_KEY = "drevo_cart";

function cartKey(userId?: string | null): string {
  return userId ? `${CART_KEY}_${userId}` : CART_KEY;
}

function loadCart(userId?: string | null): CartItem[] {
  try {
    const raw = localStorage.getItem(cartKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function mergeCartItems(existing: CartItem[], incoming: CartItem[]): CartItem[] {
  const merged = [...existing];
  for (const item of incoming) {
    const found = merged.find((i) => i.id === item.id && i.sizeLabel === item.sizeLabel);
    if (found) {
      found.quantity = Math.max(found.quantity, item.quantity);
    } else {
      merged.push(item);
    }
  }
  return merged;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>(() => loadCart());
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id && user.id !== lastUserId) {
      const guestItems = loadCart(null);
      const userItems = loadCart(user.id);
      const merged = mergeCartItems(userItems, guestItems);
      setItems(merged);
      localStorage.setItem(cartKey(user.id), JSON.stringify(merged));
      if (guestItems.length > 0) {
        localStorage.removeItem(CART_KEY);
      }
      setLastUserId(user.id);
    } else if (!user && lastUserId) {
      setItems(loadCart(null));
      setLastUserId(null);
    }
  }, [user?.id, lastUserId]);

  useEffect(() => {
    const key = user?.id ? cartKey(user.id) : CART_KEY;
    localStorage.setItem(key, JSON.stringify(items));
  }, [items, user?.id]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === item.id && i.sizeLabel === item.sizeLabel);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id && i.sizeLabel === item.sizeLabel
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string, sizeLabel: string) => {
    setItems((prev) => prev.filter((i) => !(i.id === id && i.sizeLabel === sizeLabel)));
  }, []);

  const updateQuantity = useCallback((id: string, sizeLabel: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => !(i.id === id && i.sizeLabel === sizeLabel)));
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.sizeLabel === sizeLabel ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce((sum, i) => sum + (i.salePrice || i.basePrice) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
