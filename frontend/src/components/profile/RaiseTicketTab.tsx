"use client";

import { useEffect, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useToast } from "@/lib/toast";

type Ticket = {
  id: number;
  date: string;
  description: string;
  urgency: string;
  status: string;
  created_at: string;
};

const URGENCY_BADGE: Record<string, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function RaiseTicketTab() {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [form, setForm] = useState({ date: todayIso(), description: "", urgency: "medium" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api<Ticket[] | { results: Ticket[] }>("/api/hr/tickets")
      .then((d) => setTickets(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/api/hr/tickets", { method: "POST", body: JSON.stringify(form) });
      setForm({ date: todayIso(), description: "", urgency: "medium" });
      showToast("Ticket raised.");
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={twoCol}>
      <form className="card" onSubmit={submit}>
        <span className="card-title">Raise a Ticket</span>
        <label className="field-label" style={{ marginTop: 0 }}>Date</label>
        <DatePicker
          value={form.date}
          onChange={(v) => setForm((f) => ({ ...f, date: v }))}
          ariaLabel="Date"
        />
        <label className="field-label">Description</label>
        <textarea
          className="input"
          rows={4}
          required
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          style={{ resize: "vertical", fontFamily: "inherit" }}
        />
        <label className="field-label">Urgency</label>
        <Select
          value={form.urgency}
          onChange={(v) => setForm((f) => ({ ...f, urgency: v }))}
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          ariaLabel="Urgency"
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ marginTop: 14 }} disabled={busy}>
          {busy ? "Submitting…" : "Submit"}
        </button>
      </form>

      <div className="card">
        <span className="card-title">My Tickets</span>
        {tickets.length === 0 && <p className="muted">No tickets raised yet.</p>}
        {tickets.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Urgency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.description}
                    </td>
                    <td>{new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td>
                      <span className={`badge ${URGENCY_BADGE[t.urgency] ?? "badge-muted"}`}>{t.urgency}</span>
                    </td>
                    <td>
                      <span className={`badge ${t.status === "resolved" ? "badge-success" : "badge-warning"}`}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "380px 1fr",
  gap: 20,
  alignItems: "start",
};
