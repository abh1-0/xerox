import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { money } from "./BrandMark";

export function StationeryFlow({ shop, onBack, onGoToCart }) {
  const { addItem } = useCart();
  const [quantities, setQuantities] = useState({});
  const [justAddedId, setJustAddedId] = useState(null);

  const products = shop.products || [
    {
      id: "prod-nb-01",
      name: "Classmate Long Notebook (160 Pages)",
      description: "Ruled, smooth white paper, wire-stitched binding",
      category: "Notebooks",
      priceMinor: 6500,
      inventoryCount: 45,
    },
    {
      id: "prod-pen-01",
      name: "Reynolds 045 Fine Ballpoint Pen (Blue)",
      description: "Precision 0.7mm tip, non-smudge ink",
      category: "Pens",
      priceMinor: 1000,
      inventoryCount: 150,
    },
    {
      id: "prod-hl-01",
      name: "Camlin Fluorescent Highlighter Set",
      description: "Pack of 5 vibrant colors with chisel tip",
      category: "Markers",
      priceMinor: 12000,
      inventoryCount: 18,
    },
    {
      id: "prod-adh-01",
      name: "Fevicol MR Adhesive Squeeze Bottle (50g)",
      description: "Strong paper craft bonding adhesive",
      category: "Adhesives",
      priceMinor: 2500,
      inventoryCount: 30,
    },
  ];

  function getQty(id) {
    return quantities[id] || 1;
  }

  function setQty(id, delta) {
    setQuantities((prev) => {
      const cur = prev[id] || 1;
      const next = Math.max(1, cur + delta);
      return { ...prev, [id]: next };
    });
  }

  function handleAddToCart(product) {
    const qty = getQty(product.id);
    addItem({
      itemType: "STATIONERY",
      productId: product.id,
      title: product.name,
      quantity: qty,
      unitPriceMinor: product.priceMinor,
      totalPriceMinor: product.priceMinor * qty,
    });
    setJustAddedId(product.id);
    setTimeout(() => {
      setJustAddedId(null);
    }, 2500);
  }

  return (
    <div className="flow stationery-flow-container">
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to {shop.displayName}
      </button>

      <div className="flow-header">
        <div className="service-icon stationery-alt">
          <ShoppingBag size={28} />
        </div>
        <div>
          <h1>Stationery & Supplies</h1>
          <p>Counter stock available for instant pickup with your order.</p>
        </div>
      </div>

      <div className="stationery-grid">
        {products.map((item) => {
          const qty = getQty(item.id);
          const isOutOfStock = (item.inventoryCount ?? 99) <= 0;
          const isLowStock = !isOutOfStock && (item.inventoryCount ?? 99) <= 5;
          const wasJustAdded = justAddedId === item.id;

          return (
            <div key={item.id} className="product-card">
              <div className="product-card-body">
                <div className="product-top-row">
                  <span className="category-tag">{item.category || "General"}</span>
                  {isOutOfStock ? (
                    <span className="stock-tag oos">Out of Stock</span>
                  ) : isLowStock ? (
                    <span className="stock-tag low">Only {item.inventoryCount} left</span>
                  ) : (
                    <span className="stock-tag in">In Stock</span>
                  )}
                </div>
                <h4>{item.name}</h4>
                <p className="product-desc">{item.description}</p>
                <div className="product-price">
                  <strong>{money(item.priceMinor, shop.currency)}</strong>
                </div>
              </div>

              <div className="product-card-actions">
                <div className="qty-control">
                  <button
                    type="button"
                    className="qty-btn"
                    disabled={qty <= 1 || isOutOfStock}
                    onClick={() => setQty(item.id, -1)}
                    aria-label="Decrease quantity"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="qty-val">{qty}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    disabled={isOutOfStock}
                    onClick={() => setQty(item.id, 1)}
                    aria-label="Increase quantity"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  className={`primary-action add-prod-btn ${wasJustAdded ? "success-state" : ""}`}
                  disabled={isOutOfStock}
                  onClick={() => handleAddToCart(item)}
                >
                  {wasJustAdded ? (
                    <>
                      <CheckCircle2 size={16} /> Added!
                    </>
                  ) : (
                    <>
                      <Plus size={16} /> Add ({money(item.priceMinor * qty, shop.currency)})
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cart-jump-footer">
        <button
          type="button"
          className="secondary-action"
          onClick={onBack}
        >
          Return to Store Categories
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={onGoToCart}
        >
          Proceed to Cart & Checkout
        </button>
      </div>
    </div>
  );
}
