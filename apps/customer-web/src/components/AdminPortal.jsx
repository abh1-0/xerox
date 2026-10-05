import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Laptop,
  LoaderCircle,
  Lock,
  LogOut,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import {
  adminLogin,
  createAdminMerchant,
  createAdminStore,
  fetchAdminOverview,
  revokeAdminDevice,
  updateAdminStoreStatus,
} from "../api";
import { BrandMark, money } from "./BrandMark";
import { StorePosterModal } from "./StorePosterModal";

const ADMIN_STORAGE_KEY = "sprint.admin_token";
const DEFAULT_ADMIN_TOKEN = "sprint_admin_abh1_prod";

export function AdminPortal({ onNavigate }) {
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(ADMIN_STORAGE_KEY) || DEFAULT_ADMIN_TOKEN
  );
  const [adminUser, setAdminUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sprint.admin_user") || "null");
    } catch {
      return { email: "admin@abh1.xyz", displayName: "abh1 Platform Admin" };
    }
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [overview, setOverview] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // "overview" | "merchants" | "stores" | "devices"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("admin@abh1.xyz");
  const [loginToken, setLoginToken] = useState(DEFAULT_ADMIN_TOKEN);
  const [loginLoading, setLoginLoading] = useState(false);

  // Create Merchant Modal
  const [showMerchantModal, setShowMerchantModal] = useState(false);
  const [merchantName, setMerchantName] = useState("");
  const [merchantEmail, setMerchantEmail] = useState("");
  const [merchantPhone, setMerchantPhone] = useState("");
  const [creatingMerchant, setCreatingMerchant] = useState(false);

  // Create Store Modal
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [storeMerchantId, setStoreMerchantId] = useState("");
  const [storeDisplayName, setStoreDisplayName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storeCity, setStoreCity] = useState("Hyderabad");
  const [creatingStore, setCreatingStore] = useState(false);
  const [createdStoreResult, setCreatedStoreResult] = useState(null);

  // Poster Modal
  const [posterStore, setPosterStore] = useState(null);

  async function loadData(tokenToUse = adminToken) {
    if (!tokenToUse) {
      setLoading(false);
      setIsAuthenticated(false);
      return;
    }

    try {
      const data = await fetchAdminOverview(tokenToUse);
      setOverview(data);
      setIsAuthenticated(true);
      if (data?.merchants?.length > 0 && !storeMerchantId) {
        setStoreMerchantId(data.merchants[0].id);
      }
    } catch (err) {
      setIsAuthenticated(false);
      setError(err.message || "Please sign in to access Platform Admin.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [adminToken]);

  async function handleAdminLogin(e) {
    e?.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const res = await adminLogin({
        email: loginEmail.trim(),
        token: loginToken.trim(),
      });

      const tokenReceived = res.adminToken || loginToken.trim();
      setAdminToken(tokenReceived);
      setAdminUser(res.admin || { email: loginEmail, displayName: "abh1 Admin" });
      localStorage.setItem(ADMIN_STORAGE_KEY, tokenReceived);
      localStorage.setItem("sprint.admin_user", JSON.stringify(res.admin || { email: loginEmail }));

      await loadData(tokenReceived);
      setActionNotice("Welcome back, abh1 Platform Admin!");
      setTimeout(() => setActionNotice(""), 3500);
    } catch (err) {
      setError(err.message || "Invalid admin credentials.");
    } finally {
      setLoginLoading(false);
    }
  }

  function handleSignOut() {
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    localStorage.removeItem("sprint.admin_user");
    setAdminToken("");
    setIsAuthenticated(false);
    setOverview(null);
  }

  async function handleCreateMerchant(e) {
    e.preventDefault();
    if (!merchantName.trim()) return;
    setCreatingMerchant(true);
    setError("");
    try {
      await createAdminMerchant(
        {
          name: merchantName.trim(),
          contactEmail: merchantEmail.trim() || undefined,
          contactPhone: merchantPhone.trim() || undefined,
        },
        adminToken
      );
      setMerchantName("");
      setMerchantEmail("");
      setMerchantPhone("");
      setShowMerchantModal(false);
      setActionNotice("New merchant business created successfully!");
      setTimeout(() => setActionNotice(""), 3500);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to create merchant");
    } finally {
      setCreatingMerchant(false);
    }
  }

  async function handleCreateStore(e) {
    e.preventDefault();
    if (!storeDisplayName.trim() || !storeMerchantId) return;
    setCreatingStore(true);
    setError("");
    try {
      const result = await createAdminStore(
        {
          merchantId: storeMerchantId,
          displayName: storeDisplayName.trim(),
          address: storeAddress.trim() || undefined,
          city: storeCity.trim() || undefined,
        },
        adminToken
      );

      const createdStore = result.store || result;
      setCreatedStoreResult(createdStore);
      setStoreDisplayName("");
      setStoreAddress("");
      setActionNotice(`Store created with Store Code: ${createdStore.storeCode}!`);
      setTimeout(() => setActionNotice(""), 4000);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to create store");
    } finally {
      setCreatingStore(false);
    }
  }

  async function handleToggleSuspendStore(store) {
    const isSuspended = store.operationalStatus === "SUSPENDED_BY_ABH1";
    const nextStatus = isSuspended ? "ACTIVE" : "SUSPENDED_BY_ABH1";

    try {
      await updateAdminStoreStatus(store.id, nextStatus, adminToken);
      setActionNotice(
        `Store ${store.displayName} is now ${
          isSuspended ? "Activated" : "Suspended by Platform"
        }`
      );
      setTimeout(() => setActionNotice(""), 3500);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to update store operational status");
    }
  }

  async function handleRevokeDevice(deviceId) {
    if (!confirm("Are you sure you want to revoke this terminal device?")) return;
    try {
      await revokeAdminDevice(deviceId, adminToken);
      setActionNotice("Device access revoked.");
      setTimeout(() => setActionNotice(""), 3500);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to revoke device");
    }
  }

  // If not authenticated, render premier login card
  if (!isAuthenticated && !loading) {
    return (
      <div className="app-shell admin-auth-shell">
        <header className="topbar">
          <BrandMark onClick={() => onNavigate("/")} />
          <div className="topbar-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => onNavigate("/")}
            >
              Back to Sprint Home
            </button>
          </div>
        </header>

        <main className="admin-login-container">
          <div className="admin-login-card">
            <div className="admin-lock-icon">
              <ShieldCheck size={36} />
            </div>
            <h2>abh1 Platform Administration</h2>
            <p className="admin-login-subtext">
              Sign in with your authorized abh1 administrator account to manage merchants, physical stores, and network spooler devices.
            </p>

            <form onSubmit={handleAdminLogin} className="admin-login-form">
              <label className="stacked">
                Administrator Email
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="admin@abh1.xyz"
                  required
                />
              </label>

              <label className="stacked">
                Platform Admin Security Token
                <input
                  type="password"
                  value={loginToken}
                  onChange={(e) => setLoginToken(e.target.value)}
                  placeholder="Enter security token"
                  required
                />
              </label>

              {error && (
                <p className="error" role="alert">
                  <AlertCircle size={16} /> {error}
                </p>
              )}

              <button
                type="submit"
                className="primary-action full-width"
                disabled={loginLoading}
              >
                {loginLoading ? (
                  <>
                    <LoaderCircle className="spin" size={16} /> Authenticating…
                  </>
                ) : (
                  <>
                    <KeyRound size={16} /> Sign In to Platform Admin
                  </>
                )}
              </button>

              <div className="quick-access-hint">
                <span>Created Admin Account:</span>
                <code>admin@abh1.xyz</code>
              </div>
            </form>
          </div>
        </main>
      </div>
    );
  }

  const merchants = overview?.merchants || [];
  const stores = overview?.stores || [];
  const devices = overview?.devices || [];
  const metrics = overview?.metrics || {
    totalMerchants: merchants.length,
    totalStores: stores.length,
    activeStores: stores.filter((s) => s.operationalStatus === "ACTIVE").length,
    requestsToday: 0,
    grossVolumeMinor: 0,
    onlineDevices: devices.filter((d) => d.status === "ACTIVE").length,
  };

  return (
    <div className="app-shell admin-shell">
      <header className="topbar">
        <div className="topbar-left">
          <BrandMark onClick={() => onNavigate("/")} />
          <span className="admin-badge">abh1 Admin</span>
          {adminUser && (
            <span className="admin-user-pill">
              <ShieldCheck size={13} /> {adminUser.displayName || adminUser.email}
            </span>
          )}
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="secondary-action"
            onClick={() => onNavigate("/merchant")}
          >
            <Store size={15} /> Merchant View
          </button>
          <button
            type="button"
            className="icon-button"
            title="Sign Out"
            onClick={handleSignOut}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="merchant-workspace">
        <aside className="merchant-sidebar">
          <div className="selected-store-info">
            <h4>Sprint Platform Admin</h4>
            <p>Admin: <strong>{adminUser?.displayName || "abh1"}</strong></p>
            <span className="store-subtext">Global Control Plane</span>
          </div>

          <nav className="merchant-nav">
            <button
              type="button"
              className={`nav-tab ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <ShieldCheck size={18} /> Platform Overview
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === "merchants" ? "active" : ""}`}
              onClick={() => setActiveTab("merchants")}
            >
              <Building2 size={18} /> Merchants ({merchants.length})
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === "stores" ? "active" : ""}`}
              onClick={() => setActiveTab("stores")}
            >
              <Store size={18} /> Physical Stores ({stores.length})
            </button>
            <button
              type="button"
              className={`nav-tab ${activeTab === "devices" ? "active" : ""}`}
              onClick={() => setActiveTab("devices")}
            >
              <Laptop size={18} /> Terminals ({devices.length})
            </button>
          </nav>
        </aside>

        <main className="merchant-main">
          {actionNotice && (
            <div className="action-toast">
              <CheckCircle2 size={18} /> {actionNotice}
            </div>
          )}

          {error && (
            <div className="error-toast" role="alert">
              <AlertCircle size={18} /> {error}
              <button
                type="button"
                className="close-toast"
                onClick={() => setError("")}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Tab 1: Platform Overview */}
          {activeTab === "overview" && (
            <div className="admin-overview-content">
              <div className="admin-title-row">
                <div>
                  <h2>Platform Operations Dashboard</h2>
                  <p>Real-time telemetry across merchants, physical stores, and Windows spooler devices.</p>
                </div>
              </div>

              <div className="metrics-grid">
                <div className="metric-card">
                  <span>Registered Merchants</span>
                  <strong>{metrics.totalMerchants}</strong>
                  <small>Businesses operating on Sprint</small>
                </div>

                <div className="metric-card">
                  <span>Physical Stores</span>
                  <strong>{metrics.totalStores}</strong>
                  <small>{metrics.activeStores} active & accepting orders</small>
                </div>

                <div className="metric-card">
                  <span>Orders Today</span>
                  <strong>{metrics.requestsToday}</strong>
                  <small>Submitted across network</small>
                </div>

                <div className="metric-card">
                  <span>Platform GTV</span>
                  <strong>{money(metrics.totalGtvMinor || metrics.grossVolumeMinor)}</strong>
                  <small>Gross transaction volume</small>
                </div>

                <div className="metric-card">
                  <span>Active Terminals</span>
                  <strong>{metrics.onlineDevices}</strong>
                  <small>Windows spooler devices</small>
                </div>
              </div>

              <div className="admin-quick-actions">
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setShowStoreModal(true)}
                >
                  <Plus size={16} /> Add New Physical Store
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowMerchantModal(true)}
                >
                  <Plus size={16} /> Register New Merchant
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Merchants */}
          {activeTab === "merchants" && (
            <div className="admin-tab-content">
              <div className="tab-title-row">
                <div>
                  <h2>Merchants</h2>
                  <p>Parent business entities owning physical store branches.</p>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setShowMerchantModal(true)}
                >
                  <Plus size={16} /> Create Merchant
                </button>
              </div>

              <div className="catalog-table-wrap">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Merchant Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Stores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchants.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong></td>
                        <td>{m.contactEmail || m.contact_email || "—"}</td>
                        <td>{m.contactPhone || m.contact_phone || "—"}</td>
                        <td><span className="badge-active">ACTIVE</span></td>
                        <td>{m.storesCount || stores.filter((s) => s.merchantId === m.id).length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Stores */}
          {activeTab === "stores" && (
            <div className="admin-tab-content">
              <div className="tab-title-row">
                <div>
                  <h2>Stores & Locations</h2>
                  <p>Every store gets a permanent 5-character Sprint Store Code.</p>
                </div>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => setShowStoreModal(true)}
                >
                  <Plus size={16} /> Add Physical Store
                </button>
              </div>

              <div className="catalog-table-wrap">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Store Code</th>
                      <th>Display Name</th>
                      <th>City / Address</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s) => {
                      const isSuspended = s.operationalStatus === "SUSPENDED_BY_ABH1";
                      return (
                        <tr key={s.id}>
                          <td>
                            <code className="code-badge">{s.storeCode || s.slug}</code>
                          </td>
                          <td><strong>{s.displayName}</strong></td>
                          <td>{s.address ? `${s.address}, ${s.city || ""}` : s.city || "—"}</td>
                          <td>
                            <span
                              className={`status-pill ${
                                isSuspended
                                  ? "badge-suspended"
                                  : s.operationalStatus === "ACTIVE"
                                  ? "badge-active"
                                  : "badge-paused"
                              }`}
                            >
                              {s.operationalStatus || "ACTIVE"}
                            </span>
                          </td>
                          <td className="actions-cell">
                            <button
                              type="button"
                              className="table-action-btn"
                              title="View QR Poster"
                              onClick={() => setPosterStore(s)}
                            >
                              <QrCode size={15} /> QR
                            </button>
                            <button
                              type="button"
                              className="table-action-btn"
                              title="Open Storefront"
                              onClick={() => onNavigate(`/s/${s.storeCode || s.slug}`)}
                            >
                              <ExternalLink size={15} /> Store
                            </button>
                            <button
                              type="button"
                              className={`table-action-btn ${isSuspended ? "activate-btn" : "suspend-btn"}`}
                              onClick={() => handleToggleSuspendStore(s)}
                            >
                              {isSuspended ? "Reactivate" : "Suspend"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Devices */}
          {activeTab === "devices" && (
            <div className="admin-tab-content">
              <div className="tab-title-row">
                <div>
                  <h2>Paired Windows Terminals</h2>
                  <p>Desktop clients executing physical print jobs via spooler.</p>
                </div>
              </div>

              <div className="catalog-table-wrap">
                <table className="catalog-table">
                  <thead>
                    <tr>
                      <th>Terminal Name</th>
                      <th>Device ID</th>
                      <th>Store</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr key={d.id}>
                        <td><strong>{d.name}</strong></td>
                        <td><code>{d.id}</code></td>
                        <td>{d.shop?.displayName || d.shopSlug || "Assigned"}</td>
                        <td>
                          <span className={d.status === "ACTIVE" ? "badge-active" : "badge-suspended"}>
                            {d.status || "ACTIVE"}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="table-action-btn suspend-btn"
                            onClick={() => handleRevokeDevice(d.id)}
                          >
                            Revoke Access
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal: Create Merchant */}
      {showMerchantModal && (
        <div className="modal-overlay" onClick={() => setShowMerchantModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Merchant Business</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowMerchantModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateMerchant}>
              <div className="modal-body">
                <label className="stacked">
                  Business / Merchant Name
                  <input
                    type="text"
                    placeholder="e.g. Sai Xerox Pvt Ltd"
                    value={merchantName}
                    onChange={(e) => setMerchantName(e.target.value)}
                    required
                  />
                </label>
                <label className="stacked">
                  Contact Email (Optional)
                  <input
                    type="email"
                    placeholder="contact@saixerox.com"
                    value={merchantEmail}
                    onChange={(e) => setMerchantEmail(e.target.value)}
                  />
                </label>
                <label className="stacked">
                  Contact Phone (Optional)
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={merchantPhone}
                    onChange={(e) => setMerchantPhone(e.target.value)}
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowMerchantModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={creatingMerchant || !merchantName.trim()}
                >
                  {creatingMerchant ? "Creating…" : "Create Merchant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Store */}
      {showStoreModal && !createdStoreResult && (
        <div className="modal-overlay" onClick={() => setShowStoreModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Physical Store Branch</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowStoreModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateStore}>
              <div className="modal-body">
                <label className="stacked">
                  Parent Merchant Business
                  <select
                    value={storeMerchantId}
                    onChange={(e) => setStoreMerchantId(e.target.value)}
                    required
                  >
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="stacked">
                  Store Display Name
                  <input
                    type="text"
                    placeholder="e.g. Sai Xerox — Habsiguda"
                    value={storeDisplayName}
                    onChange={(e) => setStoreDisplayName(e.target.value)}
                    required
                  />
                </label>

                <label className="stacked">
                  City
                  <input
                    type="text"
                    placeholder="e.g. Hyderabad"
                    value={storeCity}
                    onChange={(e) => setStoreCity(e.target.value)}
                  />
                </label>

                <label className="stacked">
                  Address
                  <input
                    type="text"
                    placeholder="e.g. Pillar 12, Main Road, Habsiguda"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                  />
                </label>

                <p className="modal-hint">
                  Sprint will automatically generate a guaranteed permanent 5-character Store Code (e.g. <code>M4X8Q</code>) using the canonical alphabet.
                </p>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setShowStoreModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-action"
                  disabled={creatingStore || !storeDisplayName.trim()}
                >
                  {creatingStore ? "Generating Store…" : "Create Store"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Store Creation Success */}
      {createdStoreResult && (
        <div className="modal-overlay" onClick={() => setCreatedStoreResult(null)}>
          <div className="modal-card store-success-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Store Successfully Created!</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCreatedStoreResult(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body text-center">
              <div className="success-badge-icon">
                <CheckCircle2 size={48} />
              </div>
              <h2>{createdStoreResult.displayName}</h2>
              <div className="generated-code-box">
                <span>Permanent Store Code</span>
                <h1>{createdStoreResult.storeCode}</h1>
              </div>
              <p className="url-preview">
                Customer URL: <code>https://sprint.abh1.xyz/s/{createdStoreResult.storeCode}</code>
              </p>
            </div>
            <div className="modal-footer space-between">
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  setPosterStore(createdStoreResult);
                  setCreatedStoreResult(null);
                }}
              >
                <QrCode size={16} /> View Store QR Poster
              </button>
              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  onNavigate(`/s/${createdStoreResult.storeCode}`);
                  setCreatedStoreResult(null);
                }}
              >
                Open Storefront <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Poster Modal */}
      {posterStore && (
        <StorePosterModal
          store={posterStore}
          onClose={() => setPosterStore(null)}
        />
      )}
    </div>
  );
}
