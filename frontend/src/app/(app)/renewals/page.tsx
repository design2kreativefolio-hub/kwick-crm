"use client";

import { useEffect, useMemo, useState } from "react";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type SubjectType = "client" | "staff" | "other";
type RenewalType = "hosting" | "domain" | "contract" | "visa" | "other";
type RenewalStatus = "upcoming" | "renewed" | "overdue";

type Renewal = {
  id: number;
  subject_type: SubjectType;
  client: number | null;
  client_name: string | null;
  staff: number | null;
  staff_name: string | null;
  subject_name: string;
  subject_label?: string;
  renewal_type: RenewalType;
  renewal_type_detail: string;
  type_label?: string;
  due_date: string;
  notes: string;
  status: RenewalStatus;
  created_at: string;
};

type Client = { id: number; name: string };
type Staff = { id: number; full_name: string; email: string };

const STATUS_BADGE: Record<RenewalStatus, string> = {
  upcoming: "badge-warning",
  renewed: "badge-success",
  overdue: "badge-danger",
};

const TYPE_LABEL: Record<RenewalType, string> = {
  hosting: "Hosting",
  domain: "Domain",
  contract: "Contract",
  visa: "Visa",
  other: "Other",
};

const SUBJECT_FILTER_OPTIONS = [
  { value: "", label: "All Subjects" },
  { value: "client", label: "Client" },
  { value: "staff", label: "Staff" },
  { value: "other", label: "Other" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "renewed", label: "Renewed" },
  { value: "overdue", label: "Overdue" },
];

