// Tones are all within the blue-and-white brand family — different tints/
// shades of the same Medium Blue, not unrelated hues.
const TONES: Record<string, { bg: string; fg: string }> = {
  navy: { bg: "rgba(0,0,205,0.08)", fg: "var(--navy)" },
  gold: { bg: "var(--gold-soft)", fg: "var(--gold)" },
  slate: { bg: "rgba(108,123,168,0.14)", fg: "var(--chart-3)" },
  sand: { bg: "rgba(159,180,232,0.28)", fg: "#3355a8" },
};

export function InfoCard({
  label,
  value,
  icon,
  tone = "navy",
}: {
  label: string;
  value: number | string;
  icon: string;
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  return (
    <div className="info-card">
      <div className="info-card-icon" style={{ background: t.bg, color: t.fg }}>
        <i className={`bi ${icon}`} />
      </div>
      <div className="info-card-body">
        <span className="info-card-label">{label}</span>
        <span className="info-card-value">{value}</span>
      </div>
    </div>
  );
}
