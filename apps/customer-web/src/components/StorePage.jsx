import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  CircleAlert,
  FileCheck2,
  FileText,
  HelpCircle,
  MapPin,
  Paperclip,
  Printer,
  QrCode,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { BrandMark, money } from "./BrandMark";
import { useCart } from "../context/CartContext";
import { PrintFlow } from "./PrintFlow";
import { ServicesFlow } from "./ServicesFlow";
import { StationeryFlow } from "./StationeryFlow";
import { CartDrawer } from "./CartDrawer";
import { StorePosterModal } from "./StorePosterModal";

export function StorePage({
  shop,
  sessionToken,
  initialCategory,
  onNavigate,
}) {
  const [activeCategory, setActiveCategory] = useState(initialCategory || null);
  const [showPoster, setShowPoster] = useState(false);
  const { itemCount, totalMinor, setIsOpen } = useCart();

  const isSuspended = shop.operationalStatus === "SUSPENDED_BY_ABH1";
  const isPaused = shop.operationalStatus === "PAUSED_BY_MERCHANT" || shop.status !== "OPEN";
  const isAccepting = !isSuspended && !isPaused;

  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark onClick={() => onNavigate("/")} />
        <div className="topbar-right">
          <button
            type="button"
            className="icon-action-btn"
            title="View Store QR"
            onClick={() => setShowPoster(true)}
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
        <main className="home">
          <section className="hero">
            <div className="type-grid" aria-hidden="true">
              <b>S</b>
              <b>P</b>
              <b>R</b>
              <b>I</b>
              <b>N</b>
              <b>T</b>
            </div>

            <div className="store-meta-banner">
              <span className={`availability ${isAccepting ? "avail-open" : "avail-closed"}`}>
                <i />{" "}
                {isAccepting
                  ? "Open now • Accepting requests"
                  : isSuspended
                  ? "Store suspended"
                  : "Paused by merchant"}
              </span>
              <span className="store-code-pill">
                Code: <strong>{shop.storeCode || shop.slug}</strong>
              </span>
            </div>

            <h1>{shop.displayName}</h1>
            <p className="hero-copy">
              {shop.address ? `${shop.address}, ${shop.city || ""}` : "Neighborhood document & print center"}
            </p>

            <div className="category-selection-grid">
              <div
                className={`category-hero-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("print")}
              >
                <div className="category-card-icon print-bg">
                  <Printer size={30} />
                </div>
                <div className="category-card-text">
                  <h3>Print a Document</h3>
                  <p>Upload PDF, JPG, or PNG. Choose color or B&W, copies & sides with instant pricing.</p>
                  <span className="action-tag">Configure Print <ChevronRight size={16} /></span>
                </div>
              </div>

              <div
                className={`category-hero-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("services")}
              >
                <div className="category-card-icon service-bg">
                  <FileCheck2 size={30} />
                </div>
                <div className="category-card-text">
                  <h3>Document Services</h3>
                  <p>High-res scanning, spiral binding, thermal lamination, and counter requests.</p>
                  <span className="action-tag">Browse Services <ChevronRight size={16} /></span>
                </div>
              </div>

              <div
                className={`category-hero-card ${!isAccepting ? "disabled" : ""}`}
                onClick={() => isAccepting && setActiveCategory("stationery")}
              >
                <div className="category-card-icon stationery-bg">
                  <ShoppingBag size={30} />
                </div>
                <div className="category-card-text">
                  <h3>Stationery & Supplies</h3>
                  <p>Notebooks, pens, adhesives, highlighters and desk essentials in counter stock.</p>
                  <span className="action-tag">Shop Stationery <ChevronRight size={16} /></span>
                </div>
              </div>
            </div>
          </section>

          <footer>
            <Paperclip size={15} /> Your documents are shared strictly with this shop to fulfil your order. <span>sprint by abh1</span>
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

      {/* Floating Bottom Cart Bar */}
      {itemCount > 0 && (
        <div className="floating-cart-bar">
          <div className="cart-bar-inner">
            <div className="cart-bar-info">
              <ShoppingBag size={20} />
              <div>
                <strong>{itemCount} {itemCount === 1 ? "item" : "items"} in Cart</strong>
                <span>{money(totalMinor, shop.currency)}</span>
              </div>
            </div>
            <button
              type="button"
              className="primary-action cart-bar-btn"
              onClick={() => setIsOpen(true)}
            >
              Review & Order <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
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
