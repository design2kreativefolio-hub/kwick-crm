export function AnnouncementBanner({
  eyebrow,
  headline,
  ctaLabel,
  ctaHref,
}: {
  eyebrow: string;
  headline: React.ReactNode;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="banner">
      <div>
        <div className="banner-eyebrow">
          <span className="banner-dot" />
          {eyebrow}
        </div>
        <p className="banner-headline">{headline}</p>
      </div>
      <a href={ctaHref} className="btn btn-accent">
        {ctaLabel} <i className="bi bi-arrow-right" />
      </a>
    </div>
  );
}
