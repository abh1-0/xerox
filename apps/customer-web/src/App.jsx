import { useEffect, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
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
          if (res?.session?.token) {
            sessionStorage.setItem(SESSION_KEY, res.session.token);
            setSessionToken(res.session.token);
          }
        })
        .catch(() => {
          // Fallback local session token if offline
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
        // Try lookupStore first (for 5-char code), fallback to fetchShop
        let res;
        try {
          res = await lookupStore(storeCodeFromUrl);
        } catch {
          res = await fetchShop(storeCodeFromUrl);
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

  // 5. Default Landing Page /
  return <LandingPage onNavigate={navigate} />;
}
