export type AssetItem = { label: string; value: number | string; icon: string };

// Cycles through the blue scale's light tints so tiles read as a family,
// not arbitrary colors — stays inside the brand's blue-only palette.
const TINTS = ["var(--blue-100)", "var(--blue-200)", "var(--blue-100)", "var(--blue-200)"];

export function AssetGrid({ title, items }: { title: string; items: AssetItem[] }) {
  return (
    <div className="card" style={{ height: "100%" }}>
      <span className="card-title">
        <i className="bi bi-grid" style={{ color: "var(--gold)" }} />
        {title}
      </span>
      <div className="asset-grid">
        {items.map((item, i) => (
          <div key={item.label} className="asset-tile" style={{ background: TINTS[i % TINTS.length] }}>
            <i className={`bi ${item.icon} asset-tile-icon`} style={{ color: "var(--blue-800)" }} />
            <div>
              <div className="asset-tile-value" style={{ color: "var(--blue-900)" }}>
                {item.value}
              </div>
              <div className="asset-tile-label" style={{ color: "var(--blue-800)" }}>
                {item.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
