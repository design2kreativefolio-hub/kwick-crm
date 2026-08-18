function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 15) return "Good Afternoon";
  if (h < 24) return "Good Evening";
  return "Good Evening";
}

export function HeroBanner({
  name,
  subtitle,
  ctaLabel,
  ctaHref,
  compact = false,
}: {
  name: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  /** Smaller padding/type/icon — for sitting alongside KPI cards in a tight row. */
  compact?: boolean;
}) {
  return (
    <div className={`hero ${compact ? "hero-compact" : ""}`}>
      <div className="hero-copy">
        <div className="hero-title">
          {greeting()}, {name} 👋
        </div>
        <p className="hero-text">{subtitle}</p>
        <a href={ctaHref} className="btn btn-accent">
          {ctaLabel} <i className="bi bi-arrow-right" />
        </a>
      </div>
      {!compact && (
        <div className="hero-icon">
          <i className="bi bi-bar-chart-fill" />
        </div>
      )}
    </div>
  );
}
