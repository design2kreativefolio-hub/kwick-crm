"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Select } from "@/components/Select";
import { api } from "@/lib/api";

type Granularity = "daily" | "weekly" | "monthly";
type Point = { bucket: string; completed: number; created: number };

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function renderLegend() {
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "flex-end", fontSize: 12 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--blue-800)" }} />
        Completed
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--blue-300)" }} />
        Created
      </span>
    </div>
  );
}

export function PerformanceChart({
  canScopeCompany,
  headlineValue,
  previousValue,
}: {
  canScopeCompany: boolean;
  headlineValue: number;
  previousValue: number;
}) {
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [scope, setScope] = useState<"self" | "company">("self");
  const [series, setSeries] = useState<Point[]>([]);

  useEffect(() => {
    // Toggle re-queries rather than re-labelling (spec §15.4).
    api<{ series: Point[] }>(
      `/api/dashboard/performance?granularity=${granularity}&scope=${scope}`
    )
      .then((d) => setSeries(d.series))
      .catch(() => setSeries([]));
  }, [granularity, scope]);

  const pct = trendPct(headlineValue, previousValue);

  return (
    <div className="card" style={{ height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <span className="card-title" style={{ marginBottom: 4 }}>Performance</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: "var(--navy)" }}>{headlineValue}</span>
            {pct !== null && (
              <span className={`badge ${pct >= 0 ? "badge-success" : "badge-danger"}`}>
                {pct >= 0 ? "+" : ""}
                {pct}%
              </span>
            )}
            <span className="muted" style={{ fontSize: 12 }}>tasks completed, vs. last month</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {canScopeCompany && (
            <Select
              compact
              value={scope}
              onChange={(v) => setScope(v as "self" | "company")}
              options={[
                { value: "self", label: "Me" },
                { value: "company", label: "Company" },
              ]}
              ariaLabel="Scope"
            />
          )}
          {(["daily", "weekly", "monthly"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={granularity === g ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
              style={{ textTransform: "capitalize" }}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 260, marginTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 16, right: 4, left: -20, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--blue-100)", radius: 4 }}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5 }}
            />
            <Legend content={renderLegend} verticalAlign="top" height={28} />
            <Bar
              dataKey="completed"
              name="Completed"
              stackId="a"
              fill="var(--blue-800)"
              radius={[0, 0, 0, 0]}
              animationDuration={900}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="created"
              name="Created"
              stackId="a"
              fill="var(--blue-300)"
              radius={[6, 6, 0, 0]}
              animationDuration={900}
              animationEasing="ease-out"
              animationBegin={150}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
