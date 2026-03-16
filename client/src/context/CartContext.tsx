import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface CartItem {
  id: string;
  title: string;
  basePrice: number;
  salePrice: number | null;
  currency: string;
  imageUrl: string;
  brand: string;
  sizeLabel: string;
  quantity: number;
  externalUrl: string | null;
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

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = (item: Omit<CartItem, "quantity">) => {
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
  };

  const removeItem = (id: string, sizeLabel: string) => {
    setItems((prev) => prev.filter((i) => !(i.id === id && i.sizeLabel === sizeLabel)));
  };

  const updateQuantity = (id: string, sizeLabel: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id, sizeLabel);
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === id && i.sizeLabel === sizeLabel ? { ...i, quantity } : i
      )
    );
  };

  const clearCart = () => setItems([]);

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
