import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FileText,
  HelpCircle,
  Layers,
  MapPin,
  Paperclip,
  PenTool,
  Printer,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from "lucide-react";
import { BrandMark, money } from "./BrandMark";
import { useCart } from "../context/CartContext";
import { PrintFlow } from "./PrintFlow";
import { ServicesFlow } from "./ServicesFlow";
import { StationeryFlow } from "./StationeryFlow";
import { CartDrawer } from "./CartDrawer";
import { StorePosterModal } from "./StorePosterModal";
import { STORE_PRESETS, SMART_CROSS_SELLS } from "../recommendations";

export function StorePage({
  shop,
  sessionToken,
  initialCategory,
  onNavigate,
}) {
  const [activeCategory, setActiveCategory] = useState(initialCategory || null);
  const [showPoster, setShowPoster] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const { itemCount, totalMinor, setIsOpen, addItem } = useCart();

  const isSuspended = shop.operationalStatus === "SUSPENDED_BY_ABH1";
  const isPaused = shop.operationalStatus === "PAUSED_BY_MERCHANT" || shop.status !== "OPEN";
  const isAccepting = !isSuspended && !isPaused;

  function handleQuickAddCrossSell(cross) {
    if (cross.serviceId) {
      addItem({
        itemType: "SERVICE",
        serviceId: cross.serviceId,
        title: cross.title,
        quantity: 1,
        unitPriceMinor: cross.priceMinor,
        totalPriceMinor: cross.priceMinor,
        notes: "Quick add from store suggestions",
        priceMode: "FIXED",
      });
    } else if (cross.productId) {
      addItem({
        itemType: "STATIONERY",
        productId: cross.productId,
        title: cross.title,
        quantity: 1,
        unitPriceMinor: cross.priceMinor,
        totalPriceMinor: cross.priceMinor,
      });
    }
  }

  return (
    <div className="app-shell store-shell">
      {/* Top Navigation */}
      <header className="topbar">
        <BrandMark onClick={() => onNavigate("/")} />
        <div className="topbar-right">
          <button
            type="button"
            className="icon-action-btn"
            title="View Store QR Poster"
            onClick={() => setShowPoster(true)}
            aria-label="View Store QR"
          >
            <QrCode size={18} />
          </button>
          <span className="shop-chip">
            <MapPin size={15} /> {shop.displayName}
          </span>
        </div>
      </header>

      {/* Operational Status Alerts */}
      {isSuspended && (
        <div className="operational-banner banner-suspended">
          <ShieldAlert size={18} />
          <div>
            <strong>Store Temporarily Suspended</strong>
            <p>This store is currently not accepting submissions on Sprint.</p>
          </div>
        </div>
      )}

      {!isSuspended && isPaused && (
        <div className="operational-banner banner-paused">
          <AlertTriangle size={18} />
          <div>
            <strong>Store Paused by Merchant</strong>
            <p>The merchant has temporarily paused accepting new digital orders.</p>
          </div>
        </div>
      )}

      {/* Main Container */}
      {!activeCategory ? (
        <main className="home store-home-layout">
          {/* Hero Store Profile Banner */}
          <section className="store-hero-card premier-card">
            <div className="store-meta-banner">
              <span className={`availability ${isAccepting ? "avail-open" : "avail-closed"}`}>
                <i />{" "}
                {isAccepting
                  ? "Open now • Accepting Sprint requests"
                  : isSuspended
                  ? "Store suspended"
                  : "Paused by merchant"}
              </span>
              <span className="store-code-pill">
                Code: <strong>{shop.storeCode || shop.slug}</strong>
              </span>
            </div>

            <div className="store-title-row">
              <div>
                <h1 className="store-name">{shop.displayName}</h1>
                <p className="store-address">
                  {shop.address ? `${shop.address}, ${shop.city || ""}` : "Neighborhood document & print center"}
                </p>
              </div>
              <button
                type="button"
                className="secondary-action qr-preview-pill"
                onClick={() => setShowPoster(true)}
              >
                <QrCode size={16} />
                <span>Store QR</span>
              </button>
            </div>

            {/* Quick Service Category Actions */}
            <div className="category-selection-grid">
              <div
                className={`category-hero-card premier-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("print")}
                role="button"
                tabIndex={0}
              >
                <div className="category-card-icon print-bg">
                  <Printer size={28} />
                </div>
                <div className="category-card-text">
                  <div className="category-badge-row">
                    <h3>Print a Document</h3>
                    <span className="badge-pill">Instant Spool</span>
                  </div>
                  <p>Upload PDF or images. B&W (₹2) or color (₹10), duplex & page ranges with transparent totals.</p>
                  <span className="action-tag">Configure Print <ChevronRight size={16} /></span>
                </div>
              </div>

              <div
                className={`category-hero-card premier-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("services")}
                role="button"
                tabIndex={0}
              >
                <div className="category-card-icon service-bg">
                  <FileCheck2 size={28} />
                </div>
                <div className="category-card-text">
                  <div className="category-badge-row">
                    <h3>Document Services</h3>
                    <span className="badge-pill">Shop Handled</span>
                  </div>
                  <p>High-resolution scanning, spiral binding, thermal lamination, and counter quotes.</p>
                  <span className="action-tag">Browse Services <ChevronRight size={16} /></span>
                </div>
              </div>

              <div
                className={`category-hero-card premier-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("stationery")}
                role="button"
                tabIndex={0}
              >
                <div className="category-card-icon stationery-bg">
                  <ShoppingBag size={28} />
                </div>
                <div className="category-card-text">
                  <div className="category-badge-row">
                    <h3>Stationery & Supplies</h3>
                    <span className="badge-pill">Counter Stock</span>
                  </div>
                  <p>Notebooks, pens, adhesives, highlighters and desk essentials in counter stock.</p>
                  <span className="action-tag">Shop Stationery <ChevronRight size={16} /></span>
                </div>
              </div>
            </div>
          </section>

          {/* Contextual Recommendations Rail */}
          {isAccepting && (
            <section className="store-recommendations-rail">
              <div className="rail-header">
                <div className="rail-pill">
                  <Sparkles size={14} /> Recommended for your visit
                </div>
                <h2>Frequently Bundled by Customers</h2>
                <p>One-tap add-ons commonly needed when visiting {shop.displayName}.</p>
              </div>

              <div className="quick-addons-grid">
                {SMART_CROSS_SELLS.map((addon) => (
                  <div key={addon.id} className="quick-addon-card premier-card">
                    <div className="addon-icon-badge">
                      {addon.icon === "BookOpen" && <BookOpen size={20} />}
                      {addon.icon === "ShieldCheck" && <ShieldCheck size={20} />}
                      {addon.icon === "PenTool" && <PenTool size={20} />}
                      {addon.icon === "Paperclip" && <Paperclip size={20} />}
                    </div>
                    <div className="addon-details">
                      <div className="addon-meta">
                        <span className="addon-badge">{addon.badge}</span>
                        <span className="addon-price">{money(addon.priceMinor, shop.currency)}</span>
                      </div>
                      <h4>{addon.title}</h4>
                      <p>{addon.subtitle}</p>
                    </div>
                    <button
                      type="button"
                      className="primary-action mini-add-btn"
                      onClick={() => handleQuickAddCrossSell(addon)}
                    >
                      <span>Add</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Curated Presets for Store */}
          {isAccepting && (
            <section className="store-presets-section">
              <div className="rail-header">
                <div className="rail-pill">
                  <Layers size={14} /> Workflow Packages
                </div>
                <h2>Document Packages Ready at Counter</h2>
              </div>

              <div className="presets-list-horizontal">
                {STORE_PRESETS.slice(0, 2).map((pkg) => (
                  <div key={pkg.id} className="store-package-card premier-card">
                    <div className="pkg-header">
                      <span className="pkg-category">{pkg.category}</span>
                      <span className="pkg-badge">{pkg.badge}</span>
                    </div>
                    <h3>{pkg.title}</h3>
                    <p>{pkg.tagline}</p>
                    <div className="pkg-items">
                      {pkg.itemsIncluded.map((it, idx) => (
                        <div key={idx} className="pkg-item-line">
                          <CheckCircle2 size={14} className="check-bullet" />
                          <span>{it.label}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="secondary-action pkg-start-btn"
                      onClick={() => setActiveCategory("print")}
                    >
                      <span>Start with Print File</span>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="store-footer">
            <Paperclip size={15} /> Your documents are encrypted and transmitted strictly to {shop.displayName} to fulfil your order.
            <div className="footer-brand-sub">
              <span>sprint by abh1</span>
            </div>
          </footer>
        </main>
      ) : activeCategory === "print" ? (
        <PrintFlow
          shop={shop}
          sessionToken={sessionToken}
          onBack={() => setActiveCategory(null)}
          onGoToCart={() => setIsOpen(true)}
        />
      ) : activeCategory === "services" ? (
        <ServicesFlow
          shop={shop}
          onBack={() => setActiveCategory(null)}
          onGoToCart={() => setIsOpen(true)}
        />
      ) : (
        <StationeryFlow
          shop={shop}
          onBack={() => setActiveCategory(null)}
          onGoToCart={() => setIsOpen(true)}
        />
      )}

      {/* Floating Bottom Cart Bar (Sticky Mobile & Desktop) */}
      {itemCount > 0 && (
        <aside className="floating-cart-bar" aria-label="Shopping Cart Summary">
          <div className="cart-bar-inner">
            <div className="cart-bar-info">
              <div className="cart-icon-circle">
                <ShoppingBag size={20} />
              </div>
              <div className="cart-text-stack">
                <strong>{itemCount} {itemCount === 1 ? "item" : "items"} in Cart</strong>
                <span className="cart-total-badge">{money(totalMinor, shop.currency)}</span>
              </div>
            </div>
            <button
              type="button"
              className="primary-action cart-bar-btn"
              onClick={() => setIsOpen(true)}
            >
              <span>Review Order</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </aside>
      )}

      {/* Cart Drawer with cross-sells */}
      <CartDrawer
        shop={shop}
        sessionToken={sessionToken}
        onOrderCreated={(created) => {
          onNavigate(`/r/${created.id}`);
        }}
      />

      {/* Store QR Poster Modal */}
      {showPoster && (
        <StorePosterModal
          store={shop}
          onClose={() => setShowPoster(false)}
        />
      )}
    </div>
  );
}
