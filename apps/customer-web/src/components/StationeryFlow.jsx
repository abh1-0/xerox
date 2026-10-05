import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { money } from "./BrandMark";

export function StationeryFlow({ shop, onBack, onGoToCart }) {
  const { addItem } = useCart();
  const [quantities, setQuantities] = useState({});
  const [justAddedId, setJustAddedId] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const products = shop.products || [
    {
      id: "prod-nb-01",
      name: "Classmate Long Notebook (160 Pages)",
      description: "Ruled, smooth white paper, wire-stitched binding",
      category: "Notebooks",
      priceMinor: 6500,
      inventoryCount: 45,
      badge: "Student Favorite",
    },
    {
      id: "prod-pen-01",
      name: "Reynolds 045 Fine Ballpoint Pen (Blue)",
      description: "Precision 0.7mm tip, non-smudge ink",
      category: "Pens",
      priceMinor: 1000,
      inventoryCount: 150,
      badge: "Top Seller",
    },
    {
      id: "prod-hl-01",
      name: "Camlin Fluorescent Highlighter Set",
      description: "Pack of 5 vibrant colors with chisel tip",
      category: "Markers",
      priceMinor: 12000,
      inventoryCount: 18,
      badge: "Exam Kit",
    },
    {
      id: "prod-adh-01",
      name: "Fevicol MR Adhesive Squeeze Bottle (50g)",
      description: "Strong paper craft bonding adhesive",
      category: "Adhesives",
      priceMinor: 2500,
      inventoryCount: 30,
      badge: "Photo Glue",
    },
  ];

  const categories = ["ALL", ...new Set(products.map((p) => p.category || "General"))];

  const filteredProducts =
    selectedCategory === "ALL"
      ? products
      : products.filter((p) => (p.category || "General") === selectedCategory);

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

      {/* Category Filter Pills */}
      <div className="category-filter-bar">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`filter-pill ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="stationery-grid">
        {filteredProducts.map((item) => {
          const qty = getQty(item.id);
          const isOutOfStock = (item.inventoryCount ?? 99) <= 0;
          const isLowStock = !isOutOfStock && (item.inventoryCount ?? 99) <= 5;
          const wasJustAdded = justAddedId === item.id;

          return (
            <div key={item.id} className="product-card premier-card">
              <div className="product-card-body">
                <div className="product-top-row">
                  <span className="category-tag">{item.category || "General"}</span>
                  {item.badge && <span className="product-highlight-badge">{item.badge}</span>}
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
                    onClick={() => setQty(item.id, -1)}
                    disabled={isOutOfStock}
                    aria-label="Decrease quantity"
                  >
                    <Minus size={14} />
                  </button>
                  <span>{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(item.id, 1)}
                    disabled={isOutOfStock}
                    aria-label="Increase quantity"
                  >
                    <Plus size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  className={`primary-action product-add-btn ${wasJustAdded ? "just-added" : ""}`}
                  onClick={() => handleAddToCart(item)}
                  disabled={isOutOfStock}
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
    </div>
  );
}
