import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  FileText,
  LoaderCircle,
  Minus,
  Paperclip,
  PenTool,
  Plus,
  Printer,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { createCustomerRequest, newKey } from "../api";
import { money } from "./BrandMark";
import { SMART_CROSS_SELLS } from "../recommendations";

export function CartDrawer({ shop, sessionToken, onOrderCreated }) {
  const {
    items,
    removeItem,
    updateQuantity,
    addItem,
    clearCart,
    totalMinor,
    itemCount,
    isOpen,
    setIsOpen,
  } = useCart();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("COUNTER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleCheckout(e) {
    e.preventDefault();
    if (items.length === 0) {
      setError("Your cart is empty.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const attachmentIds = items
        .filter((i) => i.itemType === "PRINT" && i.attachmentId)
        .map((i) => i.attachmentId);

      const requestItems = items.map((i) => ({
        itemType: i.itemType,
        serviceId: i.serviceId || null,
        productId: i.productId || null,
        title: i.title,
        quantity: i.quantity || 1,
        unitPriceMinor: i.unitPriceMinor || 0,
        totalPriceMinor: i.totalPriceMinor || 0,
        detailsJson: {
          notes: i.notes || null,
          print: i.print || null,
          priceMode: i.priceMode || null,
        },
      }));

      // Determine legacy type field for backward compatibility
      const hasPrint = items.some((i) => i.itemType === "PRINT");
      const legacyType = hasPrint ? "PRINT" : "SERVICE";
      const firstPrintItem = items.find((i) => i.itemType === "PRINT");

      const payload = {
        storeCode: shop.storeCode || shop.slug,
        shopSlug: shop.slug,
        type: legacyType,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        attachmentIds,
        items: requestItems,
        print: firstPrintItem?.print || undefined,
      };

      const result = await createCustomerRequest(payload, sessionToken, newKey());
      clearCart();
      setIsOpen(false);
      onOrderCreated(result.request || result);
    } catch (err) {
      setError(err.message || "Failed to submit request to store.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleQuickCrossSell(cross) {
    if (cross.serviceId) {
      addItem({
        itemType: "SERVICE",
        serviceId: cross.serviceId,
        title: cross.title,
        quantity: 1,
        unitPriceMinor: cross.priceMinor,
        totalPriceMinor: cross.priceMinor,
        notes: "Cross-sell added in checkout drawer",
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
    <div className="drawer-overlay" onClick={() => setIsOpen(false)}>
      <div
        className="drawer-panel premier-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Sprint Shopping Cart"
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <h3>Your Sprint Cart</h3>
            <span className="cart-badge">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <button
            type="button"
            className="icon-button close-btn"
            onClick={() => setIsOpen(false)}
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="empty-cart-state">
            <ShoppingBag size={48} className="empty-icon" />
            <h4>Your cart is empty</h4>
            <p>
              Add print jobs, document services, or stationery from {shop.displayName} to submit them in a single order.
            </p>
            <button
              type="button"
              className="primary-action"
              onClick={() => setIsOpen(false)}
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <form className="cart-form" onSubmit={handleCheckout}>
            <div className="cart-items-scroll">
              <div className="store-reminder">
                <span>Ordering from:</span>
                <strong>{shop.displayName}</strong>
                <small className="store-pill">Code: {shop.storeCode || shop.slug}</small>
              </div>

              {/* Items List */}
              <div className="cart-items-list">
                {items.map((item) => (
                  <div key={item.id} className="cart-item-row premier-card">
                    <div className="cart-item-icon">
                      {item.itemType === "PRINT" && <Printer size={20} />}
                      {item.itemType === "SERVICE" && <FileText size={20} />}
                      {item.itemType === "STATIONERY" && <ShoppingBag size={20} />}
                    </div>

                    <div className="cart-item-details">
                      <strong>{item.title}</strong>
                      <span className="unit-price">
                        {item.priceMode === "QUOTE"
                          ? "Quote required"
                          : `${money(item.unitPriceMinor, shop.currency)} each`}
                      </span>

                      <div className="cart-qty-row">
                        {item.itemType === "STATIONERY" && (
                          <div className="mini-qty">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              aria-label="Decrease quantity"
                            >
                              <Minus size={12} />
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              aria-label="Increase quantity"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        )}
                        <span className="item-subtotal">
                          {item.priceMode === "QUOTE"
                            ? "Awaiting Quote"
                            : money(item.totalPriceMinor, shop.currency)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="icon-button remove-btn"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Intelligent Cross-sell Suggestions in Cart */}
              <div className="cart-cross-sell-section">
                <div className="cross-sell-header">
                  <Sparkles size={15} />
                  <span>People also added to this ticket:</span>
                </div>
                <div className="cross-sell-carousel">
                  {SMART_CROSS_SELLS.slice(0, 3).map((cs) => (
                    <div key={cs.id} className="cart-cross-pill">
                      <div className="cross-pill-text">
                        <strong>{cs.title}</strong>
                        <span>{money(cs.priceMinor, shop.currency)}</span>
                      </div>
                      <button
                        type="button"
                        className="mini-add-cross"
                        onClick={() => handleQuickCrossSell(cs)}
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Details */}
              <div className="checkout-fields">
                <h4>Customer Details (Optional)</h4>
                <div className="fields-grid">
                  <label>
                    Your Name
                    <input
                      type="text"
                      placeholder="e.g. Rahul Sharma"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </label>
                </div>

                <h4>Payment Preference</h4>
                <div className="payment-options-grid">
                  <label className={`payment-card ${paymentMethod === "COUNTER" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COUNTER"
                      checked={paymentMethod === "COUNTER"}
                      onChange={() => setPaymentMethod("COUNTER")}
                    />
                    <div className="payment-card-body">
                      <Wallet size={20} />
                      <div>
                        <strong>Pay at Counter</strong>
                        <small>Pay with cash or UPI when picking up</small>
                      </div>
                    </div>
                  </label>

                  <label className={`payment-card ${paymentMethod === "ONLINE" ? "selected" : ""}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="ONLINE"
                      checked={paymentMethod === "ONLINE"}
                      onChange={() => setPaymentMethod("ONLINE")}
                    />
                    <div className="payment-card-body">
                      <CreditCard size={20} />
                      <div>
                        <strong>Instant Online Pay</strong>
                        <small>Pay now securely via UPI / Netbanking</small>
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="drawer-footer">
              <div className="cart-total-row">
                <span>Estimated Total</span>
                <strong>{money(totalMinor, shop.currency)}</strong>
              </div>

              {error && (
                <p className="error" role="alert">
                  <AlertCircle size={16} /> {error}
                </p>
              )}

              <button
                type="submit"
                className="primary-action checkout-submit-btn"
                disabled={submitting || shop.operationalStatus === "SUSPENDED_BY_ABH1" || shop.operationalStatus === "PAUSED_BY_MERCHANT"}
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="spin" size={18} /> Submitting to Shop…
                  </>
                ) : (
                  <>
                    Submit Request to Shop <ArrowRight size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
