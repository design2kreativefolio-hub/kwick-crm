"use client";

const META: Record<string, { text: string; cls: string; icon: string }> = {
  hot: { text: "Hot", cls: "badge-danger", icon: "bi-fire" },
  warm: { text: "Warm", cls: "badge-warning", icon: "bi-thermometer-half" },
  cold: { text: "Cold", cls: "badge-info", icon: "bi-snow2" },
};

/** The lead score as a small badge (Hot / Warm / Cold + the number). Closed and won leads show nothing. */
export function ScoreBadge({ score, label, onClick }: { score: number; label: string; onClick?: () => void }) {
  const m = META[label];
  if (!m) return null;
  const inner = (
    <>
      <i className={`bi ${m.icon}`} /> {m.text} {score}
    </>
  );
  const style = { display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" as const };
  return onClick ? (
    <button type="button" className={`badge ${m.cls}`} style={{ ...style, border: 0, cursor: "pointer", font: "inherit" }} onClick={onClick} title="Why this score?">
      {inner}
    </button>
  ) : (
    <span className={`badge ${m.cls}`} style={style} title={`Lead score ${score}/100`}>
      {inner}
    </span>
  );
}
