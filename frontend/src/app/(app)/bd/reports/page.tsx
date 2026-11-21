"use client";

import { useCallback, useEffect, useState } from "react";

import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtMoney, type BDReport } from "@/lib/bd";
import { useToast } from "@/lib/toast";

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

export default function BDReportsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";

  const [days, setDays] = useState(30);
  const [owner, setOwner] = useState("");
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [data, setData] = useState<BDReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api<BDReport>(`/api/bd/reports?days=${days}${owner ? `&owner=${owner}` : ""}`)
      .then(setData)
      .catch(() => showToast("Couldn't load the report.", "error"))
      .finally(() => setLoading(false));
  }, [days, owner, showToast]);

  useEffect(() => {
    if (isSuperadmin) load();
  }, [isSuperadmin, load]);

  useEffect(() => {
    if (isSuperadmin) api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners).catch(() => {});
  }, [isSuperadmin]);

  if (!user) return null;
  if (!isSuperadmin) return <p className="muted">Reports are only available to the administrator.</p>;

  const topFunnel = Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [1]));
  const topLost = Math.max(1, ...(data?.lost_reasons.map((r) => r.count) ?? [1]));
  const s = data?.summary;

  return (
    <div className="bd-page">
      <div className="bd-head">
        <div>
          <h1>BD Reports</h1>
          <div className="bd-sub">Business Development · last {days} days</div>
        </div>
        <div className="bd-head__actions">
          {owners.length > 1 && (
            <div style={{ minWidth: 180 }}>
              <Select value={owner} onChange={setOwner} options={[{ value: "", label: "All BDEs" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]} ariaLabel="BDE" />
            </div>
          )}
        </div>
      </div>

      <div className="bd-chips">
        {PERIODS.map((p) => (
          <button key={p.days} className={`bd-chip${days === p.days ? " is-on" : ""}`} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>

      {loading || !data || !s ? (
        <Loader />
      ) : (
        <>
          <div className="bd-metrics">
            <div className="bd-metric"><b>{s.new_leads}</b><span>New leads</span></div>
            <div className="bd-metric"><b>{s.won}</b><span>Won</span></div>
            <div className="bd-metric"><b>{s.win_rate}%</b><span>Win rate ({s.won} won, {s.lost} lost)</span></div>
            <div className="bd-metric"><b>{fmtMoney(s.won_value_aed, "AED")}</b><span>Won value</span></div>
            <div className="bd-metric"><b>{s.avg_days_to_close ?? "—"}</b><span>Avg days to close</span></div>
          </div>

          <div className="bd-sub" style={{ marginTop: -6 }}>
            Open pipeline now: <b style={{ color: "var(--text)" }}>{fmtMoney(data.pipeline.open_value_aed, "AED")}</b> across {data.pipeline.open_deals} deals · {data.pipeline.stage_moves} stage moves in this period
          </div>

          <section className="bd-section">
            <h2>Funnel</h2>
            <div className="bd-list">
              <div className="bd-bars">
                {data.funnel.map((f) => (
                  <div className="bd-bar" key={f.key}>
                    <span>{f.label}</span>
                    <div className="bd-bar__track"><div className="bd-bar__fill" style={{ width: `${(f.count / topFunnel) * 100}%` }} /></div>
                    <span className="bd-bar__n">{f.count}</span>
                  </div>
                ))}
              </div>
              <div className="bd-sub" style={{ padding: "0 18px 14px", marginTop: 0 }}>
                Leads that arrived in this period, by how far they have got today.
              </div>
            </div>
          </section>

          <section className="bd-section">
            <h2>Where leads come from</h2>
            <div className="bd-tablecard" style={{ display: "block" }}>
              <div className="table-wrap">
                <table className="kwick-table">
                  <thead>
                    <tr><th>Source</th><th>Leads</th><th>Qualified</th><th>Won</th><th>Won value</th><th>Conversion</th></tr>
                  </thead>
                  <tbody>
                    {data.sources.length === 0 && <tr><td colSpan={6} className="muted">No leads in this period.</td></tr>}
                    {data.sources.map((r) => (
                      <tr key={r.source} style={{ cursor: "default" }}>
                        <td><b>{r.label}</b></td>
                        <td>{r.leads}</td>
                        <td>{r.qualified}</td>
                        <td>{r.won}</td>
                        <td>{fmtMoney(r.won_value_aed, "AED")}</td>
                        <td>{r.conversion}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="bd-section">
            <h2>Why deals are lost</h2>
            <div className="bd-list">
              {data.lost_reasons.length === 0 ? (
                <div className="bd-empty">No lost deals in this period.</div>
              ) : (
                <div className="bd-bars">
                  {data.lost_reasons.map((r) => (
                    <div className="bd-bar" key={r.reason}>
                      <span>{r.label}</span>
                      <div className="bd-bar__track"><div className="bd-bar__fill" style={{ width: `${(r.count / topLost) * 100}%`, background: "var(--danger)" }} /></div>
                      <span className="bd-bar__n">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="bd-section">
            <h2>By BDE</h2>
            <div className="bd-tablecard" style={{ display: "block" }}>
              <div className="table-wrap">
                <table className="kwick-table">
                  <thead>
                    <tr><th>BDE</th><th>Leads</th><th>Calls</th><th>WhatsApp</th><th>Emails</th><th>Meetings</th><th>Follow-ups done</th><th>Won</th><th>Won value</th></tr>
                  </thead>
                  <tbody>
                    {data.per_bde.length === 0 && <tr><td colSpan={9} className="muted">No activity in this period.</td></tr>}
                    {data.per_bde.map((r) => (
                      <tr key={r.owner} style={{ cursor: "default" }}>
                        <td><b>{r.name}</b></td>
                        <td>{r.leads}</td>
                        <td>{r.calls}</td>
                        <td>{r.whatsapp}</td>
                        <td>{r.emails}</td>
                        <td>{r.meetings}</td>
                        <td>{r.follow_ups_done}</td>
                        <td>{r.won}</td>
                        <td>{fmtMoney(r.won_value_aed, "AED")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
