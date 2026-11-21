"use client";

import { useCallback, useEffect, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { useConfirm } from "@/components/ConfirmDialog";
import { Loader } from "@/components/Loader";
import { Select } from "@/components/Select";
import { API_BASE, api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CaptureSource, MailStatus } from "@/lib/bd";
import { timeAgo } from "@/lib/notifications";
import { useToast } from "@/lib/toast";

const endpointOf = (s: CaptureSource) => `${API_BASE}/api/public/bd/capture/${s.token}`;

export default function BDSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";

  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refreshMeta = async () => {
    setRefreshing(true);
    try {
      const r = await api<{ imported: number }>("/api/bd/meta/refresh", { method: "POST" });
      showToast(r.imported > 0 ? `${r.imported} new lead${r.imported === 1 ? "" : "s"} imported from Meta.` : "Checked Meta - no new leads.");
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't refresh Meta.", "error");
    } finally {
      setRefreshing(false);
    }
  };

  const load = useCallback(() => {
    Promise.all([
      api<CaptureSource[] | { results: CaptureSource[] }>("/api/bd/capture-sources").then((d) => setSources(unwrapList(d))),
      api<MailStatus>("/api/bd/mail-status").then(setStatus),
      api<{ id: number; name: string }[]>("/api/bd/leads/owners").then(setOwners),
    ])
      .catch(() => showToast("Couldn't load the settings.", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    if (isSuperadmin) load();
  }, [isSuperadmin, load]);

  const copy = async (text: string, what = "Copied.") => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(what);
    } catch {
      showToast(text, "info");
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      if (ok) showToast(ok);
      load();
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Something went wrong.", "error");
    }
  };

  const create = async () => {
    setBusy(true);
    await act(
      () => api("/api/bd/capture-sources", { method: "POST", body: JSON.stringify({ name: name.trim(), default_owner: owner ? Number(owner) : null }) }),
      "Form added."
    );
    setBusy(false);
    setAddOpen(false);
    setName("");
    setOwner("");
  };

  if (!user) return null;
  if (!isSuperadmin) return <p className="muted">Settings are only available to the administrator.</p>;
  if (loading) return <Loader />;

  const on = (v?: boolean) => <span className={`bd-dot${v ? " is-on" : ""}`} />;

  return (
    <div className="bd-page">
      {ConfirmDialog}
      <div className="bd-head">
        <div>
          <h1>Website Lead Forms &amp; Email</h1>
          <div className="bd-sub">Where leads come from, and what the server can send.</div>
        </div>
        <div className="bd-head__actions">
          <button className="btn" onClick={() => setAddOpen(true)}>
            <i className="bi bi-plus-lg" /> Add website form
          </button>
        </div>
      </div>

      <section className="bd-section">
        <h2>Connections</h2>
        <div className="bd-list">
          <div className="bd-status">
            {on(status?.can_send)} Send email from Kwick
            <small>{status?.can_send ? `From ${status.from}` : "Not set up — Email opens your mail app instead"}</small>
          </div>
          <div className="bd-status">
            {on(status?.can_read)} Log replies from the sales inbox
            <small>{status?.can_read ? "Checked every 10 minutes" : "Off — needs the BD_IMAP_* settings"}</small>
          </div>
          <div className="bd-status">
            {on(status?.meta)} Meta Lead Ads
            <small>{status?.meta ? "Checked every 15 minutes, or refresh now" : "Off — needs META_PAGE_ID and META_PAGE_ACCESS_TOKEN"}</small>
            {status?.meta && (
              <button type="button" className="bd-pillbtn" style={{ padding: "5px 12px" }} onClick={refreshMeta} disabled={refreshing}>
                <i className={`bi bi-arrow-repeat${refreshing ? " bd-spin" : ""}`} /> <span>{refreshing ? "Checking…" : "Refresh now"}</span>
              </button>
            )}
          </div>
        </div>
        <div className="bd-sub">These are switched on from the server&apos;s environment settings — see docs/BUSINESS_DEVELOPMENT.md.</div>
      </section>

      <section className="bd-section">
        <h2>Website forms</h2>
        <div className="bd-list">
          {sources.length === 0 ? (
            <div className="bd-empty">
              <i className="bi bi-globe2" />
              No website forms yet. Add one to get a private link for your contact form.
            </div>
          ) : (
            sources.map((s) => (
              <div key={s.id} className={`bd-src${s.active ? "" : " is-paused"}`}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ flex: 1, minWidth: 140 }}>{s.name}</b>
                  {!s.active && <span className="badge badge-muted">Paused</span>}
                  <span className="bd-sub" style={{ margin: 0 }}>
                    {s.received_count} lead{s.received_count === 1 ? "" : "s"}
                    {s.last_received_at ? ` · last ${timeAgo(s.last_received_at)}` : " · none yet"}
                    {s.default_owner_name ? ` · goes to ${s.default_owner_name}` : " · shared out between BDEs"}
                  </span>
                </div>
                <code className="bd-code">{endpointOf(s)}</code>
                <div className="bd-actions">
                  <button className="btn btn-sm" onClick={() => copy(endpointOf(s), "Link copied.")}>
                    <i className="bi bi-clipboard" /> Copy link
                  </button>
                  <button className="bd-link" onClick={() => act(() => api(`/api/bd/capture-sources/${s.id}`, { method: "PATCH", body: JSON.stringify({ active: !s.active }) }), s.active ? "Paused." : "Resumed.")}>
                    {s.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="bd-link"
                    onClick={async () => {
                      const ok = await confirm("The current link stops working straight away. Update the form with the new link afterwards.", { title: "Get a new link", confirmLabel: "Get new link" });
                      if (ok === true) void act(() => api(`/api/bd/capture-sources/${s.id}/rotate`, { method: "POST" }), "New link ready.");
                    }}
                  >
                    New link
                  </button>
                  <button
                    className="bd-link is-danger"
                    onClick={async () => {
                      const ok = await confirm(`Remove "${s.name}"? Leads already captured stay.`, { title: "Remove form", danger: true, confirmLabel: "Remove" });
                      if (ok === true) void act(() => api(`/api/bd/capture-sources/${s.id}`, { method: "DELETE" }), "Removed.");
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="bd-section">
        <h2>Connect your WordPress form</h2>
        <div className="bd-list" style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
          <div>
            <b>Contact Form 7 / Elementor / WPForms:</b> add a <i>webhook</i> action (plugin such as &ldquo;CF7 to Webhook&rdquo;, or Elementor&apos;s built-in Webhook) and paste the link above as the URL. Send the fields as they are — names like <code>your-name</code>, <code>your-email</code>, <code>phone</code>, <code>company</code>, <code>your-message</code> are recognised automatically.
          </div>
          <div>
            <b>A plain HTML form</b> can post straight to the link (method <code>POST</code>). Add a hidden, empty field called <code>_gotcha</code> as a spam trap — anything that fills it is ignored.
          </div>
          <div className="bd-sub" style={{ margin: 0 }}>
            A repeat enquiry from the same phone or email is added to the existing lead&apos;s timeline instead of creating a duplicate, and the owner gets a push either way.
          </div>
        </div>
      </section>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add website form"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setAddOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={create} disabled={busy || !name.trim()}>Add</button>
          </>
        }
      >
        <div className="bd-field">
          <label htmlFor="cs-name">Name</label>
          <input id="cs-name" className="input" placeholder="e.g. Contact page" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="bd-field">
          <span className="bd-label">Send these leads to</span>
          <Select
            value={owner}
            onChange={setOwner}
            options={[{ value: "", label: "Share out between BDEs" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]}
            ariaLabel="Owner"
          />
        </div>
      </Sheet>
    </div>
  );
}
