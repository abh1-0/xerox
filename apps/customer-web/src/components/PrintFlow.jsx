import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  Upload,
  X,
} from "lucide-react";
import { uploadAttachment } from "../api";
import { useCart } from "../context/CartContext";
import { money } from "./BrandMark";
import { calculatePrintPrice } from "@sprint/contracts";

export function PrintFlow({ shop, sessionToken, onBack, onGoToCart }) {
  const { addItem } = useCart();
  const [file, setFile] = useState(null);
  const [uploadState, setUploadState] = useState("idle");
  const [error, setError] = useState("");
  const [addedNotice, setAddedNotice] = useState(false);

  const [options, setOptions] = useState({
    pageRange: "all",
    copies: 1,
    colorMode: "BW",
    paperSize: "A4",
    sides: "SINGLE",
    orientation: "AUTO",
    scaleMode: "FIT",
  });

  const rates = useMemo(
    () => ({
      A4_BW_SINGLE: 200,
      A4_BW_DUPLEX: 300,
      A4_COLOR_SINGLE: 1000,
      A4_COLOR_DUPLEX: 1500,
      A3_BW_SINGLE: 500,
      A3_BW_DUPLEX: 800,
      A3_COLOR_SINGLE: 2000,
      A3_COLOR_DUPLEX: 3000,
      LEGAL_BW_SINGLE: 250,
      LEGAL_BW_DUPLEX: 350,
      LEGAL_COLOR_SINGLE: 1200,
      LEGAL_COLOR_DUPLEX: 1800,
    }),
    []
  );

  const pageCount = file?.pageCount || 1;

  const priceCalculation = useMemo(() => {
    try {
      let selectedPages = pageCount;
      if (options.pageRange !== "all" && options.pageRange.trim()) {
        selectedPages = options.pageRange.split(",").reduce((sum, part) => {
          const trimmed = part.trim();
          if (trimmed.includes("-")) {
            const [start, end] = trimmed.split("-").map(Number);
            return sum + (end >= start ? end - start + 1 : 1);
          }
          return sum + 1;
        }, 0);
      }

      const total = calculatePrintPrice(
        {
          pages: Math.max(1, selectedPages),
          copies: Math.max(1, Number(options.copies) || 1),
          colorMode: options.colorMode,
          paperSize: options.paperSize,
          sides: options.sides,
        },
        rates
      );

      return {
        selectedPages: Math.max(1, selectedPages),
        totalMinor: total,
      };
    } catch {
      return { selectedPages: 1, totalMinor: 200 };
    }
  }, [options, pageCount, rates]);

  async function handleFileSelect(selected) {
    if (!selected) return;
    setError("");
    setAddedNotice(false);
    setUploadState("uploading");
    try {
      const result = await uploadAttachment(
        selected,
        shop.storeCode || shop.slug,
        sessionToken
      );
      setFile(result);
      setUploadState("done");
    } catch (err) {
      setError(err.message || "Failed to upload document");
      setFile(null);
      setUploadState("idle");
    }
  }

  function handleAddToCart() {
    if (!file?.id) {
      setError("Please select and upload a document first.");
      return;
    }

    const title = `${file.originalName || "Document"} (${priceCalculation.selectedPages} pg · ${options.colorMode === "BW" ? "B&W" : "Color"} · ${options.sides === "DUPLEX" ? "2-sided" : "1-sided"})`;

    addItem({
      itemType: "PRINT",
      title,
      quantity: Number(options.copies) || 1,
      unitPriceMinor: Math.round(priceCalculation.totalMinor / (Number(options.copies) || 1)),
      totalPriceMinor: priceCalculation.totalMinor,
      attachmentId: file.id,
      print: {
        ...options,
        selectedPageCount: priceCalculation.selectedPages,
        filename: file.originalName,
      },
    });

    setAddedNotice(true);
  }

  return (
    <div className="flow print-flow-container">
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to {shop.displayName}
      </button>

      <div className="flow-header">
        <div className="service-icon">
          <Printer size={28} />
        </div>
        <div>
          <h1>Print a document</h1>
          <p>Instant spooler printing at {shop.displayName}. Configure options below.</p>
        </div>
      </div>

      <section className="file-slot">
        <input
          id="document-upload"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => handleFileSelect(e.target.files?.[0])}
        />
        {!file ? (
          <label htmlFor="document-upload">
            <Upload size={28} />
            <strong>Select or drop your document</strong>
            <span>PDF, JPG, or PNG · up to 25 MB</span>
          </label>
        ) : (
          <div className="file-row">
            <FileText size={26} aria-hidden="true" />
            <div>
              <strong>{file.originalName || file.name}</strong>
              <span>
                {file.pageCount
                  ? `${file.pageCount} page${file.pageCount === 1 ? "" : "s"} · `
                  : ""}
                {file.mimeType || file.type || "Document"}
              </span>
            </div>
            {uploadState === "uploading" ? (
              <LoaderCircle className="spin" aria-label="Uploading" />
            ) : (
              <button
                type="button"
                className="icon-button"
                aria-label="Remove document"
                onClick={() => {
                  setFile(null);
                  setUploadState("idle");
                  setAddedNotice(false);
                }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
      </section>

      {error && (
        <p className="error" role="alert">
          <CircleAlert size={17} /> {error}
        </p>
      )}

      {file && (
        <div className="print-options">
          <div className="form-section">
            <h2>Color & Sides</h2>
            <div className="option-grid">
              <fieldset>
                <legend>Color Mode</legend>
                <div className="segmented">
                  <button
                    type="button"
                    className={options.colorMode === "BW" ? "selected" : ""}
                    onClick={() => setOptions({ ...options, colorMode: "BW" })}
                  >
                    B&W (₹2/p)
                  </button>
                  <button
                    type="button"
                    className={options.colorMode === "COLOR" ? "selected" : ""}
                    onClick={() => setOptions({ ...options, colorMode: "COLOR" })}
                  >
                    Colour (₹10/p)
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend>Print Sides</legend>
                <div className="segmented">
                  <button
                    type="button"
                    className={options.sides === "SINGLE" ? "selected" : ""}
                    onClick={() => setOptions({ ...options, sides: "SINGLE" })}
                  >
                    Single-sided
                  </button>
                  <button
                    type="button"
                    className={options.sides === "DUPLEX" ? "selected" : ""}
                    onClick={() => setOptions({ ...options, sides: "DUPLEX" })}
                  >
                    Double-sided
                  </button>
                </div>
              </fieldset>
            </div>
          </div>

          <div className="form-section">
            <h2>Paper & Quantity</h2>
            <div className="option-grid">
              <label>
                Paper Size
                <select
                  value={options.paperSize}
                  onChange={(e) =>
                    setOptions({ ...options, paperSize: e.target.value })
                  }
                >
                  <option value="A4">A4 (Standard)</option>
                  <option value="A3">A3 (Large)</option>
                  <option value="LEGAL">Legal (Documents)</option>
                </select>
              </label>

              <label>
                Copies
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={options.copies}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      copies: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                />
              </label>
            </div>
          </div>

          <div className="form-section">
            <h2>Page Range</h2>
            <div className="stacked">
              <label htmlFor="page-range-input">Pages to print</label>
              <input
                id="page-range-input"
                type="text"
                placeholder="all or e.g. 1-3, 5"
                value={options.pageRange}
                onChange={(e) =>
                  setOptions({ ...options, pageRange: e.target.value })
                }
              />
              <span className="helper-text">
                Leave "all" or specify exact pages like "1-5, 8".
              </span>
            </div>
          </div>

          <div className="price-slip">
            <span>Estimated Total ({priceCalculation.selectedPages} pgs × {options.copies} copies)</span>
            <strong>{money(priceCalculation.totalMinor, shop.currency)}</strong>
            <small>Authoritative price verified by Sprint before submission</small>
          </div>

          {addedNotice ? (
            <div className="added-notice-card">
              <div className="notice-content">
                <CheckCircle2 size={20} className="success-icon" />
                <div>
                  <strong>Added to your Sprint Cart!</strong>
                  <p>You can add document services or stationery before checking out.</p>
                </div>
              </div>
              <div className="notice-actions">
                <button
                  type="button"
                  className="secondary-action"
                  onClick={onBack}
                >
                  Continue Shopping
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
            <button
              type="button"
              className="primary-action full-width"
              onClick={handleAddToCart}
            >
              <Plus size={18} /> Add Print to Cart ({money(priceCalculation.totalMinor, shop.currency)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
