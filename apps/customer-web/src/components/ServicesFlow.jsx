import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  HelpCircle,
  Plus,
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
    },
    {
      id: "srv-bind",
      name: "Spiral Binding",
      description: "Clear plastic front, heavy back sheet, up to 100 pages",
      priceMode: "FIXED",
      priceMinor: 4000,
    },
    {
      id: "srv-lam",
      name: "Document Lamination",
      description: "Waterproof protective thermal lamination for A4 documents",
      priceMode: "FIXED",
      priceMinor: 2500,
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
          <p>Request counter and document services fulfilled by {shop.displayName}.</p>
        </div>
      </div>

      {!selectedService ? (
        <div className="service-selection-list">
          {services.map((item) => (
            <div
              key={item.id}
              className="service-card"
              onClick={() => {
                setSelectedService(item);
                setQuantity(1);
                setNotes("");
                setAddedNotice(false);
              }}
            >
              <div className="service-card-info">
                <strong>{item.name}</strong>
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
        <div className="service-config-box">
          <div className="selected-service-header">
            <h3>{selectedService.name}</h3>
            <p>{selectedService.description}</p>
            <span className="price-badge">
              {selectedService.priceMode === "FIXED" && `Price: ${money(selectedService.priceMinor, shop.currency)} each`}
              {selectedService.priceMode === "STARTING_AT" && `From ${money(selectedService.priceMinor, shop.currency)} each`}
              {selectedService.priceMode === "QUOTE" && "Merchant will send quote"}
              {selectedService.priceMode === "FREE" && "Free"}
            </span>
          </div>

          <div className="form-section">
            <div className="option-grid">
              <label>
                Quantity / Number of items
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                />
              </label>

              <div className="notes-field stacked">
                <label htmlFor="service-notes">Special instructions (optional)</label>
                <input
                  id="service-notes"
                  type="text"
                  placeholder="e.g. 100 pages, black plastic coil"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </div>

          {selectedService.priceMode === "QUOTE" && (
            <div className="assist-disclaimer">
              <Sparkles size={18} />
              <span>
                This service requires custom pricing. The merchant will review your request and send a quote directly to your screen before work starts.
              </span>
            </div>
          )}

          {addedNotice ? (
            <div className="added-notice-card">
              <div className="notice-content">
                <CheckCircle2 size={20} className="success-icon" />
                <div>
                  <strong>Service added to your Sprint Cart!</strong>
                  <p>You can add prints or stationery to the same order.</p>
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
                  Choose Another Service
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
            <div className="modal-actions-row">
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
                <Plus size={18} /> Add to Cart (
                {selectedService.priceMode === "QUOTE"
                  ? "Quote Request"
                  : money(selectedService.priceMinor * quantity, shop.currency)}
                )
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
