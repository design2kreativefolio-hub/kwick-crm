"use client";

import type { CSSProperties } from "react";

/** Animated bars that rise and fall — mirrors the dashboard graphs. */
export function ChartLoader({ height = 160, label }: { height?: number; label?: string }) {
  const bars = [0.45, 0.8, 0.6, 1, 0.7, 0.9, 0.5, 0.75];
  return (
    <div className="chart-loader" style={{ height }} role="status" aria-label={label ?? "Loading"}>
      <div className="chart-loader-bars">
        {bars.map((h, i) => (
          <span
            key={i}
            className="chart-loader-bar"
            style={{ ["--h" as string]: `${h * 100}%`, animationDelay: `${i * 0.09}s` } as CSSProperties}
          />
        ))}
      </div>
      {label && <span className="muted chart-loader-label">{label}</span>}
    </div>
  );
}

function Dots() {
  return (
    <span className="loader-dots">
      <i />
      <i />
      <i />
    </span>
  );
}

/** Inline loader for lists/tables/sections: spinning ring + shimmering skeleton rows. */
export function Loader({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="loader-block" role="status" aria-label={label}>
      <div className="loader-head">
        <span className="loader-ring" />
        <span className="loader-label muted">
          {label}
          <Dots />
        </span>
      </div>
      <SkeletonRows rows={rows} />
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="skeleton-rows" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.08}s` }}>
          <span className="skeleton skeleton-dot" />
          <span className="skeleton" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          <span className="skeleton" style={{ width: 70, marginLeft: "auto" }} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({
  width = "100%",
  height = 14,
  style,
}: {
  width?: number | string;
  height?: number;
  style?: CSSProperties;
}) {
  return <span className="skeleton" style={{ display: "block", width, height, ...style }} aria-hidden />;
}

/** Full-area loader for route-level fallbacks (auth gate, Suspense). */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-label={label}>
      <div className="page-loader-orb">
        <span className="page-loader-ring r1" />
        <span className="page-loader-ring r2" />
        <span className="page-loader-core" />
      </div>
      <ChartLoader height={64} />
      <span className="muted loader-label">
        {label}
        <Dots />
      </span>
    </div>
  );
}

/** Skeleton layout of a typical page: title, KPI row, then a chart + rows card. */
export function PageSkeleton() {
  return (
    <div className="page-skeleton" aria-busy="true">
      <Skeleton width={220} height={28} />
      <div className="page-skeleton-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ animationDelay: `${i * 0.07}s` }}>
            <Skeleton width="50%" height={12} />
            <Skeleton width="35%" height={28} style={{ marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div className="card">
        <ChartLoader height={140} />
        <SkeletonRows rows={5} />
      </div>
    </div>
  );
}