const RENEWAL_TYPE_OPTIONS = [
  { value: "hosting", label: "Hosting" },
  { value: "domain", label: "Domain" },
  { value: "contract", label: "Contract" },
  { value: "visa", label: "Visa" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  subject_type: "client" as SubjectType,
  client: "",
  staff: "",
  subject_name: "",
  renewal_type: "hosting" as RenewalType,
  renewal_type_detail: "",
  due_date: "",
  notes: "",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function subjectIcon(type: SubjectType) {
  if (type === "client") return "bi-building";
  if (type === "staff") return "bi-person-fill";
  return "bi-three-dots";
}

export default function RenewalsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);

  const [subjectFilter, setSubjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const hasAccess = user?.role === "superadmin" || hasModuleAccess(user?.module_access, "renewals");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (subjectFilter) params.set("subject_type", subjectFilter);
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    api<Renewal[] | { results: Renewal[] }>(`/api/renewals${qs ? `?${qs}` : ""}`)
      .then((d) => setRenewals(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, subjectFilter, statusFilter]);

  useEffect(() => {
    if (!hasAccess) return;
    api<Client[] | { results: Client[] }>("/api/sales/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
    api<Staff[]>("/api/hr/staff")
      .then((d) => setStaff(unwrapList(d)))
      .catch(() => {});
  }, [hasAccess]);

  const clientOptions = useMemo(
    () => [{ value: "", label: "Select client…" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );
  const staffOptions = useMemo(
    () => [{ value: "", label: "Select staff…" }, ...staff.map((s) => ({ value: String(s.id), label: s.full_name || s.email }))],
    [staff]
  );

  const setSubjectType = (subject_type: SubjectType) => {
    setForm((f) => ({
      ...f,
      subject_type,
      client: subject_type === "client" ? f.client : "",
      staff: subject_type === "staff" ? f.staff : "",
      subject_name: subject_type === "other" ? f.subject_name : "",
    }));
  };

  const addRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.subject_type === "client" && !form.client) {
      setError("Please select a client.");
      return;
    }
    if (form.subject_type === "staff" && !form.staff) {
      setError("Please select a staff member.");
      return;
    }
    if (form.subject_type === "other" && !form.subject_name.trim()) {
      setError("Please enter a name for this renewal.");
      return;
    }
    if (form.renewal_type === "other" && !form.renewal_type_detail.trim()) {
      setError("Please describe the renewal type.");
      return;
    }
    if (!form.due_date) {
      setError("Please select a due date.");
      return;
    }

    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        subject_type: form.subject_type,
        client: form.subject_type === "client" ? Number(form.client) : null,
        staff: form.subject_type === "staff" ? Number(form.staff) : null,
        subject_name: form.subject_type === "other" ? form.subject_name.trim() : "",
        renewal_type: form.renewal_type,
        renewal_type_detail: form.renewal_type === "other" ? form.renewal_type_detail.trim() : "",
        due_date: form.due_date,
        notes: form.notes,
      };
      await api<Renewal>("/api/renewals", { method: "POST", body: JSON.stringify(payload) });
      setForm(emptyForm);
      setShowForm(false);
      showToast("Renewal added.");
      load();
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const markRenewed = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/api/renewals/${id}`, { method: "PATCH", body: JSON.stringify({ status: "renewed" }) });
      showToast("Marked as renewed.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't update renewal." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const deleteRenewal = async (id: number) => {
    setBusyId(id);
    try {
      await api(`/api/renewals/${id}`, { method: "DELETE" });
      showToast("Renewal deleted.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete renewal." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Renewals.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Renewals</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Client, staff, and other renewal dates for hosting, domains, contracts, visas and more.
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
          <i className="bi bi-plus-lg" /> Add Renewal
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={addRenewal}>
          <span className="card-title">New Renewal</span>
          <div style={{ display: "flex", gap: 8, margin: "14px 0", flexWrap: "wrap" }}>
            <button
              type="button"
              className={form.subject_type === "client" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
              onClick={() => setSubjectType("client")}
            >
              <i className="bi bi-building" /> Client
            </button>
            <button
              type="button"
              className={form.subject_type === "staff" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
              onClick={() => setSubjectType("staff")}
            >
              <i className="bi bi-person-fill" /> Staff
            </button>
            <button
              type="button"
              className={form.subject_type === "other" ? "btn btn-accent btn-sm" : "btn btn-ghost btn-sm"}
              onClick={() => setSubjectType("other")}
            >
              <i className="bi bi-three-dots" /> Other
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
            {form.subject_type === "client" && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                <Select
                  value={form.client}
                  onChange={(v) => setForm((f) => ({ ...f, client: v }))}
                  options={clientOptions}
                  ariaLabel="Client"
                />
              </div>
            )}
            {form.subject_type === "staff" && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Staff</label>
                <Select
                  value={form.staff}
                  onChange={(v) => setForm((f) => ({ ...f, staff: v }))}
                  options={staffOptions}
                  ariaLabel="Staff"
                />
              </div>
            )}
            {form.subject_type === "other" && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Name</label>
                <input
                  className="input"
                  value={form.subject_name}
                  onChange={(e) => setForm((f) => ({ ...f, subject_name: e.target.value }))}
                  placeholder="e.g. Office lease, Vendor X"
                  aria-label="Other subject name"
                />
              </div>
            )}

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Renewal type</label>
              <Select
                value={form.renewal_type}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    renewal_type: v as RenewalType,
                    renewal_type_detail: v === "other" ? f.renewal_type_detail : "",
                  }))
                }
                options={RENEWAL_TYPE_OPTIONS}
                ariaLabel="Renewal type"
              />
            </div>

            {form.renewal_type === "other" && (
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Type details</label>
                <input
                  className="input"
                  value={form.renewal_type_detail}
                  onChange={(e) => setForm((f) => ({ ...f, renewal_type_detail: e.target.value }))}
                  placeholder="e.g. SSL certificate, License"
                  aria-label="Other renewal type details"
                />
              </div>
            )}

            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Due date</label>
              <DatePicker
                value={form.due_date}
                onChange={(v) => setForm((f) => ({ ...f, due_date: v }))}
                ariaLabel="Due date"
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label className="field-label" style={{ marginTop: 0 }}>Notes</label>
              <textarea
                className="input"
                rows={3}
                style={{ resize: "vertical" }}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: "14px 0 0" }}>{error}</p>}
          <button className="btn" style={{ width: "fit-content", marginTop: 14 }} disabled={creating}>
            {creating ? "Adding…" : "Add renewal"}
          </button>
        </form>
      )}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span className="card-title">
            <i className="bi bi-arrow-repeat" style={{ color: "var(--gold)" }} />
            All Renewals
          </span>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ minWidth: 160 }}>
              <Select value={subjectFilter} onChange={setSubjectFilter} options={SUBJECT_FILTER_OPTIONS} ariaLabel="Filter by subject" compact />
            </div>
            <div style={{ minWidth: 160 }}>
              <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} ariaLabel="Filter by status" compact />
            </div>
          </div>
        </div>

        {loading && <p className="muted">Loading…</p>}
        {!loading && renewals.length === 0 && <p className="muted">No renewals found.</p>}
        {!loading && renewals.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Type</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {renewals.map((r) => {
                  const subjectLabel =
                    r.subject_label ||
                    (r.subject_type === "client"
                      ? r.client_name
                      : r.subject_type === "staff"
                        ? r.staff_name
                        : r.subject_name) ||
                    "—";
                  const typeLabel =
                    r.type_label ||
                    (r.renewal_type === "other" && r.renewal_type_detail
                      ? r.renewal_type_detail
                      : TYPE_LABEL[r.renewal_type]);
                  return (
                    <tr key={r.id}>
                      <td>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <i className={`bi ${subjectIcon(r.subject_type)}`} style={{ color: "var(--text-muted)" }} />
                          {subjectLabel}
                        </span>
                      </td>
                      <td>
                        <span className="badge">{typeLabel}</span>
                      </td>
                      <td style={{ color: r.status === "overdue" ? "var(--danger)" : undefined, fontWeight: r.status === "overdue" ? 700 : undefined }}>
                        {formatDate(r.due_date)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.notes || "—"}
                      </td>
                      <td style={{ display: "flex", gap: 8 }}>
                        {r.status !== "renewed" && (
                          <button
                            className="btn btn-sm"
                            disabled={busyId === r.id}
                            onClick={() => markRenewed(r.id)}
                          >
                            {busyId === r.id ? "…" : "Mark Renewed"}
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={busyId === r.id}
                          onClick={() => deleteRenewal(r.id)}
                          aria-label="Delete renewal"
                        >
                          <i className="bi bi-trash-fill" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
