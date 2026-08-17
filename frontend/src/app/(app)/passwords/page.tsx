"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Combobox } from "@/components/Combobox";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { PinInput } from "@/components/PinInput";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type PasswordEntry = {
  id: number;
  client: number | null;
  client_name: string;
  client_display: string;
  platform: string;
  username: string;
  has_password: boolean;
  link: string;
  security_question: string;
  start_date: string | null;
  expiry_date: string | null;
  comment: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
};

type Client = { id: number; name: string };

type VaultGate = "checking" | "animating" | "pin" | null;

const emptyForm = {
  client_id: "",
  client_name: "",
  platform: "",
  username: "",
  password: "",
  link: "",
  security_question: "",
  start_date: "",
  expiry_date: "",
  comment: "",
};

const DEFENDER_MS = 2000;

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function externalHref(link: string) {
  const trimmed = link.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function VaultAccessAnimation() {
  return (
    <div className="vault-access" aria-live="polite">
      <div className="vault-access__orb">
        <div className="vault-access__ring" />
        <div className="vault-access__ring" />
        <div className="vault-access__ring" />
        <div className="vault-access__core">
          <i className="bi bi-shield-lock-fill" />
        </div>
      </div>
      <p className="vault-access__label">
        Accessing vault
        <span className="vault-access__dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  );
}

export default function PasswordsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "passwords");

  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [vaultGate, setVaultGate] = useState<VaultGate>("checking");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Record<number, string>>({});

  const [pinSettingsOpen, setPinSettingsOpen] = useState(false);
  const [pinForm, setPinForm] = useState({ current: "", next: "", confirm: "" });
  const [pinChangeBusy, setPinChangeBusy] = useState(false);

  const clientOptions = useMemo(() => clients.map((c) => c.name), [clients]);

  const startPinGate = useCallback(() => {
    setVaultGate("animating");
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => setVaultGate("pin"), DEFENDER_MS);
  }, []);

  const checkUnlock = useCallback(async () => {
    if (!hasAccess) return;
    setVaultGate("checking");
    try {
      const data = await api<{ unlocked: boolean }>("/api/passwords/vault/unlock");
      if (data.unlocked) {
        setUnlocked(true);
        setVaultGate(null);
      } else {
        setUnlocked(false);
        startPinGate();
      }
    } catch {
      setUnlocked(false);
      startPinGate();
    }
  }, [hasAccess, startPinGate]);

  const loadEntries = useCallback(async () => {
    if (!hasAccess || !unlocked) return;
    setLoading(true);
    try {
      const data = await api<{ results: PasswordEntry[] } | PasswordEntry[]>("/api/passwords");
      setEntries(unwrapList(data));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        setUnlocked(false);
        setEntries([]);
        startPinGate();
      } else {
        setEntries([]);
      }
    } finally {
      setLoading(false);
    }
  }, [hasAccess, unlocked, startPinGate]);

  useEffect(() => {
    if (!hasAccess) return;
    checkUnlock();
    api<{ results: Client[] } | Client[]>("/api/projects/clients")
      .then((data) => setClients(unwrapList(data)))
      .catch(() => setClients([]));
    return () => {
      if (animTimer.current) clearTimeout(animTimer.current);
    };
  }, [hasAccess, checkUnlock]);

  useEffect(() => {
    if (unlocked) loadEntries();
  }, [unlocked, loadEntries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.client_display.toLowerCase().includes(q) ||
        e.platform.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        (e.comment || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const groupedByClient = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; clientId: number | null; entries: PasswordEntry[] }
    >();

    for (const entry of filtered) {
      const label = entry.client_display || entry.client_name || "Other";
      const key = entry.client ? `c-${entry.client}` : `n-${label.toLowerCase()}`;
      if (!map.has(key)) {
        map.set(key, { key, label, clientId: entry.client, entries: [] });
      }
      map.get(key)!.entries.push(entry);
    }

    const clientOrder = new Map(clients.map((c, i) => [c.id, i]));
    const groups = Array.from(map.values());

    for (const group of groups) {
      group.entries.sort((a, b) => a.platform.localeCompare(b.platform, undefined, { sensitivity: "base" }));
    }

    groups.sort((a, b) => {
      if (a.clientId != null && b.clientId != null) {
        const orderA = clientOrder.get(a.clientId) ?? 9999;
        const orderB = clientOrder.get(b.clientId) ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });

    return groups;
  }, [filtered, clients]);

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinBusy(true);
    try {
      await api("/api/passwords/vault/unlock", { method: "POST", body: JSON.stringify({ pin }) });
      setUnlocked(true);
      setVaultGate(null);
      setPin("");
      showToast("Vault unlocked.");
    } catch (err: unknown) {
      setPinError(err instanceof ApiError ? formatApiError(err.data) : "Incorrect PIN.");
    } finally {
      setPinBusy(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (entry: PasswordEntry) => {
    setEditingId(entry.id);
    setForm({
      client_id: entry.client ? String(entry.client) : "",
      client_name: entry.client ? "" : entry.client_name,
      platform: entry.platform,
      username: entry.username,
      password: "",
      link: entry.link || "",
      security_question: entry.security_question || "",
      start_date: entry.start_date || "",
      expiry_date: entry.expiry_date || "",
      comment: entry.comment || "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const saveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.platform.trim()) {
      setFormError("Platform is required.");
      return;
    }
    const pickedClient = form.client_id ? clients.find((c) => String(c.id) === form.client_id) : null;
    if (!pickedClient && !form.client_name.trim()) {
      setFormError("Select a client or enter a client name.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        platform: form.platform.trim(),
        username: form.username.trim(),
        link: form.link.trim(),
        security_question: form.security_question.trim(),
        start_date: form.start_date || null,
        expiry_date: form.expiry_date || null,
        comment: form.comment.trim(),
        client: pickedClient ? pickedClient.id : null,
        client_name: pickedClient ? "" : form.client_name.trim(),
      };
      if (form.password) body.password = form.password;
      if (editingId) {
        await api(`/api/passwords/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
        showToast("Entry updated.");
      } else {
        if (!form.password) {
          setFormError("Password is required for new entries.");
          setSaving(false);
          return;
        }
        body.password = form.password;
        await api("/api/passwords", { method: "POST", body: JSON.stringify(body) });
        showToast("Entry added.");
      }
      setShowForm(false);
      loadEntries();
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? formatApiError(err.data) : "Could not save entry.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: PasswordEntry) => {
    if (!window.confirm(`Delete "${entry.platform}" for ${entry.client_display}?`)) return;
    setBusyId(entry.id);
    try {
      await api(`/api/passwords/${entry.id}`, { method: "DELETE" });
      showToast("Entry deleted.");
      loadEntries();
    } catch {
      showToast("Could not delete entry.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const revealPassword = async (entry: PasswordEntry) => {
    setBusyId(entry.id);
    try {
      const data = await api<{ password: string }>(`/api/passwords/${entry.id}/reveal`);
      setRevealed((prev) => ({ ...prev, [entry.id]: data.password }));
    } catch {
      showToast("Could not reveal password.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const unrevealPassword = (entryId: number) => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  const changeVaultPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinForm.next !== pinForm.confirm) {
      showToast("New PIN and confirmation do not match.", "error");
      return;
    }
    setPinChangeBusy(true);
    try {
      await api("/api/passwords/vault/pin", {
        method: "POST",
        body: JSON.stringify({ current_pin: pinForm.current, new_pin: pinForm.next }),
      });
      showToast("Vault PIN updated.");
      setPinForm({ current: "", next: "", confirm: "" });
      setPinSettingsOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Could not update PIN.", "error");
    } finally {
      setPinChangeBusy(false);
    }
  };

  if (!hasAccess) {
    return <p className="muted">You do not have access to the Passwords vault.</p>;
  }

  const showGate = vaultGate === "animating" || vaultGate === "pin";

  return (
    <div className="passwords-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Passwords</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isSuperadmin && (
            <button className="btn btn-ghost" onClick={() => setPinSettingsOpen(true)} disabled={!unlocked}>
              <i className="bi bi-shield-lock-fill" /> Vault PIN
            </button>
          )}
          <button className="btn btn-accent" onClick={openCreate} disabled={!unlocked}>
            <i className="bi bi-plus-lg" /> Add Entry
          </button>
        </div>
      </div>

      <div className="card" style={{ opacity: unlocked ? 1 : 0.45, pointerEvents: unlocked ? "auto" : "none" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search client, platform, username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
            disabled={!unlocked}
          />
        </div>
        {vaultGate === "checking" && <p className="muted">Checking vault…</p>}
        {unlocked && loading && <p className="muted">Loading…</p>}
        {unlocked && !loading && filtered.length === 0 && <p className="muted">No entries yet.</p>}
        {unlocked && !loading && groupedByClient.length > 0 && (
          <div className="password-vault-groups">
            {groupedByClient.map((group) => (
              <section key={group.key} className="password-client-group">
                <div className="password-client-group__header">
                  <span className="password-client-group__icon">
                    <i className="bi bi-building" />
                  </span>
                  <div className="password-client-group__title">
                    <strong>{group.label}</strong>
                    <span className="muted">
                      {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="kwick-table">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Username</th>
                        <th>Password</th>
                        <th>Expiry</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.platform}</td>
                          <td>{entry.username || "—"}</td>
                          <td style={{ fontFamily: "monospace", fontSize: 13 }}>
                            {revealed[entry.id] ?? (entry.has_password ? "••••••••" : "—")}
                          </td>
                          <td className="muted">{formatDate(entry.expiry_date)}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {entry.link?.trim() && (
                              <a
                                href={externalHref(entry.link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-ghost btn-sm"
                                title="Open link"
                                aria-label={`Open ${entry.platform} link`}
                              >
                                <i className="bi bi-box-arrow-up-right" />
                              </a>
                            )}
                            {entry.has_password && !revealed[entry.id] && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busyId === entry.id}
                                onClick={() => revealPassword(entry)}
                              >
                                Reveal
                              </button>
                            )}
                            {revealed[entry.id] && (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => unrevealPassword(entry.id)}
                              >
                                Unreveal
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(entry)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: "var(--danger)" }}
                              disabled={busyId === entry.id}
                              onClick={() => deleteEntry(entry)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showGate && (
          <motion.div
            className="vault-gate-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {vaultGate === "animating" && <VaultAccessAnimation />}
            {vaultGate === "pin" && (
              <motion.div
                className="card vault-pin-card"
                initial={{ opacity: 0, y: 20, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <form onSubmit={submitPin}>
                  <span className="card-title" style={{ margin: 0 }}>
                    <i className="bi bi-shield-lock-fill" style={{ color: "var(--gold)" }} />
                    Enter vault PIN
                  </span>
                  <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    Enter the 4-digit PIN to access the password vault.
                  </p>
                  <PinInput value={pin} onChange={setPin} autoFocus disabled={pinBusy} ariaLabel="Vault PIN" />
                  {pinError && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 12, textAlign: "center" }}>{pinError}</p>}
                  <button className="btn" style={{ marginTop: 18, width: "100%" }} disabled={pinBusy || pin.length !== 4}>
                    {pinBusy ? "Checking…" : "Unlock vault"}
                  </button>
                </form>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Modal open={pinSettingsOpen} onClose={() => !pinChangeBusy && setPinSettingsOpen(false)} wide={false}>
        <form onSubmit={changeVaultPin}>
          <span className="card-title" style={{ margin: 0 }}>
            <i className="bi bi-shield-lock-fill" style={{ color: "var(--gold)" }} />
            Vault PIN
          </span>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            Change the shared 4-digit PIN used to unlock the password vault.
          </p>
          <div style={{ marginTop: 14, display: "grid", gap: 16 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Current PIN</label>
              <PinInput
                value={pinForm.current}
                onChange={(v) => setPinForm((f) => ({ ...f, current: v }))}
                disabled={pinChangeBusy}
                ariaLabel="Current PIN"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>New PIN</label>
              <PinInput
                value={pinForm.next}
                onChange={(v) => setPinForm((f) => ({ ...f, next: v }))}
                disabled={pinChangeBusy}
                ariaLabel="New PIN"
              />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Confirm PIN</label>
              <PinInput
                value={pinForm.confirm}
                onChange={(v) => setPinForm((f) => ({ ...f, confirm: v }))}
                disabled={pinChangeBusy}
                ariaLabel="Confirm PIN"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" disabled={pinChangeBusy || pinForm.current.length !== 4 || pinForm.next.length !== 4 || pinForm.confirm.length !== 4}>
              {pinChangeBusy ? "Saving…" : "Update PIN"}
            </button>
            <button type="button" className="btn btn-ghost" disabled={pinChangeBusy} onClick={() => setPinSettingsOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={showForm} onClose={() => !saving && setShowForm(false)} wide>
        <form onSubmit={saveEntry}>
          <span className="card-title" style={{ margin: 0 }}>{editingId ? "Edit Entry" : "New Entry"}</span>
          <div className="kwick-form-wide" style={{ marginTop: 14 }}>
            <div className="kwick-form-wide__row kwick-form-wide__row--2">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                <Combobox
                  value={form.client_id ? clients.find((c) => String(c.id) === form.client_id)?.name ?? "" : form.client_name}
                  onChange={(v) => {
                    const match = clients.find((c) => c.name === v);
                    if (match) setForm((f) => ({ ...f, client_id: String(match.id), client_name: "" }));
                    else setForm((f) => ({ ...f, client_id: "", client_name: v }));
                  }}
                  options={clientOptions}
                  placeholder="Select or type a client…"
                  ariaLabel="Client"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Platform</label>
                <input
                  className="input"
                  value={form.platform}
                  onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="kwick-form-wide__row kwick-form-wide__row--2">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Username</label>
                <input className="input" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Password</label>
                <input
                  className="input"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editingId}
                />
              </div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Link</label>
              <input className="input" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Security question</label>
              <input
                className="input"
                value={form.security_question}
                onChange={(e) => setForm((f) => ({ ...f, security_question: e.target.value }))}
              />
            </div>
            <div className="kwick-form-wide__row kwick-form-wide__row--2">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Start date</label>
                <DatePicker value={form.start_date} onChange={(v) => setForm((f) => ({ ...f, start_date: v }))} ariaLabel="Start date" />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Expiry date</label>
                <DatePicker value={form.expiry_date} onChange={(v) => setForm((f) => ({ ...f, expiry_date: v }))} ariaLabel="Expiry date" />
              </div>
            </div>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Comment</label>
              <textarea
                className="input"
                rows={3}
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            {formError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{formError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Add entry"}</button>
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
