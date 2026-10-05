import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Laptop,
  MonitorCheck,
  Play,
  Printer,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";

export function DesktopSetupGuide({ store, onPairClick }) {
  const [copiedStep, setCopiedStep] = useState(null);

  function copyText(text, stepId) {
    navigator.clipboard?.writeText(text);
    setCopiedStep(stepId);
    setTimeout(() => setCopiedStep(null), 2000);
  }

  const defaultApiUrl = "https://sprint.abh1.xyz/api";

  return (
    <div className="desktop-guide-container">
      <div className="guide-hero-card">
        <div className="guide-hero-icon">
          <Laptop size={32} />
        </div>
        <div>
          <h2>Sprint Windows Terminal Setup Guide</h2>
          <p>
            Connect your shop's Windows PC directly to Sprint Cloud for zero-queue, automatic document spooling to your Xerox and laser printers.
          </p>
        </div>
      </div>

      <div className="guide-steps-list">
        {/* Step 1 */}
        <div className="guide-step-card">
          <div className="step-badge">1</div>
          <div className="step-body">
            <h3>Launch the Windows Merchant Application</h3>
            <p>
              On your counter PC running Windows 10 or 11, launch <code>Sprint.Merchant.exe</code>.
              The application runs as a lightweight native desktop client that interfaces directly with the Windows Print Spooler.
            </p>
            <div className="code-snippet-box">
              <code>apps\merchant-windows\Sprint.Merchant\bin\Debug\net10.0-windows\Sprint.Merchant.exe</code>
              <button
                type="button"
                className="copy-btn"
                onClick={() => copyText("apps\\merchant-windows\\Sprint.Merchant\\bin\\Debug\\net10.0-windows\\Sprint.Merchant.exe", 1)}
              >
                {copiedStep === 1 ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copiedStep === 1 ? "Copied" : "Copy Path"}
              </button>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="guide-step-card">
          <div className="step-badge">2</div>
          <div className="step-body">
            <h3>Generate 7-Character Pairing Code</h3>
            <p>
              In the desktop application window, click the <strong>Settings</strong> button or <strong>Get Pairing Code</strong>.
              The terminal will reach out to Sprint Cloud and display a unique pairing code on screen (format: <code>XXXX-XX</code>, e.g. <code>H7K9-Q2</code>).
            </p>
            <div className="callout-box">
              <Sparkles size={16} />
              <span>
                Make sure the API URL is set to <code>{defaultApiUrl}</code> (or your local development URL <code>http://localhost:8787</code>).
              </span>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="guide-step-card">
          <div className="step-badge">3</div>
          <div className="step-body">
            <h3>Link Device in Merchant Portal</h3>
            <p>
              Return to this Merchant Portal, navigate to the <strong>Windows Terminals</strong> tab, and enter the code displayed on your desktop screen.
            </p>
            <div className="step-action-row">
              <button
                type="button"
                className="primary-action small-btn"
                onClick={onPairClick}
              >
                Go to Terminal Pairing Tab <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="guide-step-card">
          <div className="step-badge">4</div>
          <div className="step-body">
            <h3>Select Counter Printer & Spooler</h3>
            <p>
              Once paired, the Windows terminal will automatically discover all locally connected USB and network printers (HP, Canon, Epson, Brother, Konica Minolta).
              Select your primary counter printer from the dropdown list.
            </p>
            <div className="printer-badges-row">
              <span className="printer-pill"><Printer size={13} /> USB Printers</span>
              <span className="printer-pill"><Printer size={13} /> Network IP Printers</span>
              <span className="printer-pill"><Printer size={13} /> Windows Print Spooler</span>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div className="guide-step-card">
          <div className="step-badge">5</div>
          <div className="step-body">
            <h3>Fulfil Print Requests in 1 Click</h3>
            <p>
              When a customer scans your QR code and submits a print order:
            </p>
            <ul className="guide-bullets">
              <li>The order appears instantly in your Windows desktop queue with audio chime and visual alert.</li>
              <li>Click <strong>Print</strong>: the terminal downloads the PDF/image, verifies page parameters, and sends it directly to your printer spooler.</li>
              <li>Temporary print files are automatically scrubbed from disk immediately after spooling to protect customer confidentiality.</li>
              <li>Customer's phone screen automatically updates: <em>"Your order is ready at the counter!"</em></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="guide-footer-card">
        <ShieldCheck size={24} className="shield-icon" />
        <div>
          <h4>Security & Privacy Architecture</h4>
          <p>
            Sprint terminals use isolated token authentication with automatic expiration. Customer documents are transmitted over encrypted TLS and never stored on the public web.
          </p>
        </div>
      </div>
    </div>
  );
}
