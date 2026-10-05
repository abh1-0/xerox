import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Laptop,
  LoaderCircle,
  MapPin,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import {
  confirmDevicePairing,
  fetchMerchantRequests,
  fetchMerchantStores,
  proposeMerchantQuote,
  saveMerchantProduct,
  transitionMerchantItem,
  transitionMerchantRequest,
  updateMerchantStore,
} from "../api";
import { BrandMark, money } from "./BrandMark";
import { StorePosterModal } from "./StorePosterModal";
import { statusLabel } from "@sprint/contracts";

export function MerchantPortal({ onNavigate }) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeTab, setActiveTab] = useState("requests"); // "requests" | "qr" | "catalog" | "devices"
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterState, setFilterState] = useState("ALL");
  const [error, setError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  // Modals
  const [showPoster, setShowPoster] = useState(false);
  const [quoteModal, setQuoteModal] = useState(null); // { requestId, item }
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");

  // Device pairing
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);

  // Load stores
  useEffect(() => {
    async function loadStores() {
      try {
        const data = await fetchMerchantStores();
        const storeList = data?.stores || [];
        setStores(storeList);
        if (storeList.length > 0) {
          setSelectedStore(storeList[0]);
        }
      } catch (err) {
        setError("Failed to load merchant stores.");
      } finally {
        setLoading(false);
      }
    }
    loadStores();
  }, []);

  // Poll requests for selected store
  useEffect(() => {
    if (!selectedStore) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetchMerchantRequests();
        if (!cancelled && res?.requests) {
          // Filter by selected store if store has storeCode
          const filtered = res.requests.filter(
            (r) =>
              !selectedStore.storeCode ||
              r.shop?.storeCode === selectedStore.storeCode ||
              r.shopSlug === selectedStore.slug
          );
          setRequests(filtered);
        }
      } catch (err) {
        // Continue polling
      }
    }

    poll();
    const interval = setInterval(poll, 3500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedStore]);

  async function handleToggleStoreStatus() {
    if (!selectedStore) return;
    const isCurrentlyActive = selectedStore.operationalStatus === "ACTIVE";
    const nextStatus = isCurrentlyActive ? "PAUSED_BY_MERCHANT" : "ACTIVE";

    try {
      await updateMerchantStore(selectedStore.id, {
        operationalStatus: nextStatus,
        status: nextStatus === "ACTIVE" ? "OPEN" : "PAUSED",
      });

      setSelectedStore((prev) => ({
        ...prev,
        operationalStatus: nextStatus,
        status: nextStatus === "ACTIVE" ? "OPEN" : "PAUSED",
      }));
      setActionNotice(
        `Store is now ${nextStatus === "ACTIVE" ? "Accepting Requests" : "Paused"}`
      );
      setTimeout(() => setActionNotice(""), 3000);
    } catch (err) {
      setError(err.message || "Failed to update store status");
    }
  }

  async function handleTransitionRequest(requestId, nextState) {
    try {
      await transitionMerchantRequest(requestId, nextState);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, state: nextState } : r))
      );
    } catch (err) {
      setError(err.message || "Failed to advance request");
    }
  }

  async function handleTransitionItem(requestId, itemId, nextStatus) {
    try {
      await transitionMerchantItem(requestId, itemId, nextStatus);
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id === requestId) {
            const nextItems = (r.items || []).map((item) =>
              item.id === itemId ? { ...item, status: nextStatus } : item
            );
            return { ...r, items: nextItems };
          }
          return r;
        })
      );
    } catch (err) {
      setError(err.message || "Failed to update item status");
    }
  }

  async function handleProposeQuote(e) {
    e.preventDefault();
    if (!quoteModal) return;
    const amountMinor = Math.round(parseFloat(quoteAmount) * 100);
    if (!amountMinor || isNaN(amountMinor)) {
      setError("Please enter a valid quote amount.");
      return;
    }

    try {
      await proposeMerchantQuote(quoteModal.requestId, {
        amountMinor,
        notes: quoteNotes,
      });
      setQuoteModal(null);
      setQuoteAmount("");
      setQuoteNotes("");
      setActionNotice("Quote proposal sent directly to customer!");
      setTimeout(() => setActionNotice(""), 3500);
    } catch (err) {
      setError(err.message || "Failed to propose quote");
    }
  }

  async function handlePairDevice(e) {
    e.preventDefault();
    if (!pairingCode.trim() || !selectedStore) return;

    setPairingLoading(true);
    setError("");
    try {
      await confirmDevicePairing(pairingCode.trim().toUpperCase(), selectedStore.id);
      setPairingCode("");
      setActionNotice("Windows Terminal paired successfully!");
      setTimeout(() => setActionNotice(""), 4000);
    } catch (err) {
      setError(err.message || "Failed to pair device. Check the pairing code.");
    } finally {
      setPairingLoading(false);
    }
  }

  const filteredRequests = requests.filter((r) => {
    if (filterState === "ALL") return true;
    if (filterState === "NEW") return r.state === "SUBMITTED";
    if (filterState === "ACTIVE")
      return (
        r.state === "ACCEPTED" ||
        r.state === "PROCESSING" ||
        r.state === "CUSTOMER_ACTION_REQUIRED"
      );
    if (filterState === "READY") return r.state === "READY";
    if (filterState === "COMPLETED") return r.state === "COMPLETED";
    return true;
  });

  return (
    <div className="app-shell merchant-shell">
      {/* Top Bar with Store Switcher & Availability */}
      <header className="topbar">
        <div className="topbar-left">
          <BrandMark onClick={() => onNavigate("/")} />
          <span className="portal-badge">Merchant</span>
        </div>

        <div className="topbar-right">
          {stores.length > 1 && (
            <div className="store-selector-dropdown">
              <Store size={15} />
              <select
                value={selectedStore?.id || ""}
                onChange={(e) => {
                  const s = stores.find((x) => x.id === e.target.value);
                  if (s) setSelectedStore(s);
                }}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName} ({s.storeCode || s.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedStore && (
            <button
              type="button"
              className={`status-toggle-btn ${
                selectedStore.operationalStatus === "ACTIVE"
                  ? "is-active"
                  : "is-paused"
              }`}
              onClick={handleToggleStoreStatus}
            >
              {selectedStore.operationalStatus === "ACTIVE" ? (
                <>
                  <PlayCircle size={16} /> Accepting Requests
                </>
              ) : (
                <>
                  <PauseCircle size={16} /> Store Paused
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="secondary-action preview-store-btn"
            onClick={() =>
              onNavigate(`/s/${selectedStore?.storeCode || selectedStore?.slug}`)
            }
          >
            Open Storefront <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Main Merchant Workspace */}
      <div className="merchant-workspace">
        <aside className="merchant-sidebar">
          <div className="selected-store-info">
            <h4>{selectedStore?.displayName || "Loading Store…"}</h4>
            <p>
              Code: <strong>{selectedStore?.storeCode || selectedStore?.slug}</strong>
            </p>
            <span className="store-subtext">
              {selectedStore?.city || "Local merchant"}
            </span>
          </div>

          <nav className="merchant-nav">
            <button
              type="button"
              className={`nav-tab ${activeTab === "requests" ? "active" : ""}`}
              onClick={() => setActiveTab("requests")}
            >
              <Clock3 size={18} /> Requests Queue
              {requests.filter((r) => r.state === "SUBMITTED").length > 0 && (
                <span className="queue-pill">
                  {requests.filter((r) => r.state === "SUBMITTED").length}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === "qr" ? "active" : ""}`}
              onClick={() => setActiveTab("qr")}
            >
              <QrCode size={18} /> Store QR & Poster
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === "catalog" ? "active" : ""}`}
              onClick={() => setActiveTab("catalog")}
            >
              <ShoppingBag size={18} /> Catalog & Stock
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === "devices" ? "active" : ""}`}
              onClick={() => setActiveTab("devices")}
            >
              <Laptop size={18} /> Windows Terminals
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

          {/* Tab 1: Requests Queue */}
          {activeTab === "requests" && (
            <div className="requests-tab-content">
              <div className="requests-header-row">
                <div>
                  <h2>Customer Requests</h2>
                  <p>Real-time queue for {selectedStore?.displayName}.</p>
                </div>

                <div className="filter-chips">
                  {["ALL", "NEW", "ACTIVE", "READY", "COMPLETED"].map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={`filter-chip ${filterState === f ? "active" : ""}`}
                      onClick={() => setFilterState(f)}
                    >
                      {f === "ALL" ? "All Orders" : f}
                    </button>
                  ))}
                </div>
              </div>

              {filteredRequests.length === 0 ? (
                <div className="empty-requests-card">
                  <Clock3 size={40} className="empty-icon" />
                  <h3>No requests found in this view</h3>
                  <p>
                    {filterState === "NEW"
                      ? "No new incoming orders right now."
                      : "When customers submit requests at your counter, they will appear here live."}
                  </p>
                </div>
              ) : (
                <div className="merchant-requests-list">
                  {filteredRequests.map((req) => (
                    <div key={req.id} className="merchant-request-card">
                      <div className="m-card-top">
                        <div className="m-card-id">
                          <strong>{req.requestNumber}</strong>
                          <span
                            className={`state-pill state-${req.state?.toLowerCase()}`}
                          >
                            {statusLabel(req.state)}
                          </span>
                        </div>
                        <div className="m-card-amount">
                          <strong>{money(req.amountMinor, req.currency)}</strong>
                          <small>
                            {req.paymentMethod === "COUNTER"
                              ? "Pay at Counter"
                              : req.paymentStatus === "COMPLETED"
                              ? "Paid Online"
                              : "Payment Pending"}
                          </small>
                        </div>
                      </div>

                      {req.customerName && (
                        <div className="m-customer-line">
                          <User size={14} /> Customer: <strong>{req.customerName}</strong>
                          {req.customerPhone && (
                            <span> · Ph: {req.customerPhone}</span>
                          )}
                        </div>
                      )}

                      {/* Items List */}
                      <div className="m-items-container">
                        {(req.items || [
                          {
                            id: "legacy",
                            itemType: req.type || "PRINT",
                            title:
                              req.type === "PRINT"
                                ? "Document Print Job"
                                : "Document Service",
                            quantity: 1,
                            status: req.state,
                          },
                        ]).map((item) => (
                          <div key={item.id} className="m-item-row">
                            <div className="m-item-left">
                              {item.itemType === "PRINT" && <Printer size={16} />}
                              {item.itemType === "SERVICE" && <FileText size={16} />}
                              {item.itemType === "STATIONERY" && (
                                <ShoppingBag size={16} />
                              )}
                              <span>{item.title}</span>
                              {item.quantity > 1 && (
                                <strong className="qty-tag">x{item.quantity}</strong>
                              )}
                            </div>

                            <div className="m-item-actions">
                              {item.detailsJson?.notes && (
                                <small className="item-note">
                                  "{item.detailsJson.notes}"
                                </small>
                              )}

                              {item.itemType === "SERVICE" &&
                                item.detailsJson?.priceMode === "QUOTE" &&
                                req.state === "SUBMITTED" && (
                                  <button
                                    type="button"
                                    className="quote-btn"
                                    onClick={() =>
                                      setQuoteModal({
                                        requestId: req.id,
                                        item,
                                      })
                                    }
                                  >
                                    <Sparkles size={14} /> Send Quote
                                  </button>
                                )}

                              {item.status && (
                                <span className="item-tag">{item.status}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* State Advancement Buttons */}
                      <div className="m-workflow-actions">
                        {req.state === "SUBMITTED" && (
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() =>
                              handleTransitionRequest(req.id, "ACCEPTED")
                            }
                          >
                            Accept Order
                          </button>
                        )}

                        {req.state === "ACCEPTED" && (
                          <button
                            type="button"
                            className="primary-action"
                            onClick={() =>
                              handleTransitionRequest(req.id, "PROCESSING")
                            }
                          >
                            Start Processing
                          </button>
                        )}

                        {req.state === "PROCESSING" && (
                          <button
                            type="button"
                            className="primary-action ready-btn"
                            onClick={() =>
                              handleTransitionRequest(req.id, "READY")
                            }
                          >
                            Mark Ready for Pickup
                          </button>
                        )}

                        {req.state === "READY" && (
                          <button
                            type="button"
                            className="primary-action complete-btn"
                            onClick={() =>
                              handleTransitionRequest(req.id, "COMPLETED")
                            }
                          >
                            Fulfill & Complete
                          </button>
                        )}

                        {req.state === "CUSTOMER_ACTION_REQUIRED" && (
                          <span className="waiting-customer-pill">
                            Waiting for customer to accept quote…
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Store QR & Poster */}
          {activeTab === "qr" && selectedStore && (
            <div className="qr-tab-content">
              <div className="qr-tab-header">
                <h2>Store QR & Counter Poster</h2>
                <p>
                  Print and place this QR poster at your shop counter. Customers scan it to open your exact store.
                </p>
              </div>

              <div className="qr-tab-card">
                <div className="qr-card-details">
                  <h3>{selectedStore.displayName}</h3>
                  <p>Permanent Store Code: <strong>{selectedStore.storeCode || selectedStore.slug}</strong></p>
                  <p>Customer URL: <code>https://sprint.abh1.xyz/s/{selectedStore.storeCode || selectedStore.slug}</code></p>
                  <div className="qr-actions-row">
                    <button
                      type="button"
                      className="primary-action"
                      onClick={() => setShowPoster(true)}
                    >
                      <Printer size={16} /> Open Printable Counter Poster
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3: Catalog & Stock */}
          {activeTab === "catalog" && selectedStore && (
            <div className="catalog-tab-content">
              <h2>Services & Stationery Inventory</h2>
              <p>Manage items available to customers when they scan your store QR.</p>

              <div className="catalog-section">
                <h3>Store Services</h3>
                <div className="catalog-table-wrap">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Price Mode</th>
                        <th>Standard Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedStore.services || [
                        { id: "1", name: "Document Scanning", priceMode: "STARTING_AT", priceMinor: 1000 },
                        { id: "2", name: "Spiral Binding", priceMode: "FIXED", priceMinor: 4000 },
                        { id: "3", name: "Document Lamination", priceMode: "FIXED", priceMinor: 2500 },
                      ]).map((srv) => (
                        <tr key={srv.id}>
                          <td><strong>{srv.name}</strong></td>
                          <td><code>{srv.priceMode}</code></td>
                          <td>{money(srv.priceMinor, selectedStore.currency)}</td>
                          <td><span className="badge-active">Enabled</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="catalog-section">
                <h3>Stationery Stock</h3>
                <div className="catalog-table-wrap">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Unit Price</th>
                        <th>Inventory</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedStore.products || [
                        { id: "p1", name: "Classmate Notebook (160 Pages)", category: "Notebooks", priceMinor: 6500, inventoryCount: 45 },
                        { id: "p2", name: "Reynolds Ballpoint Pen (Blue)", category: "Pens", priceMinor: 1000, inventoryCount: 150 },
                        { id: "p3", name: "Camlin Highlighter Set", category: "Markers", priceMinor: 12000, inventoryCount: 18 },
                        { id: "p4", name: "Fevicol MR Adhesive (50g)", category: "Adhesives", priceMinor: 2500, inventoryCount: 30 },
                      ]).map((prod) => (
                        <tr key={prod.id}>
                          <td><strong>{prod.name}</strong></td>
                          <td>{prod.category}</td>
                          <td>{money(prod.priceMinor, selectedStore.currency)}</td>
                          <td>
                            <span className="stock-count-badge">
                              {prod.inventoryCount} in stock
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Windows Terminals */}
          {activeTab === "devices" && selectedStore && (
            <div className="devices-tab-content">
              <div className="devices-header">
                <h2>Windows Merchant Terminals</h2>
                <p>
                  Connect your store's Windows desktop PC to enable automatic printing straight to your local printer spooler.
                </p>
              </div>

              <div className="pair-card">
                <h3>Pair New Windows Terminal</h3>
                <p>
                  Open the Sprint Merchant application on your Windows PC and click <strong>Get Pairing Code</strong>. Enter the 7-character code below:
                </p>

                <form className="pair-form" onSubmit={handlePairDevice}>
                  <div className="pair-input-group">
                    <input
                      type="text"
                      maxLength={7}
                      placeholder="e.g. H7K9-Q2"
                      value={pairingCode}
                      onChange={(e) =>
                        setPairingCode(e.target.value.toUpperCase())
                      }
                    />
                    <button
                      type="submit"
                      className="primary-action"
                      disabled={pairingLoading || !pairingCode.trim()}
                    >
                      {pairingLoading ? (
                        <>
                          <LoaderCircle className="spin" size={16} /> Pairing…
                        </>
                      ) : (
                        "Confirm Terminal Pairing"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="paired-devices-section">
                <h3>Connected Devices for {selectedStore.displayName}</h3>
                {(selectedStore.devices || []).length === 0 ? (
                  <div className="empty-devices-box">
                    <Laptop size={32} />
                    <p>No Windows terminals currently paired to this store.</p>
                  </div>
                ) : (
                  <div className="device-cards-grid">
                    {selectedStore.devices.map((dev) => (
                      <div key={dev.id} className="device-card">
                        <div className="device-card-header">
                          <Laptop size={20} />
                          <strong>{dev.name}</strong>
                        </div>
                        <p>ID: <code>{dev.id}</code></p>
                        <span className="badge-online">Online / Ready</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Propose Quote Modal */}
      {quoteModal && (
        <div className="modal-overlay" onClick={() => setQuoteModal(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h3>Propose Service Quote</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setQuoteModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProposeQuote}>
              <div className="modal-body">
                <p>
                  Provide a firm quote for: <strong>{quoteModal.item.title}</strong>
                </p>

                <label className="stacked">
                  Quote Amount (INR ₹)
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="e.g. 75"
                    value={quoteAmount}
                    onChange={(e) => setQuoteAmount(e.target.value)}
                    required
                  />
                </label>

                <label className="stacked">
                  Notes / Explanation for Customer
                  <input
                    type="text"
                    placeholder="e.g. ₹50 for 10 pages scanning + ₹25 email dispatch"
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                  />
                </label>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setQuoteModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-action">
                  Send Quote to Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Poster Modal */}
      {showPoster && selectedStore && (
        <StorePosterModal
          store={selectedStore}
          onClose={() => setShowPoster(false)}
        />
      )}
    </div>
  );
}
