"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export type DonutSlice = { label: string; value: number; color: string };

export function DonutCard({ title, slices }: { title: string; slices: DonutSlice[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="card">
      <span className="card-title">{title}</span>
      <div style={{ position: "relative", height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
              animationDuration={900}
              animationEasing="ease-out"
            >
              {slices.map((s) => (
                <Cell key={s.label} fill={s.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={centerLabel}>
          <div className="muted" style={{ fontSize: 12 }}>Total</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--navy)" }}>{total}</div>
        </div>
      </div>
      <div className="seg-legend" style={{ marginTop: 12 }}>
        {slices.map((s) => (
          <div key={s.label} className="seg-legend-item">
            <span className="seg-dot" style={{ background: s.color }} />
            {s.label} <strong style={{ color: "var(--text)" }}>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

const centerLabel: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  textAlign: "center",
  pointerEvents: "none",
};
