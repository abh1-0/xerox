import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  FileText,
  LoaderCircle,
  MapPin,
  Printer,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  fetchCustomerRequest,
  payCounter,
  payDevelopment,
  respondToQuote,
} from "../api";
import { BrandMark, money } from "./BrandMark";
import { statusLabel } from "@sprint/contracts";

export function OrderStatusPage({
  requestId,
  sessionToken,
  initialRequest,
  onNavigate,
}) {
  const [request, setRequest] = useState(initialRequest || null);
  const [loading, setLoading] = useState(!initialRequest);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchCustomerRequest(requestId, sessionToken);
        if (!cancelled && data?.request) {
          setRequest(data.request);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load order details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [requestId, sessionToken]);

  async function handleAcceptQuote(quoteId) {
    setActionLoading(true);
    try {
      const res = await respondToQuote(requestId, quoteId, "ACCEPT", sessionToken);
      if (res?.request) setRequest(res.request);
    } catch (err) {
      setError(err.message || "Failed to accept quote");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectQuote(quoteId) {
    setActionLoading(true);
    try {
      const res = await respondToQuote(requestId, quoteId, "REJECT", sessionToken);
      if (res?.request) setRequest(res.request);
    } catch (err) {
      setError(err.message || "Failed to decline quote");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOnlinePayment() {
    setActionLoading(true);
    try {
      const res = await payDevelopment(requestId, sessionToken);
      if (res?.request) setRequest(res.request);
    } catch (err) {
      setError(err.message || "Payment simulation failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCounterPayment() {
    setActionLoading(true);
    try {
      const res = await payCounter(requestId, sessionToken);
      if (res?.request) setRequest(res.request);
    } catch (err) {
      setError(err.message || "Failed to set counter payment");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading && !request) {
    return (
      <div className="loading-screen">
        <LoaderCircle className="spin" size={36} />
        <p>Loading your Sprint request…</p>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="fatal">
        <h2>Order Not Found</h2>
        <p>Could not find active request with ID: {requestId}</p>
        <button
          type="button"
          className="primary-action"
          onClick={() => onNavigate("/")}
        >
          Return to Home
        </button>
      </div>
    );
  }

  const stages = [
    "SUBMITTED",
    "ACCEPTED",
    "PROCESSING",
    "READY",
    "COMPLETED",
  ];
  const position = stages.indexOf(request.state);

  const pendingQuote = request.quotes?.find((q) => q.status === "PROPOSED");

  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark onClick={() => onNavigate("/")} />
        <div className="live-chip">
          <i /> Live tracking
        </div>
      </header>

      <main className="flow tracking-flow">
        <div className="order-header-card">
          <div className="order-header-top">
            <span className="order-num-pill">{request.requestNumber}</span>
            <span className={`state-pill state-${request.state?.toLowerCase()}`}>
              {statusLabel(request.state)}
            </span>
          </div>

          <h2>{request.shop?.displayName || "Sprint Store"}</h2>
          <p className="order-shop-code">
            <MapPin size={14} /> Store Code:{" "}
            <strong>{request.shop?.storeCode || request.shopSlug}</strong>
          </p>

          <div className="order-summary-row">
            <div>
              <span>Total Amount</span>
              <strong>{money(request.amountMinor, request.currency)}</strong>
            </div>
            <div>
              <span>Payment</span>
              <strong className="payment-status">
                {request.paymentMethod === "COUNTER"
                  ? "Pay at Counter"
                  : request.paymentStatus === "COMPLETED"
                  ? "Paid Online"
                  : "Awaiting Payment"}
              </strong>
            </div>
          </div>
        </div>

        {/* Quote Proposal Alert */}
        {pendingQuote && (
          <div className="quote-alert-card">
            <div className="quote-alert-header">
              <Sparkles size={20} className="sparkle-icon" />
              <div>
                <strong>Quote Received from Shop</strong>
                <p>The merchant has provided pricing for your service request.</p>
              </div>
            </div>

            <div className="quote-details-box">
              <div className="quote-amount-display">
                <span>Proposed Amount</span>
                <h3>{money(pendingQuote.amountMinor, request.currency)}</h3>
              </div>
              {pendingQuote.breakdownJson?.notes && (
                <p className="quote-notes">
                  Note: "{pendingQuote.breakdownJson.notes}"
                </p>
              )}
            </div>

            <div className="quote-action-btns">
              <button
                type="button"
                className="secondary-action"
                disabled={actionLoading}
                onClick={() => handleRejectQuote(pendingQuote.id)}
              >
                Decline Quote
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={actionLoading}
                onClick={() => handleAcceptQuote(pendingQuote.id)}
              >
                Accept Quote ({money(pendingQuote.amountMinor, request.currency)})
              </button>
            </div>
          </div>
        )}

        {/* Awaiting Payment Action */}
        {request.state === "AWAITING_PAYMENT" && (
          <div className="payment-alert-card">
            <div className="payment-alert-header">
              <CreditCard size={20} />
              <div>
                <strong>Payment Required</strong>
                <p>Complete payment or confirm counter settlement.</p>
              </div>
            </div>

            <div className="payment-alert-actions">
              <button
                type="button"
                className="primary-action"
                disabled={actionLoading}
                onClick={handleOnlinePayment}
              >
                <CreditCard size={16} /> Pay Online ({money(request.amountMinor, request.currency)})
              </button>
              <button
                type="button"
                className="secondary-action"
                disabled={actionLoading}
                onClick={handleCounterPayment}
              >
                <Wallet size={16} /> Pay in Cash / UPI at Counter
              </button>
            </div>
          </div>
        )}

        {/* Live Progress Rail */}
        <section className="status-rail">
          <h3>Progress Rail</h3>
          <p>
            {request.state === "SUBMITTED"
              ? "Your request has been received by the store queue."
              : request.state === "ACCEPTED"
              ? "The store accepted your request and will process it shortly."
              : request.state === "PROCESSING"
              ? "Your request is currently being printed or prepared."
              : request.state === "READY"
              ? "Your order is ready! Walk up to the counter to collect."
              : request.state === "COMPLETED"
              ? "This request has been completed. Thank you!"
              : "Status: " + statusLabel(request.state)}
          </p>

          <ol>
            {stages.map((stage, idx) => {
              const isPastOrCurrent = position !== -1 && position >= idx;
              const isCurrent = position === idx;
              return (
                <li
                  key={stage}
                  className={`${isPastOrCurrent ? "done" : ""} ${isCurrent ? "current" : ""}`}
                >
                  <span>
                    {isPastOrCurrent ? (
                      <CheckCircle2 size={18} />
                    ) : (
                      <Clock3 size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{statusLabel(stage)}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Itemized Breakdown */}
        <section className="order-items-section">
          <h3>Order Items</h3>
          <div className="order-items-list">
            {(request.items?.length > 0 ? request.items : [
              {
                id: "legacy",
                itemType: request.type || "PRINT",
                title: request.type === "PRINT" ? "Document Print" : "Document Service",
                quantity: 1,
                unitPriceMinor: request.amountMinor,
                totalPriceMinor: request.amountMinor,
                status: request.state,
              }
            ]).map((item) => (
              <div key={item.id} className="order-item-card">
                <div className="item-icon-box">
                  {item.itemType === "PRINT" && <Printer size={20} />}
                  {item.itemType === "SERVICE" && <FileText size={20} />}
                  {item.itemType === "STATIONERY" && <ShoppingBag size={20} />}
                </div>

                <div className="item-info">
                  <strong>{item.title}</strong>
                  <span className="item-qty">Qty: {item.quantity}</span>
                  {item.status && (
                    <span className="item-status-pill">{item.status}</span>
                  )}
                </div>

                <div className="item-price">
                  <strong>{money(item.totalPriceMinor, request.currency)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Digital Receipt Trigger */}
        <div className="receipt-trigger-box">
          <button
            type="button"
            className="secondary-action receipt-btn"
            onClick={() => setShowReceipt(!showReceipt)}
          >
            <Receipt size={17} /> {showReceipt ? "Hide Digital Receipt" : "View Digital Receipt"}
          </button>
        </div>

        {showReceipt && (
          <div className="printable-receipt">
            <div className="receipt-header">
              <h4>SPRINT DIGITAL RECEIPT</h4>
              <p>{request.shop?.displayName}</p>
              <small>Store Code: {request.shop?.storeCode || request.shopSlug}</small>
            </div>
            <div className="receipt-divider" />
            <div className="receipt-meta">
              <span>Receipt #: {request.requestNumber}</span>
              <span>Date: {new Date(request.createdAt).toLocaleString()}</span>
              <span>Payment: {request.paymentMethod}</span>
            </div>
            <div className="receipt-divider" />
            <div className="receipt-lines">
              {(request.items || []).map((i) => (
                <div key={i.id} className="receipt-line">
                  <span>{i.title} x{i.quantity}</span>
                  <strong>{money(i.totalPriceMinor, request.currency)}</strong>
                </div>
              ))}
            </div>
            <div className="receipt-divider" />
            <div className="receipt-total-line">
              <strong>TOTAL PAID / DUE:</strong>
              <strong>{money(request.amountMinor, request.currency)}</strong>
            </div>
            <p className="receipt-footer">Sprint by abh1 · Thank you for visiting</p>
          </div>
        )}

        <div className="order-action-footer">
          <button
            type="button"
            className="primary-action full-width"
            onClick={() => onNavigate(`/s/${request.shop?.storeCode || request.shopSlug}`)}
          >
            Place Another Order at this Store
          </button>
        </div>
      </main>
    </div>
  );
}
