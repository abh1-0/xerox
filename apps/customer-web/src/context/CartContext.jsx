import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);

const CART_STORAGE_PREFIX = "sprint.cart.";

export function CartProvider({ storeCode, children }) {
  const storageKey = `${CART_STORAGE_PREFIX}${storeCode || "default"}`;
  
  const [items, setItems] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Ignore local storage errors
    }
  }, [items, storageKey]);

  function addItem(item) {
    setItems((prev) => {
      // If stationery item with same productId already in cart, increment quantity
      if (item.itemType === "STATIONERY" && item.productId) {
        const existingIdx = prev.findIndex(
          (p) => p.itemType === "STATIONERY" && p.productId === item.productId
        );
        if (existingIdx !== -1) {
          const next = [...prev];
          const cur = next[existingIdx];
          const newQty = cur.quantity + (item.quantity || 1);
          next[existingIdx] = {
            ...cur,
            quantity: newQty,
            totalPriceMinor: cur.unitPriceMinor * newQty,
          };
          return next;
        }
      }
      return [...prev, { ...item, id: crypto.randomUUID() }];
    });
    setIsOpen(true);
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function updateQuantity(id, quantity) {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          return {
            ...i,
            quantity,
            totalPriceMinor: (i.unitPriceMinor || 0) * quantity,
          };
        }
        return i;
      })
    );
  }

  function clearCart() {
    setItems([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
  }

  const totalMinor = items.reduce((sum, item) => sum + (item.totalPriceMinor || 0), 0);
  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalMinor,
        itemCount,
        isOpen,
        setIsOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
