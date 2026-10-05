import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers,
  MapPin,
  Paperclip,
  Printer,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { BrandMark } from "./BrandMark";
import { normalizeStoreCode } from "@sprint/contracts";
import { STORE_PRESETS } from "../recommendations";

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

  function handleQuickStore(code) {
    onNavigate(`/s/${code}`);
  }

  return (
    <div className="app-shell landing-shell">
      {/* Liquid Glass Navigation Bar */}
      <header className="topbar">
        <BrandMark onClick={() => onNavigate("/")} />
        <div className="topbar-actions">
          <button
            type="button"
            className="secondary-action topbar-btn"
            onClick={() => onNavigate("/merchant")}
          >
            <Store size={15} /> Merchant Portal
          </button>
          <button
            type="button"
            className="secondary-action topbar-btn"
            onClick={() => onNavigate("/admin")}
          >
            <ShieldCheck size={15} /> abh1 Admin
          </button>
        </div>
      </header>

      <main className="landing-content">
        {/* Dynamic Hero Section */}
        <section className="landing-hero">
          <div className="hero-pill">
            <Sparkles size={14} className="accent-sparkle" />
            <span>Digital operating layer for neighborhood Xerox & print centers</span>
          </div>

          <h1 className="hero-headline">
            Walk into your local shop. <br />
            <span className="hero-gradient-text">Scan, order, pick up.</span>
          </h1>

          <p className="hero-subtext">
            Skip counter queues. Upload files from your phone, request binding or lamination,
            and grab stationery in one cohesive order.
          </p>

          {/* Interactive 5-Char Store Code Card */}
          <form className="store-code-card premier-card" onSubmit={handleCodeSubmit}>
            <div className="code-input-wrapper">
              <label htmlFor="store-code-input" className="code-label">
                <QrCode size={18} className="code-icon" />
                <span>Enter Store Code</span>
                <span className="code-badge">5 Characters</span>
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
                  className="code-input-field"
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
                    setStoreCode(val);
                    if (error) setError("");
                  }}
                />
                <button type="submit" className="primary-action find-btn">
                  <span>Enter Store</span>
                  <ArrowRight size={18} />
                </button>
              </div>

              {error && <p className="code-error" role="alert">{error}</p>}
            </div>

            {/* Quick Access Store Cards */}
            <div className="quick-stores-section">
              <span className="quick-stores-label">Quick Access Demos:</span>
              <div className="quick-stores-chips">
                <button
                  type="button"
                  className="store-chip-btn"
                  onClick={() => handleQuickStore("7KD3P")}
                >
                  <MapPin size={13} />
                  <strong>Sai Xerox</strong>
                  <span className="chip-code">7KD3P</span>
                </button>
                <button
                  type="button"
                  className="store-chip-btn"
                  onClick={() => handleQuickStore("M4X8Q")}
                >
                  <MapPin size={13} />
                  <strong>Sai Xerox Habsiguda</strong>
                  <span className="chip-code">M4X8Q</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Curated Recommendations Rail */}
        <section className="recommendations-section">
          <div className="section-header-block">
            <div className="section-pill">
              <Zap size={14} /> Smart Bundles
            </div>
            <h2>Frequently Ordered Together</h2>
            <p>Popular document workflows engineered for students, advocates, and job seekers.</p>
          </div>

          <div className="presets-bento-grid">
            {STORE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="preset-bento-card"
                onClick={() => handleQuickStore("7KD3P")}
                role="button"
                tabIndex={0}
              >
                <div className="preset-card-top">
                  <span className="preset-badge">{preset.badge}</span>
                  <span className="preset-savings">{preset.sampleSavings}</span>
                </div>
                <h3>{preset.title}</h3>
                <p className="preset-tagline">{preset.tagline}</p>
                
                <div className="preset-items-checklist">
                  {preset.itemsIncluded.map((it, idx) => (
                    <div key={idx} className="preset-item-row">
                      <CheckCircle2 size={15} className="check-bullet" />
                      <span>{it.label}</span>
                    </div>
                  ))}
                </div>

                <div className="preset-card-footer">
                  <span className="action-hint">Configure at Sai Xerox</span>
                  <ChevronRight size={16} className="preset-arrow" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Hierarchy */}
        <section className="features-grid">
          <div className="feature-card premier-card">
            <div className="feature-icon print-accent">
              <Printer size={26} />
            </div>
            <h3>Self-Serve Printing</h3>
            <p>
              Upload PDF or images straight from your phone. Configure B&W or color, duplex,
              paper size and page ranges with real-time transparent calculations.
            </p>
          </div>

          <div className="feature-card premier-card">
            <div className="feature-icon service-accent">
              <FileCheck2 size={26} />
            </div>
            <h3>Document Services</h3>
            <p>
              Spiral binding, 100-micron thermal lamination, ultra-res scanning, and custom counter quotes
              reviewed directly by the local merchant.
            </p>
          </div>

          <div className="feature-card premier-card">
            <div className="feature-icon stationery-accent">
              <ShoppingBag size={26} />
            </div>
            <h3>Desk & Exam Stationery</h3>
            <p>
              Live inventory tracking for ballpoint pens, sticky notes, adhesives, and notebooks.
              Add to the same ticket and pick up in seconds.
            </p>
          </div>
        </section>

        {/* Merchant & Operator Banner */}
        <section className="merchant-banner premier-card">
          <div className="merchant-banner-content">
            <span className="banner-pill">Merchant Operating System</span>
            <h2>Run your print shop on Sprint</h2>
            <p>
              Automatic Windows spooler printing, real-time counter queue dashboard,
              QR poster generation, and instant WhatsApp/UPI ready checkout.
            </p>
            <div className="banner-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() => onNavigate("/merchant")}
              >
                <span>Launch Merchant Portal</span>
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onNavigate("/admin")}
              >
                Platform Administration
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Production Footer */}
      <footer className="site-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <BrandMark size="normal" />
            <p>Neighborhood Xerox, document and stationery digital layer.</p>
          </div>
          <div className="footer-links">
            <button type="button" onClick={() => onNavigate("/privacy")}>Privacy Policy</button>
            <button type="button" onClick={() => onNavigate("/terms")}>Terms of Service</button>
            <button type="button" onClick={() => onNavigate("/merchant")}>Merchant Portal</button>
            <button type="button" onClick={() => onNavigate("/admin")}>Admin Console</button>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} sprint by abh1 · All rights reserved.</span>
          <span>Designed with Premier Craft</span>
        </div>
      </footer>
    </div>
  );
}
