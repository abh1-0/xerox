import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  FileText,
  MapPin,
  Printer,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { normalizeStoreCode, isValidStoreCode } from "@sprint/contracts";

export function LandingPage({ onNavigate }) {
  const [storeCode, setStoreCode] = useState("");
  const [error, setError] = useState("");

  function handleCodeSubmit(e) {
    e.preventDefault();
    const normalized = normalizeStoreCode(storeCode);
    if (!normalized || normalized.length !== 5) {
      setError("Please enter a valid 5-character store code.");
      return;
    }
    setError("");
    onNavigate(`/s/${normalized}`);
  }

  return (
    <div className="app-shell landing-shell">
      <header className="topbar">
        <BrandMark onClick={() => onNavigate("/")} />
        <div className="topbar-actions">
          <button
            type="button"
            className="secondary-action topbar-btn"
            onClick={() => onNavigate("/merchant")}
          >
            <Store size={16} /> Merchant Portal
          </button>
        </div>
      </header>

      <main className="landing-content">
        <section className="landing-hero">
          <div className="hero-pill">
            <Sparkles size={14} /> The digital operating layer for print shops
          </div>
          <h1>
            Print documents. Request services. Shop stationery.
          </h1>
          <p className="hero-subtext">
            Skip the counter queue. Walk into your neighborhood Xerox shop, scan the QR code, configure your order, and pick it up when ready.
          </p>

          <form className="store-code-card" onSubmit={handleCodeSubmit}>
            <div className="code-input-wrapper">
              <label htmlFor="store-code-input">
                <QrCode size={18} /> Enter Store Code
              </label>
              <div className="input-row">
                <input
                  id="store-code-input"
                  type="text"
                  maxLength={5}
                  value={storeCode}
                  placeholder="e.g. 7KD3P"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                    setStoreCode(val);
                    if (error) setError("");
                  }}
                />
                <button type="submit" className="primary-action find-btn">
                  Go to Store <ArrowRight size={18} />
                </button>
              </div>
              {error && <p className="code-error">{error}</p>}
            </div>

            <div className="demo-hint">
              <span>Visiting a store now?</span>
              <button
                type="button"
                className="chip-link"
                onClick={() => onNavigate("/s/7KD3P")}
              >
                <MapPin size={13} /> Open Sai Xerox Uppal (7KD3P)
              </button>
            </div>
          </form>
        </section>

        <section className="features-grid">
          <div className="feature-card">
            <div className="feature-icon print-accent">
              <Printer size={24} />
            </div>
            <h3>Self-Serve Printing</h3>
            <p>
              Upload documents directly from your phone. Configure B&W or color, single or double sided, with instant transparent pricing.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon service-accent">
              <FileText size={24} />
            </div>
            <h3>Document Services</h3>
            <p>
              Request spiral binding, lamination, high-resolution scanning, or custom typing with instant quotes from the store owner.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon stationery-accent">
              <ShoppingBag size={24} />
            </div>
            <h3>Stationery Pickup</h3>
            <p>
              Browse live inventory for notebooks, pens, adhesives, and exam essentials. Add to the same order and pick up together.
            </p>
          </div>
        </section>

        <section className="merchant-banner">
          <div className="merchant-banner-text">
            <h2>Own a print shop or stationery center?</h2>
            <p>
              Sprint equips local merchants with automatic spooler printing, real-time customer queues, live catalog management, and printable QR posters.
            </p>
          </div>
          <div className="merchant-banner-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => onNavigate("/merchant")}
            >
              Open Merchant Portal
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => onNavigate("/admin")}
            >
              abh1 Platform Admin
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <BrandMark size="normal" />
            <p>Sprint by abh1 · The neighborhood print operating layer</p>
          </div>
          <div className="footer-links">
            <button type="button" onClick={() => onNavigate("/s/7KD3P")}>
              Sample Store (7KD3P)
            </button>
            <button type="button" onClick={() => onNavigate("/merchant")}>
              Merchant Portal
            </button>
            <button type="button" onClick={() => onNavigate("/admin")}>
              Platform Admin
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
