"use client";

/** Four dots moving in a wave — the single loading animation used everywhere. */
function Dots({ size = "md", label = "Loading" }: { size?: "md" | "lg"; label?: string }) {
  return (
    <span className={`dot-loader dot-loader-${size}`} role="status" aria-label={label}>
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function ChartLoader({ height = 160, label }: { height?: number; label?: string }) {
  return (
    <div className="loader-area" style={{ height }}>
      <Dots label={label ?? "Loading"} />
    </div>
  );
}

/** Inline loader for lists/tables/sections. */
export function Loader({ label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="loader-area loader-area-inline">
      <Dots label={label} />
    </div>
  );
}

/** Full-area loader for route-level fallbacks (auth gate, Suspense). */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loader-area loader-area-page">
      <Dots size="lg" label={label} />
    </div>
  );
}

/** Route-level loading fallback. */
export function PageSkeleton() {
  return <PageLoader />;
}
