import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, X } from "lucide-react";

export function StorePosterModal({ store, onClose }) {
  const [qrUrl, setQrUrl] = useState("");
  const storeUrl = `https://sprint.abh1.xyz/s/${store.storeCode || store.slug}`;

  useEffect(() => {
    QRCode.toDataURL(storeUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: "#0c1c32",
        light: "#ffffff",
      },
    })
      .then(setQrUrl)
      .catch(console.error);
  }, [storeUrl]);

  function handleDownloadPng() {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `sprint-qr-${store.storeCode || store.slug}.png`;
    a.click();
  }

  function handlePrintPoster() {
    window.print();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card poster-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <h3>Store QR & Poster</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="poster-preview-container print-area">
          <div className="store-poster">
            <div className="poster-header">
              <span className="poster-brand">SPRINT</span>
              <h2>{store.displayName}</h2>
              <span className="poster-code-badge">STORE CODE: {store.storeCode || store.slug}</span>
            </div>

            <div className="poster-messages">
              <p>• Need a fast print?</p>
              <p>• Need scanning, lamination or binding?</p>
              <p>• Need stationery essentials?</p>
            </div>

            <div className="poster-callout">
              <strong>SCAN TO ORDER</strong>
              <small>Skip the counter queue</small>
            </div>

            <div className="poster-qr-wrapper">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR Code for ${store.displayName}`} className="poster-qr-img" />
              ) : (
                <div className="qr-placeholder" />
              )}
            </div>

            <div className="poster-url">
              <code>{storeUrl}</code>
            </div>

            <div className="poster-footer">
              <strong>sprint by abh1</strong>
              <span>Neighborhood print operating layer</span>
            </div>
          </div>
        </div>

        <div className="modal-actions-bar no-print">
          <button
            type="button"
            className="secondary-action"
            onClick={handleDownloadPng}
          >
            <Download size={16} /> Download QR PNG
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={handlePrintPoster}
          >
            <Printer size={16} /> Print Store Poster
          </button>
        </div>
      </div>
    </div>
  );
}
