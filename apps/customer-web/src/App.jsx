import { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, LoaderCircle, MapPin, ShieldCheck } from "lucide-react";
import { createCustomerSession, fetchShop, lookupStore } from "./api";
import { CartProvider } from "./context/CartContext";
import { LandingPage } from "./components/LandingPage";
import { StorePage } from "./components/StorePage";
import { OrderStatusPage } from "./components/OrderStatusPage";
import { MerchantPortal } from "./components/MerchantPortal";
import { AdminPortal } from "./components/AdminPortal";
import { BrandMark } from "./components/BrandMark";

const SESSION_KEY = "sprint.customer.session";

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [sessionToken, setSessionToken] = useState(
    () => sessionStorage.getItem(SESSION_KEY) || ""
  );
  const [shop, setShop] = useState(null);
  const [loadingShop, setLoadingShop] = useState(false);
  const [shopError, setShopError] = useState("");

  // Listen to popstate (back/forward browser navigation)
  useEffect(() => {
    function handlePopState() {
      setCurrentPath(window.location.pathname);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  }

  // Ensure customer session token exists
  useEffect(() => {
    if (!sessionToken) {
      createCustomerSession()
        .then((res) => {
          const token = res?.token || res?.session?.token;
          if (token) {
            sessionStorage.setItem(SESSION_KEY, token);
            setSessionToken(token);
          }
        })
        .catch(() => {
          const fallback = `sess_${crypto.randomUUID()}`;
          sessionStorage.setItem(SESSION_KEY, fallback);
          setSessionToken(fallback);
        });
    }
  }, [sessionToken]);

  // Route parsing
  const storeMatch = currentPath.match(/^\/s\/([A-Za-z0-9_-]+)(\/([a-z]+))?/);
  const orderMatch = currentPath.match(/^\/r\/([A-Za-z0-9_-]+)/);
  const isAdmin = currentPath.startsWith("/admin");
  const isMerchant = currentPath.startsWith("/merchant");
  const isPrivacy = currentPath === "/privacy";
  const isTerms = currentPath === "/terms";

  const storeCodeFromUrl = storeMatch?.[1];
  const categoryFromUrl = storeMatch?.[3]; // "print" | "services" | "stationery" | undefined
  const orderIdFromUrl = orderMatch?.[1];

  // Fetch shop when navigating to /s/:storeCode
  useEffect(() => {
    if (!storeCodeFromUrl) {
      setShop(null);
      setShopError("");
      return;
    }

    let cancelled = false;
    setLoadingShop(true);
    setShopError("");

    async function loadShop() {
      try {
        // fetchShop returns full catalog, services, products, rates
        let res;
        try {
          res = await fetchShop(storeCodeFromUrl);
        } catch {
          res = await lookupStore(storeCodeFromUrl);
        }

        if (!cancelled) {
          const shopData = res?.shop || res;
          if (shopData && (shopData.id || shopData.displayName)) {
            setShop(shopData);
          } else {
            setShopError(`Store "${storeCodeFromUrl}" not found.`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setShopError(
            err.message || `Could not find store with code "${storeCodeFromUrl}".`
          );
        }
      } finally {
        if (!cancelled) setLoadingShop(false);
      }
    }

    loadShop();
    return () => {
      cancelled = true;
    };
  }, [storeCodeFromUrl]);

  // 1. Admin Portal
  if (isAdmin) {
    return <AdminPortal onNavigate={navigate} />;
  }

  // 2. Merchant Portal
  if (isMerchant) {
    return <MerchantPortal onNavigate={navigate} />;
  }

  // 3. Order Status Page
  if (orderIdFromUrl) {
    return (
      <OrderStatusPage
        requestId={orderIdFromUrl}
        sessionToken={sessionToken}
        onNavigate={navigate}
      />
    );
  }

  // 4. Storefront /s/:storeCode
  if (storeCodeFromUrl) {
    if (loadingShop) {
      return (
        <div className="loading-screen">
          <LoaderCircle className="spin" size={40} />
          <p>Connecting to store <strong>{storeCodeFromUrl.toUpperCase()}</strong>…</p>
        </div>
      );
    }

    if (shopError || !shop) {
      return (
        <div className="fatal">
          <h2>Store Not Found</h2>
          <p>{shopError || `No store registered under code "${storeCodeFromUrl}".`}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate("/")}
          >
            Return to Sprint Home
          </button>
        </div>
      );
    }

    return (
      <CartProvider storeCode={shop.storeCode || shop.slug}>
        <StorePage
          shop={shop}
          sessionToken={sessionToken}
          initialCategory={categoryFromUrl}
          onNavigate={navigate}
        />
      </CartProvider>
    );
  }

  // 5. Legal: Privacy Policy
  if (isPrivacy) {
    return (
      <div className="app-shell legal-shell">
        <header className="topbar">
          <BrandMark onClick={() => navigate("/")} />
          <button type="button" className="secondary-action" onClick={() => navigate("/")}>
            <ArrowLeft size={15} /> Back
          </button>
        </header>
        <main className="legal-content">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last Updated: October 2026</p>
          <section className="legal-section">
            <h3>1. Document Privacy & Confidentiality</h3>
            <p>
              When you upload documents to Sprint for printing or scanning, your files are transmitted over TLS-encrypted connections and shared strictly with the physical store you selected.
            </p>
            <p>
              Temporary files are automatically purged from our cloud storage and local merchant spoolers upon fulfillment.
            </p>
          </section>
          <section className="legal-section">
            <h3>2. Information We Collect</h3>
            <p>
              We only collect information necessary to fulfill your counter requests (such as your phone number or name if provided for order pickup notifications).
            </p>
          </section>
          <section className="legal-section">
            <h3>3. Contact Information</h3>
            <p>
              Sprint platform operations: <code>operations@abh1.xyz</code> · Hyderabad, India.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // 6. Legal: Terms of Service
  if (isTerms) {
    return (
      <div className="app-shell legal-shell">
        <header className="topbar">
          <BrandMark onClick={() => navigate("/")} />
          <button type="button" className="secondary-action" onClick={() => navigate("/")}>
            <ArrowLeft size={15} /> Back
          </button>
        </header>
        <main className="legal-content">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last Updated: October 2026</p>
          <section className="legal-section">
            <h3>1. Merchant Operating Layer</h3>
            <p>
              Sprint is the digital operating platform connecting customers with local print and document merchants. Counter fulfillment, print quality, and physical stationery inventory are managed by each independent merchant store.
            </p>
          </section>
          <section className="legal-section">
            <h3>2. Fair Use</h3>
            <p>
              Users may not upload unlawful, abusive, or copyrighted materials without proper authorization.
            </p>
          </section>
        </main>
      </div>
    );
  }

  // 7. Landing Page
  if (currentPath === "/") {
    return <LandingPage onNavigate={navigate} />;
  }

  // 8. Custom 404
  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark onClick={() => navigate("/")} />
      </header>
      <main className="fatal">
        <h2>404 · Page Not Found</h2>
        <p>The page <code>{currentPath}</code> does not exist on Sprint.</p>
        <button
          type="button"
          className="primary-action"
          onClick={() => navigate("/")}
        >
          Go to Sprint Home
        </button>
      </main>
    </div>
  );
}
