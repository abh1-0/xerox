import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  HelpCircle,
  Laptop,
  LoaderCircle,
  MapPin,
  Minus,
  PauseCircle,
  Phone,
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
import { DesktopSetupGuide } from "./DesktopSetupGuide";
import { statusLabel } from "@sprint/contracts";

export function MerchantPortal({ onNavigate }) {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeTab, setActiveTab] = useState("requests"); // "requests" | "guide" | "devices" | "catalog" | "qr"
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
          const filtered = res.requests.filter(
            (r) =>
              !selectedStore.storeCode ||
              r.shop?.storeCode === selectedStore.storeCode ||
              r.shopSlug === selectedStore.slug
          );
          setRequests(filtered);
        }
      } catch (err) {
        // Keep polling
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
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
      setActionNotice(`Request status updated to ${statusLabel(nextState)}`);
      setTimeout(() => setActionNotice(""), 2500);
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
      setActionNotice(`Item status updated to ${nextStatus}`);
      setTimeout(() => setActionNotice(""), 2500);
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
      setActionNotice("Quote proposal sent directly to customer screen!");
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
      setError(err.message || "Failed to pair device. Check the 7-character pairing code.");
    } finally {
      setPairingLoading(false);
    }
  }

  async function handleUpdateStock(product, delta) {
    if (!selectedStore) return;
    const newQty = Math.max(0, (product.inventoryCount || product.quantity || 0) + delta);
    try {
      await saveMerchantProduct(selectedStore.id, {
        id: product.id,
        name: product.name,
        priceMinor: product.priceMinor || product.price_minor,
        category: product.category,
        quantity: newQty,
        trackInventory: true,
      });

      setSelectedStore((prev) => {
        const nextProducts = (prev.products || []).map((p) =>
          p.id === product.id ? { ...p, quantity: newQty, inventoryCount: newQty } : p
        );
        return { ...prev, products: nextProducts };
      });
    } catch (err) {
      setError(err.message || "Failed to update stock");
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
          <span className="portal-badge">Merchant Portal</span>
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
                  <PlayCircle size={16} /> Accepting Orders
                </>
              ) : (
                <>
                  <PauseCircle size={16} /> Orders Paused
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
              Store Code: <strong>{selectedStore?.storeCode || selectedStore?.slug}</strong>
            </p>
            <span className="store-subtext">
              {selectedStore?.address ? `${selectedStore.address}, ` : ""}{selectedStore?.city || "Local merchant"}
            </span>
          </div>

          <nav className="merchant-nav">
            <button
              type="button"
              className={`nav-tab ${activeTab === "requests" ? "active" : ""}`}
              onClick={() => setActiveTab("requests")}
            >
              <Clock3 size={18} /> Live Orders Queue
              {requests.filter((r) => r.state === "SUBMITTED").length > 0 && (
                <span className="queue-pill">
                  {requests.filter((r) => r.state === "SUBMITTED").length}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === "guide" ? "active" : ""}`}
              onClick={() => setActiveTab("guide")}
            >
              <BookOpen size={18} /> Desktop App Guide
            </button>

            <button
              type="button"
              className={`nav-tab ${activeTab === "devices" ? "active" : ""}`}
              onClick={() => setActiveTab("devices")}
            >
              <Laptop size={18} /> Windows Terminals
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
              className={`nav-tab ${activeTab === "qr" ? "active" : ""}`}
              onClick={() => setActiveTab("qr")}
            >
              <QrCode size={18} /> Store QR & Poster
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
                  <h2>Live Orders Queue</h2>
                  <p>Incoming customer orders at {selectedStore?.displayName}.</p>
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
                  <h3>No orders in this queue</h3>
                  <p>
                    {filterState === "NEW"
                      ? "No new pending requests right now."
                      : "When customers submit requests at your counter, they will appear here live with instant status updates."}
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
                            {req.paymentMethod === "PAY_AT_COUNTER" || req.paymentMethod === "COUNTER"
                              ? "Pay at Counter"
                              : req.paymentStatus === "PAID"
                              ? "Paid Online"
                              : "Payment Pending"}
                          </small>
                        </div>
                      </div>

                      {req.customerName && (
                        <div className="m-customer-line">
                          <User size={14} /> Customer: <strong>{req.customerName}</strong>
                          {req.customerPhone && (
                            <span className="customer-phone">
                              <Phone size={12} /> {req.customerPhone}
                            </span>
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
                              {item.itemType === "STATIONERY" || item.itemType === "PRODUCT" ? (
                                <ShoppingBag size={16} />
                              ) : null}
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
                                (item.detailsJson?.priceMode === "QUOTE" || item.detailsJson?.priceMode === "MERCHANT_QUOTE") &&
                                (req.state === "SUBMITTED" || req.state === "AWAITING_QUOTE") && (
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
                        {(req.state === "SUBMITTED" || req.state === "AWAITING_QUOTE") && (
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
                            Mark Ready for Counter Pickup
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
                            Mark Fulfill & Completed
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

          {/* Tab 2: Desktop Setup Guide */}
          {activeTab === "guide" && (
            <DesktopSetupGuide
              store={selectedStore}
              onPairClick={() => setActiveTab("devices")}
            />
          )}

          {/* Tab 3: Windows Terminals */}
          {activeTab === "devices" && selectedStore && (
            <div className="devices-tab-content">
              <div className="devices-header">
                <div>
                  <h2>Windows Merchant Terminals</h2>
                  <p>
                    Connect your shop's Windows PC to enable direct spooler printing to your Xerox and laser printers.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setActiveTab("guide")}
                >
                  <BookOpen size={16} /> Open Setup Guide
                </button>
              </div>

              <div className="pair-card">
                <h3>Pair Windows Counter PC</h3>
                <p>
                  Launch <code>Sprint.Merchant.exe</code> on your Windows PC and click <strong>Get Pairing Code</strong>. Enter the 7-character code displayed on screen:
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
                          <LoaderCircle className="spin" size={16} /> Authorizing…
                        </>
                      ) : (
                        "Confirm Terminal Pairing"
                      )}
                    </button>
                  </div>
                </form>
              </div>

              <div className="paired-devices-section">
                <h3>Paired Devices for {selectedStore.displayName}</h3>
                {(selectedStore.devices || []).length === 0 ? (
                  <div className="empty-devices-box">
                    <Laptop size={32} />
                    <p>No Windows desktop terminals currently paired to this store.</p>
                    <button
                      type="button"
                      className="secondary-action small-btn"
                      onClick={() => setActiveTab("guide")}
                    >
                      Follow 5-Step Desktop Guide
                    </button>
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
                        <span className="badge-online">Connected · Ready to Print</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Catalog & Stock */}
          {activeTab === "catalog" && selectedStore && (
            <div className="catalog-tab-content">
              <h2>Services & Counter Inventory</h2>
              <p>Manage items available to customers when they scan your store QR code.</p>

              <div className="catalog-section">
                <h3>Stationery Counter Stock</h3>
                <div className="catalog-table-wrap">
                  <table className="catalog-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Unit Price</th>
                        <th>Live Inventory</th>
                        <th>Quick Stock Adjust</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedStore.products || []).map((prod) => (
                        <tr key={prod.id}>
                          <td><strong>{prod.name}</strong></td>
                          <td>{prod.category}</td>
                          <td>{money(prod.priceMinor || prod.price_minor, selectedStore.currency)}</td>
                          <td>
                            <span className="stock-count-badge">
                              {prod.inventoryCount ?? prod.quantity ?? 0} in stock
                            </span>
                          </td>
                          <td>
                            <div className="stock-stepper">
                              <button
                                type="button"
                                className="icon-btn-stepper"
                                onClick={() => handleUpdateStock(prod, -5)}
                                title="Reduce stock by 5"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                className="icon-btn-stepper"
                                onClick={() => handleUpdateStock(prod, 5)}
                                title="Add 5 to stock"
                              >
                                +5
                              </button>
                              <button
                                type="button"
                                className="icon-btn-stepper"
                                onClick={() => handleUpdateStock(prod, 20)}
                                title="Add 20 to stock"
                              >
                                +20
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="catalog-section">
                <h3>Document Services</h3>
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
                      {(selectedStore.services || []).map((srv) => (
                        <tr key={srv.id}>
                          <td><strong>{srv.name}</strong></td>
                          <td><code>{srv.priceMode || srv.price_mode}</code></td>
                          <td>{money(srv.priceMinor || srv.price_minor, selectedStore.currency)}</td>
                          <td><span className="badge-active">Active</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5: Store QR & Poster */}
          {activeTab === "qr" && selectedStore && (
            <div className="qr-tab-content">
              <div className="qr-tab-header">
                <h2>Store QR Code & Counter Sign</h2>
                <p>
                  Print and display this counter poster. Customers scan it with any smartphone camera to open your exact store.
                </p>
              </div>

              <div className="qr-tab-card">
                <div className="qr-card-details">
                  <h3>{selectedStore.displayName}</h3>
                  <p>Permanent Store Code: <strong>{selectedStore.storeCode || selectedStore.slug}</strong></p>
                  <p>Canonical Customer URL: <code>https://sprint.abh1.xyz/s/{selectedStore.storeCode || selectedStore.slug}</code></p>
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
