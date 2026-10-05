import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  HelpCircle,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { money } from "./BrandMark";

export function ServicesFlow({ shop, onBack, onGoToCart }) {
  const { addItem } = useCart();
  const [selectedService, setSelectedService] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [addedNotice, setAddedNotice] = useState(false);

  const services = shop.services || [
    {
      id: "srv-scan",
      name: "Document Scanning",
      description: "High-resolution color scanning to PDF or email",
      priceMode: "STARTING_AT",
      priceMinor: 1000,
      badge: "High-Res PDF",
    },
    {
      id: "srv-bind",
      name: "Spiral Binding",
      description: "Clear plastic front, heavy back sheet, up to 100 pages",
      priceMode: "FIXED",
      priceMinor: 4000,
      badge: "Most Popular",
    },
    {
      id: "srv-lam",
      name: "Document Lamination",
      description: "Waterproof protective thermal lamination for A4 documents",
      priceMode: "FIXED",
      priceMinor: 2500,
      badge: "100 Micron",
    },
  ];

  function handleAddService() {
    if (!selectedService) return;

    const unitPrice = selectedService.priceMode === "QUOTE" ? 0 : selectedService.priceMinor || 0;
    const totalPrice = unitPrice * quantity;

    addItem({
      itemType: "SERVICE",
      serviceId: selectedService.id,
      title: `${selectedService.name} (x${quantity})`,
      quantity,
      unitPriceMinor: unitPrice,
      totalPriceMinor: totalPrice,
      notes: notes.trim(),
      priceMode: selectedService.priceMode,
    });

    setAddedNotice(true);
  }

  return (
    <div className="flow services-flow-container">
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to {shop.displayName}
      </button>

      <div className="flow-header">
        <div className="service-icon service-alt">
          <FileCheck2 size={28} />
        </div>
        <div>
          <h1>Store Services</h1>
          <p>Handled directly at counter by {shop.displayName}. Instant pricing or merchant quote.</p>
        </div>
      </div>

      {!selectedService ? (
        <div className="service-selection-list">
          {services.map((item) => (
            <div
              key={item.id}
              className="service-card premier-card"
              onClick={() => {
                setSelectedService(item);
                setQuantity(1);
                setNotes("");
                setAddedNotice(false);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="service-card-info">
                <div className="service-title-row">
                  <strong>{item.name}</strong>
                  {item.badge && <span className="service-badge">{item.badge}</span>}
                </div>
                <p>{item.description || "Counter document service"}</p>
                <span className="price-tag">
                  {item.priceMode === "FIXED" && money(item.priceMinor, shop.currency)}
                  {item.priceMode === "STARTING_AT" && `From ${money(item.priceMinor, shop.currency)}`}
                  {item.priceMode === "QUOTE" && "Quote provided by shop"}
                  {item.priceMode === "FREE" && "Complimentary"}
                </span>
              </div>
              <ChevronRight size={20} className="chevron" />
            </div>
          ))}
        </div>
      ) : (
        <div className="service-config-box premier-card">
          <div className="selected-service-header">
            <div className="service-title-row">
              <h3>{selectedService.name}</h3>
              {selectedService.badge && (
                <span className="service-badge">{selectedService.badge}</span>
              )}
            </div>
            <p>{selectedService.description}</p>
            <span className="price-badge">
              {selectedService.priceMode === "FIXED" && `Price: ${money(selectedService.priceMinor, shop.currency)} each`}
              {selectedService.priceMode === "STARTING_AT" && `From ${money(selectedService.priceMinor, shop.currency)} each`}
              {selectedService.priceMode === "QUOTE" && "Merchant will send quote"}
              {selectedService.priceMode === "FREE" && "Free"}
            </span>
          </div>

          <div className="service-form">
            <div className="qty-picker">
              <label htmlFor="service-quantity">Quantity / Units</label>
              <div className="counter-row">
                <button
                  type="button"
                  className="counter-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  -
                </button>
                <input
                  id="service-quantity"
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
                <button
                  type="button"
                  className="counter-btn"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <label className="notes-field">
              <span>Specific instructions for merchant (optional)</span>
              <textarea
                rows={3}
                placeholder="e.g. Scan 3 pages front and back, send to email, or use blue cover sheet..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>

            <div className="service-total-slip">
              <span>Subtotal</span>
              <strong>
                {selectedService.priceMode === "QUOTE"
                  ? "Awaiting Quote"
                  : money((selectedService.priceMinor || 0) * quantity, shop.currency)}
              </strong>
            </div>

            {addedNotice ? (
              <div className="added-notice-card">
                <div className="notice-content">
                  <CheckCircle2 size={20} className="success-icon" />
                  <div>
                    <strong>Service added to your order!</strong>
                    <p>Review your cart or add more services.</p>
                  </div>
                </div>
                <div className="notice-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => {
                      setSelectedService(null);
                      setAddedNotice(false);
                    }}
                  >
                    Browse More Services
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    onClick={onGoToCart}
                  >
                    View Cart & Checkout
                  </button>
                </div>
              </div>
            ) : (
              <div className="service-action-buttons">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setSelectedService(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={handleAddService}
                >
                  <Plus size={18} /> Add Service to Cart
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
