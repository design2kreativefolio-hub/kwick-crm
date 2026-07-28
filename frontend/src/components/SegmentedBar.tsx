export type Segment = { label: string; value: number; color: string };

export function SegmentedBar({
  title,
  subtitle,
  headline,
  trend,
  segments,
}: {
  title: string;
  subtitle?: string;
  headline?: string;
  trend?: number | null;
  segments: Segment[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div className="card" style={{ height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span className="card-title" style={{ marginBottom: 4 }}>{title}</span>
        <i className="bi bi-three-dots-vertical muted" />
      </div>
      {subtitle && (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 4 }}>
          {subtitle}
        </div>
      )}
      {headline && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 30, fontWeight: 700, color: "var(--navy)" }}>{headline}</span>
          {trend !== undefined && trend !== null && (
            <span className={`badge ${trend >= 0 ? "badge-success" : "badge-danger"}`}>
              {trend >= 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </div>
      )}
      <div className="seg-bar">
        {segments.map((s) => (
          <div
            key={s.label}
            className="seg-bar-segment"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="seg-legend">
        {segments.map((s) => (
          <div key={s.label} className="seg-legend-item">
            <span className="seg-dot" style={{ background: s.color }} />
            {s.label} <strong style={{ color: "var(--text)" }}>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
