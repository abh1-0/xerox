export function BrandMark({ onClick, size = "normal" }) {
  return (
    <div
      className={`brand ${size === "large" ? "brand-lg" : ""}`}
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
      aria-label="Sprint by abh1"
    >
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

export function money(minor, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format((minor || 0) / 100);
}
