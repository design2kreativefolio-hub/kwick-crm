import { Sparkline } from "@/components/Sparkline";

// A small semantic palette (not pure blue) so cards read as a hierarchy at a
// glance — mint for positive/growth, amber for things needing attention,
// purple for neutral secondary metrics, blue for primary/financial ones.
const TONES = {
  mint: { bg: "#E6F6EE", iconBg: "#ffffff", icon: "#1E9E62", accent: "#1E9E62" },
  amber: { bg: "#FDF1DF", iconBg: "#ffffff", icon: "#C9821B", accent: "#C9821B" },
  purple: { bg: "#F0EBFB", iconBg: "#ffffff", icon: "#7C4FE0", accent: "#7C4FE0" },
  blue: { bg: "var(--blue-100)", iconBg: "#ffffff", icon: "var(--navy)", accent: "var(--navy)" },
} as const;

export type KpiTone = keyof typeof TONES;

export function KpiCard({
  label,
  value,
  icon,
  trend,
  tone = "blue",
  sparkline,
}: {
  label: string;
  value: number | string;
  icon: string;
  /** Real trend %, only rendered when we actually have a previous-period baseline. */
  trend?: number | null;
  tone?: KpiTone;
  /** Real historical values only — omit rather than fabricate a trend line. */
  sparkline?: number[];
}) {
  const t = TONES[tone];
  return (
    <div className="kpi-card" style={{ background: t.bg }}>
      <div className="kpi-card-top">
        <span className="kpi-card-label" style={{ color: t.accent, opacity: 0.85 }}>
          {label}
        </span>
        <span className="kpi-card-icon-circle" style={{ background: t.iconBg, color: t.icon }}>
          <i className={`bi ${icon}`} />
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div className="kpi-card-value" style={{ color: t.accent }}>
            {value}
          </div>
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
        {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} color={t.accent} />}
      </div>
    </div>
  );
}
