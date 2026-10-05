import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  HelpCircle,
  LoaderCircle,
  MapPin,
  Paperclip,
  Printer,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { api, API_URL, DEMO_MODE, newKey } from "./api";
import { calculatePrintPrice, statusLabel } from "@sprint/contracts";

const sessionStorageKey = "sprint.customer.session";
const shopSlug =
  location.pathname.match(/^\/s\/([^/]+)/)?.[1] ||
  import.meta.env.VITE_DEFAULT_SHOP_SLUG ||
  "abh1-demo";
const money = (minor, currency = "INR") =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);

function BrandMark() {
  return (
    <div className="brand" aria-label="Sprint by abh1">
      <span className="brand-grid" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>sprint</span>
      <small>by abh1</small>
    </div>
  );
}

function StatusRail({ request }) {
  const stages = [
    "AWAITING_PAYMENT",
    "PAID",
    "SUBMITTED",
    "ACCEPTED",
    "PROCESSING",
    "READY",
    "COMPLETED",
  ];
  const position = Math.max(0, stages.indexOf(request.state));
  return (
    <section className="status-rail" aria-label="Request progress">
      <p className="request-number">{request.requestNumber}</p>
      <h2 aria-live="polite">{statusLabel(request.state)}</h2>
      <p>
        {request.state === "SUBMITTED"
          ? "Your request is with the shop."
          : request.state === "READY"
            ? "Your order is ready at the counter."
            : "This page updates while the shop works on your request."}
      </p>
      <ol>
        {stages.slice(2).map((stage, index) => (
          <li key={stage} className={position >= index + 2 ? "done" : ""}>
            <span>
              {position >= index + 2 ? (
                <CheckCircle2 size={18} />
              ) : (
                <Clock3 size={18} />
              )}
            </span>
            {statusLabel(stage)}
          </li>
        ))}
      </ol>
    </section>
  );
}

