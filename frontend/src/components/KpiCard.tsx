const TINTS = [
  { bg: "var(--blue-100)", fg: "var(--blue-800)" },
  { bg: "var(--blue-200)", fg: "var(--blue-900)" },
];

export function KpiCard({
  label,
  value,
  icon,
  trend,
  tone = 0,
}: {
  label: string;
  value: number | string;
  icon: string;
  /** Real trend %, only rendered when we actually have a previous-period baseline. */
  trend?: number | null;
  tone?: number;
}) {
  const t = TINTS[tone % TINTS.length];
  return (
    <div className="kpi-card">
      <div className="kpi-card-top">
        <span className="kpi-card-label">{label}</span>
        <span className="kpi-card-icon-circle" style={{ background: t.bg, color: t.fg }}>
          <i className={`bi ${icon}`} />
        </span>
      </div>
      <div className="kpi-card-value">{value}</div>
      {trend !== undefined && trend !== null && (
        <div className="kpi-card-trend">
          <span className={`badge ${trend >= 0 ? "badge-success" : "badge-danger"}`}>
            {trend >= 0 ? "+" : ""}
            {trend}%
          </span>
          <span className="muted">vs last month</span>
        </div>
      )}
    </div>
  );
}
