"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Combobox } from "@/components/Combobox";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { STATUS_BADGE } from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";

type ProjectStatus = "assigned" | "started" | "waiting_approval" | "completed";
type ProjectPriority = "low" | "medium" | "high";

type Project = {
  id: number;
  name: string;
  description: string;
  client: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  start_date: string | null;
  end_date: string | null;
  delivery_date: string | null;
  members: number[];
  member_names: { id: number; name: string }[];
  created_by: number | null;
  created_by_name: string;
  created_at: string;
};

type ClientOption = { id: number; name: string; services: string[] };
type Contact = { id: number; full_name: string; email: string; role: string };

const STATUS_LABEL: Record<ProjectStatus, string> = {
  assigned: "Assigned",
  started: "Started",
  waiting_approval: "Waiting for approval",
  completed: "Completed",
};
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

const PRIORITY_LABEL: Record<ProjectPriority, string> = { low: "Low", medium: "Medium", high: "High" };
const PRIORITY_BADGE: Record<ProjectPriority, string> = {
  low: "badge-muted",
  medium: "badge-warning",
  high: "badge-danger",
};
const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as ProjectPriority[]).map((p) => ({
  value: p,
  label: PRIORITY_LABEL[p],
}));

const emptyForm = {
  name: "",
  description: "",
  client: "",
  assignee: "",
  status: "assigned" as ProjectStatus,
  priority: "medium" as ProjectPriority,
  delivery_date: "",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(iso: string | null, status: ProjectStatus) {
  if (!iso || status === "completed") return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProjects = () => {
    setLoading(true);
    api<Project[] | { results: Project[] }>("/api/projects")
      .then((d) => setProjects(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadClients = () => {
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients")
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {});
  };

  useEffect(() => {
    loadProjects();
    loadClients();
    api<Contact[]>("/api/messages/directory").then(setDirectory).catch(() => {});
  }, []);

  const directoryById = useMemo(() => {
    const map = new Map<number, Contact>();
    directory.forEach((c) => map.set(c.id, c));
    return map;
  }, [directory]);

  const assigneeOptions = useMemo(
    () => assigneeSelectOptions(user, directory),
    [user, directory]
  );

  const clientNames = useMemo(() => clients.map((c) => c.name), [clients]);

  const openCreate = () => {
    setForm({
      ...emptyForm,
      assignee: user?.id ? String(user.id) : "",
    });
    setError(null);
    setShowForm(true);
  };

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const assigneeId = form.assignee || (user?.id ? String(user.id) : "");
      await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          client: form.client.trim(),
          status: form.status,
          priority: form.priority,
          delivery_date: form.delivery_date || null,
          members: assigneeId ? [Number(assigneeId)] : [],
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      showToast("Project added.");
      loadProjects();
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setEditForm({
      name: p.name,
      description: p.description || "",
      client: p.client || "",
      assignee: p.members[0] ? String(p.members[0]) : user?.id ? String(user.id) : "",
      status: p.status,
      priority: p.priority,
      delivery_date: p.delivery_date || "",
    });
    setEditError(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setEditError(null);
    setSaving(true);
    try {
      await api(`/api/projects/${editingProject.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          client: editForm.client.trim(),
          status: editForm.status,
          priority: editForm.priority,
          delivery_date: editForm.delivery_date || null,
          members: editForm.assignee
            ? [Number(editForm.assignee)]
            : user?.id
              ? [user.id]
              : [],
        }),
      });
      showToast("Project updated.");
      setEditingProject(null);
      loadProjects();
    } catch (err: any) {
      setEditError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (p: { id: number; name: string }) => {
    if (
      !(await confirm(`Are you sure you want to delete "${p.name}"? This cannot be undone.`, {
        title: "Delete Project",
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusyId(p.id);
    try {
      await api(`/api/projects/${p.id}`, { method: "DELETE" });
      showToast("Project deleted.");
      setProjects((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete project." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Reveal index={0}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Mini-Projects</h1>
        </div>
        <button className="btn btn-accent" onClick={openCreate}>
          <i className="bi bi-plus-lg" /> Add Project
        </button>
      </div>
      </Reveal>

      <Modal
        open={showForm}
        onClose={() => !creating && setShowForm(false)}
        wide
      >
        <form onSubmit={addProject}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-title" style={{ margin: 0 }}>New Project</span>
            <button
              type="button"
              className="icon-btn-anim"
              style={closeBtn}
              onClick={() => setShowForm(false)}
              aria-label="Close"
              disabled={creating}
            >
              <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
            </button>
          </div>
          <div className="kwick-form-wide" style={{ marginTop: 16 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Project name</label>
              <input
                className="input"
                placeholder="e.g. Last Flight Out Podcast"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="kwick-form-wide__desc">
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={6}
                placeholder="What's this project about?"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="kwick-form-wide__row kwick-form-wide__row--5">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                <Combobox
                  value={form.client}
                  onChange={(v) => setForm((f) => ({ ...f, client: v }))}
                  options={clientNames}
                  placeholder="Pick or type a client"
                  ariaLabel="Client"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Assign to</label>
                <Select
                  value={form.assignee}
                  onChange={(v) => setForm((f) => ({ ...f, assignee: v }))}
                  options={assigneeOptions}
                  ariaLabel="Assign to"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Status</label>
                <Select
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v as ProjectStatus }))}
                  options={STATUS_OPTIONS}
                  ariaLabel="Status"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
                <Select
                  value={form.priority}
                  onChange={(v) => setForm((f) => ({ ...f, priority: v as ProjectPriority }))}
                  options={PRIORITY_OPTIONS}
                  ariaLabel="Priority"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Delivery date</label>
                <DatePicker
                  value={form.delivery_date}
                  onChange={(v) => setForm((f) => ({ ...f, delivery_date: v }))}
                  ariaLabel="Delivery date"
                />
              </div>
            </div>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" disabled={creating}>
                {creating ? "Adding…" : "Add project"}
              </button>
              <button type="button" className="btn btn-ghost" disabled={creating} onClick={() => setShowForm(false)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <Reveal index={1}>
      <div className="card">
        <span className="card-title">
          <i className="bi bi-kanban-fill" style={{ color: "var(--gold)" }} />
          All Mini-Projects
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && projects.length === 0 && <p className="muted">No projects yet.</p>}
        {!loading && projects.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Client</th>
                  <th>Assigned to</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const named = p.member_names?.[0];
                  const fromDir = p.members[0] ? directoryById.get(p.members[0]) : undefined;
                  const assigneeLabel =
                    named?.name ||
                    (fromDir ? fromDir.full_name || fromDir.email : null) ||
                    (user && p.members[0] === user.id ? user.full_name || user.email : null);
                  const overdue = isOverdue(p.delivery_date, p.status);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link href={`/projects/${p.id}`} style={{ color: "var(--navy)" }}>
                          {p.name}
                        </Link>
                      </td>
                      <td>{p.client || "—"}</td>
                      <td>{assigneeLabel || "—"}</td>
                      <td>
                        <span className={`badge ${PRIORITY_BADGE[p.priority]}`}>{PRIORITY_LABEL[p.priority]}</span>
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                      </td>
                      <td style={{ color: overdue ? "var(--danger)" : undefined, fontWeight: overdue ? 700 : undefined }}>
                        {formatDate(p.delivery_date)}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                            <i className="bi bi-pencil-fill" /> Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === p.id}
                            onClick={() => deleteProject(p)}
                            aria-label="Delete project"
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </Reveal>

      <Modal
        open={!!editingProject}
        onClose={() => !saving && setEditingProject(null)}
        wide
      >
        <form onSubmit={saveEdit}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="card-title" style={{ margin: 0 }}>Edit Project</span>
            <button
              type="button"
              className="icon-btn-anim"
              style={closeBtn}
              onClick={() => setEditingProject(null)}
              aria-label="Close"
              disabled={saving}
            >
              <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
            </button>
          </div>
          <div className="kwick-form-wide" style={{ marginTop: 16 }}>
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Project name</label>
              <input
                className="input"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="kwick-form-wide__desc">
              <label className="field-label" style={{ marginTop: 0 }}>Description</label>
              <textarea
                className="input"
                rows={6}
                placeholder="What's this project about?"
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                style={{ resize: "vertical" }}
              />
            </div>
            <div className="kwick-form-wide__row kwick-form-wide__row--5">
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                <Combobox
                  value={editForm.client}
                  onChange={(v) => setEditForm((f) => ({ ...f, client: v }))}
                  options={clientNames}
                  placeholder="Pick or type a client"
                  ariaLabel="Client"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Assign to</label>
                <Select
                  value={editForm.assignee}
                  onChange={(v) => setEditForm((f) => ({ ...f, assignee: v }))}
                  options={assigneeOptions}
                  ariaLabel="Assign to"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Status</label>
                <Select
                  value={editForm.status}
                  onChange={(v) => setEditForm((f) => ({ ...f, status: v as ProjectStatus }))}
                  options={STATUS_OPTIONS}
                  ariaLabel="Status"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Priority</label>
                <Select
                  value={editForm.priority}
                  onChange={(v) => setEditForm((f) => ({ ...f, priority: v as ProjectPriority }))}
                  options={PRIORITY_OPTIONS}
                  ariaLabel="Priority"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Delivery date</label>
                <DatePicker
                  value={editForm.delivery_date}
                  onChange={(v) => setEditForm((f) => ({ ...f, delivery_date: v }))}
                  ariaLabel="Delivery date"
                />
              </div>
            </div>
            {editError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{editError}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditingProject(null)}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {ConfirmDialog}
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  minWidth: 28,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "var(--bg)",
  border: "none",
};
