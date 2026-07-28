function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export function HeroBanner({
  name,
  subtitle,
  ctaLabel,
  ctaHref,
}: {
  name: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="hero">
      <div>
        <div className="hero-title">
          {greeting()}, {name} 👋
        </div>
        <p className="hero-text">{subtitle}</p>
        <a href={ctaHref} className="btn btn-accent">
          {ctaLabel} <i className="bi bi-arrow-right" />
        </a>
      </div>
      <div className="hero-icon">
        <i className="bi bi-graph-up-arrow" />
      </div>
    </div>
  );
}