function FileSlot({ file, uploadState, onFile, onRemove }) {
  return (
    <section className="file-slot">
      <input
        id="document"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      {!file ? (
        <label htmlFor="document">
          <Upload size={24} />
          <strong>Add your document</strong>
          <span>PDF, JPG, or PNG · up to 20 MB</span>
        </label>
      ) : (
        <div className="file-row">
          <FileText size={24} aria-hidden="true" />
          <div>
            <strong>{file.originalName || file.name}</strong>
            <span>
              {file.pageCount
                ? `${file.pageCount} page${file.pageCount === 1 ? "" : "s"} · `
                : ""}
              {file.mimeType || file.type}
            </span>
          </div>
          {uploadState === "uploading" ? (
            <LoaderCircle className="spin" aria-label="Uploading" />
          ) : (
            <button
              type="button"
              className="icon-button"
              aria-label="Remove document"
              onClick={onRemove}
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}
      <p className="sr-only" role="status">
        {uploadState === "uploading"
          ? "Uploading document"
          : file
            ? "Document uploaded"
            : "No document selected"}
      </p>
    </section>
  );
}

function PrintRequest({ shop, sessionToken, onCreated, onBack }) {
  const [file, setFile] = useState(null);
  const [uploadState, setUploadState] = useState("idle");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
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
    }),
    [],
  );
  const pageCount = file?.pageCount || 1;
  const price = useMemo(() => {
    try {
      const selected =
        options.pageRange === "all"
          ? pageCount
          : options.pageRange
              .split(",")
              .reduce(
                (count, bit) =>
                  count +
                  (bit.includes("-")
                    ? Math.max(
                        0,
                        Number(bit.split("-")[1]) -
                          Number(bit.split("-")[0]) +
                          1,
                      )
                    : 1),
                0,
              );
      return calculatePrintPrice(
        {
          pages: selected,
          copies: Number(options.copies),
          colorMode: options.colorMode,
          paperSize: options.paperSize,
          sides: options.sides,
        },
        rates,
      );
    } catch {
      return null;
    }
  }, [options, pageCount, rates]);
  async function upload(selected) {
    if (!selected) return;
    setError("");
    setUploadState("uploading");
    try {
      const formData = new FormData();
      formData.set("shopSlug", shop.slug);
      formData.set("file", selected);
      const result = await api("/v1/customer/attachments", {
        method: "POST",
        sessionToken,
        formData,
      });
      setFile(result);
      setUploadState("done");
    } catch (err) {
      setError(err.message);
      setFile(null);
      setUploadState("idle");
    }
  }
  async function createRequest(event) {
    event.preventDefault();
    setError("");
    if (!file?.id) return setError("Upload your document before continuing.");
    setSending(true);
    try {
      const result = await api("/v1/customer/requests", {
        method: "POST",
        sessionToken,
        idempotencyKey: newKey(),
        body: {
          shopSlug: shop.slug,
          type: "PRINT",
          attachmentIds: [file.id],
          print: options,
          paymentTiming: "BEFORE_SUBMISSION",
        },
      });
      onCreated(result.request);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <main className="flow">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to shop
      </button>
      <header className="flow-header">
        <div className="service-icon">
          <Printer size={26} />
        </div>
        <div>
          <h1>Print something</h1>
          <p>
            Set up one document at a time. The shop sees the exact options you
            choose.
          </p>
        </div>
      </header>
      <form onSubmit={createRequest}>
        <FileSlot
          file={file}
          uploadState={uploadState}
          onFile={upload}
          onRemove={() => {
            setFile(null);
            setUploadState("idle");
          }}
        />
        <section className="form-section">
          <h2>Print options</h2>
          <div className="option-grid">
            <label>
              Pages
              <input
                value={options.pageRange}
                onChange={(e) =>
                  setOptions({ ...options, pageRange: e.target.value })
                }
                placeholder="all or 1-3"
              />
            </label>
            <label>
              Copies
              <select
                value={options.copies}
                onChange={(e) =>
                  setOptions({ ...options, copies: Number(e.target.value) })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Colour</legend>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={options.colorMode === "BW"}
                  className={options.colorMode === "BW" ? "selected" : ""}
                  onClick={() => setOptions({ ...options, colorMode: "BW" })}
                >
                  B&W
                </button>
                <button
                  type="button"
                  aria-pressed={options.colorMode === "COLOR"}
                  className={options.colorMode === "COLOR" ? "selected" : ""}
                  onClick={() => setOptions({ ...options, colorMode: "COLOR" })}
                >
                  Colour
                </button>
              </div>
            </fieldset>
            <fieldset>
              <legend>Side</legend>
              <div className="segmented">
                <button
                  type="button"
                  aria-pressed={options.sides === "SINGLE"}
                  className={options.sides === "SINGLE" ? "selected" : ""}
                  onClick={() => setOptions({ ...options, sides: "SINGLE" })}
                >
                  Single
                </button>
                <button
                  type="button"
                  aria-pressed={options.sides === "DUPLEX"}
                  className={options.sides === "DUPLEX" ? "selected" : ""}
                  onClick={() => setOptions({ ...options, sides: "DUPLEX" })}
                >
                  Double
                </button>
              </div>
            </fieldset>
          </div>
        </section>
        <aside className="price-slip">
          <span>
            {file?.pageCount || "—"} pages ·{" "}
            {options.colorMode === "BW" ? "B&W" : "Colour"} · A4
          </span>
          <strong>
            {price
              ? money(price.amountMinor, shop.currency)
              : "Check page range"}
          </strong>
          <small>Final amount is calculated by Sprint’s server.</small>
        </aside>
        {error && (
          <p className="error" role="alert">
            <CircleAlert size={17} /> {error}
          </p>
        )}
        <button
          className="primary-action"
          disabled={sending || uploadState === "uploading"}
        >
          {sending ? <LoaderCircle className="spin" /> : "Review & continue"}
          <ChevronRight size={18} />
        </button>
        <p className="privacy-note">
          <ShieldCheck size={16} /> This document is shared only with{" "}
          {shop.displayName} to fulfil this request and is deleted under
          Sprint’s retention policy.
        </p>
      </form>
    </main>
  );
}

function ServiceRequest({ shop, service, sessionToken, onCreated, onBack }) {
  const [fields, setFields] = useState({});
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      const result = await api("/v1/customer/requests", {
        method: "POST",
        sessionToken,
        idempotencyKey: newKey(),
        body: {
          shopSlug: shop.slug,
          type: "SERVICE",
          attachmentIds: [],
          serviceDefinitionId: service.id,
          fieldValues: fields,
          paymentTiming: service.paymentTiming,
        },
      });
      onCreated(result.request);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }
  return (
    <main className="flow">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={17} /> Back to shop
      </button>
      <header className="flow-header">
        <div className="service-icon">
          <HelpCircle size={26} />
        </div>
        <div>
          <h1>{service.name}</h1>
          <p>{service.description}</p>
        </div>
      </header>
      <div className="assist-disclaimer">
        <ShieldCheck size={18} />
        <span>
          This is assistance from {shop.displayName}, not an official government
          service. Never share passwords, OTPs, PINs, or other authentication
          secrets.
        </span>
      </div>
      <form onSubmit={submit}>
        <section className="form-section">
          <h2>What the shop needs</h2>
          {service.fields.map((field) => (
            <label className="stacked" key={field.id}>
              {field.label}
              {field.type === "CHECKBOX" ? (
                <input
                  type="checkbox"
                  checked={Boolean(fields[field.id])}
                  onChange={(event) =>
                    setFields({ ...fields, [field.id]: event.target.checked })
                  }
                />
              ) : (
                <input
                  required={field.required}
                  value={fields[field.id] || ""}
                  onChange={(event) =>
                    setFields({ ...fields, [field.id]: event.target.value })
                  }
                />
              )}
            </label>
          ))}
        </section>
        {error && (
          <p className="error" role="alert">
            <CircleAlert size={17} /> {error}
          </p>
        )}
        <button className="primary-action" disabled={sending}>
          {sending ? <LoaderCircle className="spin" /> : "Send request"}
          <ChevronRight size={18} />
        </button>
        <p className="privacy-note">
          <ShieldCheck size={16} /> {service.instructions}
        </p>
      </form>
    </main>
  );
}

export default function App() {
  const [sessionToken, setSessionToken] = useState(
    localStorage.getItem(sessionStorageKey),
  );
  const [shop, setShop] = useState(null);
  const [screen, setScreen] = useState("home");
  const [service, setService] = useState(null);
  const [request, setRequest] = useState(null);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(true);
  const webSocket = useRef(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let current = sessionToken;
        if (!current) {
          const created = await api("/v1/customer/sessions", {
            method: "POST",
          });
          current = created.token;
          localStorage.setItem(sessionStorageKey, current);
          if (active) setSessionToken(current);
        }
        const response = await api(`/v1/shops/${shopSlug}`);
        if (active) setShop(response);
      } catch (err) {
        if (active) setError(err.message);
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionToken]);
  useEffect(() => {
    if (!sessionToken || !request?.id) return;
    if (DEMO_MODE) {
      setConnecting(false);
      return;
    }
    let cancelled = false;
    async function connect() {
      try {
        const ticket = await api("/v1/realtime/ticket", { sessionToken });
        const protocol = API_URL.startsWith("https") ? "wss" : "ws";
        const base = API_URL.replace(/^https?/, protocol);
        const socket = new WebSocket(
          `${base}/v1/realtime?ticket=${encodeURIComponent(ticket.ticket)}`,
        );
        webSocket.current = socket;
        socket.onopen = () => !cancelled && setConnecting(false);
        socket.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          if (
            message.type === "request.updated" &&
            message.requestId === request.id
          ) {
            const current = await api(`/v1/customer/requests/${request.id}`, {
              sessionToken,
            });
            if (!cancelled) setRequest(current.request);
          }
        };
        socket.onclose = () => {
          if (!cancelled) {
            setConnecting(true);
            setTimeout(connect, 2000);
          }
        };
      } catch {
        if (!cancelled) setTimeout(connect, 2000);
      }
    }
    connect();
    return () => {
      cancelled = true;
      webSocket.current?.close();
    };
  }, [sessionToken, request?.id]);
  async function payAndSend() {
    try {
      const result = await api(
        `/v1/customer/requests/${request.id}/pay-development`,
        { method: "POST", sessionToken, idempotencyKey: newKey() },
      );
      setRequest(result.request);
      setScreen("status");
    } catch (err) {
      setError(err.message);
    }
  }
  if (error && !shop)
    return (
      <div className="app-shell">
        <header className="topbar">
          <BrandMark />
        </header>
        <main className="fatal">
          <CircleAlert size={28} />
          <h1>Sprint is unavailable</h1>
          <p>{error}</p>
          <button onClick={() => location.reload()}>Try again</button>
        </main>
      </div>
    );
  if (!shop)
    return (
      <div className="loading-screen">
        <BrandMark />
        <LoaderCircle className="spin" aria-label="Loading shop" />
      </div>
    );
  if (screen === "print")
    return (
      <div className="app-shell">
        <header className="topbar">
          <BrandMark />
          <span className="shop-chip">
            <MapPin size={15} /> {shop.displayName}
          </span>
        </header>
        <PrintRequest
          shop={shop}
          sessionToken={sessionToken}
          onBack={() => setScreen("home")}
          onCreated={(created) => {
            setRequest(created);
            setScreen(created.state === "AWAITING_PAYMENT" ? "pay" : "status");
          }}
        />
      </div>
    );
  if (screen === "service")
    return (
      <div className="app-shell">
        <header className="topbar">
          <BrandMark />
          <span className="shop-chip">
            <MapPin size={15} /> {shop.displayName}
          </span>
        </header>
        <ServiceRequest
          shop={shop}
          service={service}
          sessionToken={sessionToken}
          onBack={() => setScreen("home")}
          onCreated={(created) => {
            setRequest(created);
            setScreen("status");
          }}
        />
      </div>
    );
  if (screen === "pay")
    return (
      <div className="app-shell">
        <header className="topbar">
          <BrandMark />
          <span className="shop-chip">
            <MapPin size={15} /> {shop.displayName}
          </span>
        </header>
        <main className="flow payment">
          <button className="back-link" onClick={() => setScreen("print")}>
            <ArrowLeft size={17} /> Change print settings
          </button>
          <h1>One step left</h1>
          <p>
            Pay securely in this development environment, then Sprint sends the
            exact request to the shop.
          </p>
          <div className="receipt">
            <span>{request.requestNumber}</span>
            <strong>{money(request.amountMinor, request.currency)}</strong>
            <p>
              {request.print?.selectedPageCount} pages ·{" "}
              {request.print?.colorMode === "BW" ? "B&W" : "Colour"} ·{" "}
              {request.print?.sides === "DUPLEX"
                ? "Double-sided"
                : "Single-sided"}
            </p>
          </div>
          {error && (
            <p className="error" role="alert">
              <CircleAlert size={17} /> {error}
            </p>
          )}
          <button className="primary-action" onClick={payAndSend}>
            Pay & send to shop <ChevronRight size={18} />
          </button>
          <p className="privacy-note">
            <ShieldCheck size={16} /> Development payment mode is clearly
            isolated from production payment providers.
          </p>
        </main>
      </div>
    );
  if (screen === "status")
    return (
      <div className="app-shell">
        <header className="topbar">
          <BrandMark />
          <span className="live-chip" role="status" aria-live="polite">
            <i /> {connecting ? "Reconnecting…" : "Live"}
          </span>
        </header>
        <main className="flow">
          <StatusRail request={request} />
          <button
            className="secondary-action"
            onClick={() => setScreen("home")}
          >
            Start another request
          </button>
        </main>
      </div>
    );
  return (
    <div className="app-shell">
      <header className="topbar">
        <BrandMark />
        <span className="shop-chip">
          <MapPin size={15} /> {shop.displayName}
        </span>
      </header>
      <main className="home">
        <section className="hero">
          <div className="type-grid" aria-hidden="true">
            <b>S</b>
            <b>P</b>
            <b>R</b>
            <b>I</b>
            <b>N</b>
            <b>T</b>
          </div>
          <p className="availability">
            <i />{" "}
            {shop.status === "OPEN"
              ? "Accepting requests now"
              : "Temporarily paused"}
          </p>
          <h1>What do you need at the counter?</h1>
          <p className="hero-copy">
            Send a print request or ask this shop for document help—without
            waiting in a queue.
          </p>
          <button
            className="primary-action"
            onClick={() => setScreen("print")}
            disabled={shop.status !== "OPEN"}
          >
            <Printer size={19} /> Print something <ChevronRight size={18} />
          </button>
        </section>
        <section className="services">
          <h2>Services at this shop</h2>
          <div className="service-list">
            {shop.services.map((item) => (
              <button
                key={item.id}
                className="service-row"
                onClick={() => {
                  setService(item);
                  setScreen("service");
                }}
                disabled={shop.status !== "OPEN"}
              >
                <span>
                  <HelpCircle size={20} />
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.priceMode === "FIXED"
                      ? `From ${money(item.priceMinor, shop.currency)}`
                      : "Ask the shop for a quote"}
                  </small>
                </div>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </section>
        <footer>
          <Paperclip size={15} /> Your documents are shared only with this shop
          to fulfil your request. <span>sprint by abh1</span>
          {DEMO_MODE && <em>Interactive demo — requests stay in this browser.</em>}
        </footer>
      </main>
    </div>
  );
}
