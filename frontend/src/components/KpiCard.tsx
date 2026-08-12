import { Sparkline } from "@/components/Sparkline";

// Semantic tones via CSS variables so dark mode can remap contrast safely.
const TONES = {
  mint: {
    bg: "var(--kpi-mint-bg)",
    iconBg: "var(--kpi-icon-bg)",
    icon: "var(--kpi-mint)",
    accent: "var(--kpi-mint)",
  },
  amber: {
    bg: "var(--kpi-amber-bg)",
    iconBg: "var(--kpi-icon-bg)",
    icon: "var(--kpi-amber)",
    accent: "var(--kpi-amber)",
  },
  purple: {
    bg: "var(--kpi-purple-bg)",
    iconBg: "var(--kpi-icon-bg)",
    icon: "var(--kpi-purple)",
    accent: "var(--kpi-purple)",
  },
  blue: {
    bg: "var(--kpi-blue-bg)",
    iconBg: "var(--kpi-icon-bg)",
    icon: "var(--kpi-blue)",
    accent: "var(--kpi-blue)",
  },
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
    <div className="kpi-card" data-tone={tone} style={{ background: t.bg }}>
      <div className="kpi-card-top">
        <span className="kpi-card-label" style={{ color: t.accent, opacity: 0.9 }}>
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
