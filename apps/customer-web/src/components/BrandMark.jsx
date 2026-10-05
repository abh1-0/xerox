export function BrandMark({ onClick, size = "normal" }) {
  const isLarge = size === "large";
  return (
    <div
      className={`brand-lockup ${isLarge ? "brand-large" : ""}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
      aria-label="Sprint by abh1"
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {/* Bespoke Vector Mark: Optical Registration Cross & Multi-sheet Layer */}
      <svg
        className="brand-vector-mark"
        width={isLarge ? "36" : "28"}
        height={isLarge ? "36" : "28"}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="28" height="28" rx="7" fill="#0C1C32" />
        {/* Layered sheet angle */}
        <path
          d="M8 10C8 8.89543 8.89543 8 10 8H20C21.1046 8 22 8.89543 22 10V18C22 19.1046 21.1046 20 20 20H10C8.89543 20 8 19.1046 8 18V10Z"
          fill="#1769FF"
          fillOpacity="0.4"
        />
        {/* Top sheet */}
        <path
          d="M11 12.5C11 11.6716 11.6716 11 12.5 11H22.5C23.3284 11 24 11.6716 24 12.5V21.5C24 22.3284 23.3284 23 22.5 23H12.5C11.6716 23 11 22.3284 11 21.5V12.5Z"
          fill="#FFFFFF"
        />
        {/* Speed sprint registration bar */}
        <rect x="14" y="14" width="7" height="2" rx="1" fill="#1769FF" />
        <rect x="14" y="17.5" width="5" height="2" rx="1" fill="#0C1C32" />
        {/* Registration accent dots */}
        <circle cx="6" cy="6" r="1.2" fill="#1769FF" />
        <circle cx="26" cy="26" r="1.2" fill="#1769FF" />
      </svg>

      <div className="brand-text-stack">
        <div className="brand-wordmark">
          <span>sprint</span>
        </div>
        <div className="brand-subtext">
          <span>by abh1</span>
        </div>
      </div>
    </div>
  );
}

export function money(minor, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((minor || 0) / 100);
}
