"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Combobox } from "@/components/Combobox";
import { useConfirm } from "@/components/ConfirmDialog";
import { DatePicker } from "@/components/DatePicker";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
import { displayUploadedFileName } from "@/lib/files";
import { STATUS_BADGE, PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS, isProjectTerminal, type ProjectStatus } from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";

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
  attachment_url?: string;
  attachment_urls?: string[];
  created_at: string;
};

type ClientOption = { id: number; name: string; services: string[] };
type Contact = { id: number; full_name: string; email: string; role: string };

const STATUS_OPTIONS = PROJECT_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
const STATUS_LABEL = PROJECT_STATUS_LABEL;

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

const ATTACH_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif";

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
  if (!iso || isProjectTerminal(status)) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

function projectAttachmentUrls(p: Project): string[] {
  if (p.attachment_urls?.length) return p.attachment_urls;
  if (p.attachment_url) return [p.attachment_url];
  return [];
}

function buildProjectBody(
  fields: {
    name: string;
    description: string;
    client: string;
    status: ProjectStatus;
    priority: ProjectPriority;
    delivery_date: string;
    members: number[];
  },
  files: File[]
): BodyInit {
  if (!files.length) {
    return JSON.stringify({
      name: fields.name,
      description: fields.description,
      client: fields.client.trim(),
      status: fields.status,
      priority: fields.priority,
      delivery_date: fields.delivery_date || null,
      members: fields.members,
    });
  }
  const fd = new FormData();
  fd.append("name", fields.name);
  fd.append("description", fields.description);
  fd.append("client", fields.client.trim());
  fd.append("status", fields.status);
  fd.append("priority", fields.priority);
  if (fields.delivery_date) fd.append("delivery_date", fields.delivery_date);
  else fd.append("delivery_date", "");
  fd.append("members", JSON.stringify(fields.members));
  files.forEach((f) => fd.append("attachments", f));
  return fd;
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
  const [createAttachments, setCreateAttachments] = useState<File[]>([]);
  const createAttachRef = useRef<HTMLInputElement>(null);

  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editAttachments, setEditAttachments] = useState<File[]>([]);
  const editAttachRef = useRef<HTMLInputElement>(null);

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
    setCreateAttachments([]);
    setError(null);
    setShowForm(true);
  };

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const assigneeId = form.assignee || (user?.id ? String(user.id) : "");
      const members = assigneeId ? [Number(assigneeId)] : [];
      await api<Project>("/api/projects", {
        method: "POST",
        body: buildProjectBody(
          {
            name: form.name,
            description: form.description,
            client: form.client,
            status: form.status,
            priority: form.priority,
            delivery_date: form.delivery_date,
            members,
          },
          createAttachments
        ),
      });
      setForm(emptyForm);
      setCreateAttachments([]);
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
    setEditAttachments([]);
    setEditError(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    setEditError(null);
    setSaving(true);
    try {
      const members = editForm.assignee
        ? [Number(editForm.assignee)]
        : user?.id
          ? [user.id]
          : [];
      await api(`/api/projects/${editingProject.id}`, {
        method: "PATCH",
        body: buildProjectBody(
          {
            name: editForm.name,
            description: editForm.description,
            client: editForm.client,
            status: editForm.status,
            priority: editForm.priority,
            delivery_date: editForm.delivery_date,
            members,
          },
          editAttachments
        ),
      });
      showToast("Project updated.");
      setEditingProject(null);
      setEditAttachments([]);
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
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Attachments</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={createAttachRef}
                  type="file"
                  multiple
                  hidden
                  accept={ATTACH_ACCEPT}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (!picked.length) return;
                    setCreateAttachments((prev) => [...prev, ...picked].slice(0, 5));
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => createAttachRef.current?.click()}
                  disabled={createAttachments.length >= 5}
                >
                  <i className="bi bi-paperclip" /> Choose files
                </button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Up to 5{createAttachments.length ? ` · ${createAttachments.length} selected` : ""}
                </span>
              </div>
              {createAttachments.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                  {createAttachments.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <i className="bi bi-file-earmark" style={{ color: "var(--gold)" }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 8px", color: "var(--danger)" }}
                        onClick={() => setCreateAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove file"
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                  const files = projectAttachmentUrls(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Link href={`/projects/${p.id}`} style={{ color: "var(--navy)" }}>
                            {p.name}
                          </Link>
                          {files.length > 0 && (
                            <a
                              href={files[0]}
                              target="_blank"
                              rel="noreferrer"
                              title={files.map(displayUploadedFileName).join(", ")}
                              aria-label="Open attachment"
                              style={{ color: "var(--gold)", display: "inline-flex" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <i className="bi bi-paperclip" />
                            </a>
                          )}
                        </div>
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
            <div>
              <label className="field-label" style={{ marginTop: 0 }}>Attachments</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <input
                  ref={editAttachRef}
                  type="file"
                  multiple
                  hidden
                  accept={ATTACH_ACCEPT}
                  onChange={(e) => {
                    const picked = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (!picked.length) return;
                    setEditAttachments((prev) => [...prev, ...picked].slice(0, 5));
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => editAttachRef.current?.click()}
                  disabled={editAttachments.length >= 5}
                >
                  <i className="bi bi-paperclip" /> {editAttachments.length || projectAttachmentUrls(editingProject!).length ? "Replace files" : "Choose files"}
                </button>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  Up to 5{editAttachments.length ? ` · ${editAttachments.length} selected` : ""}
                </span>
              </div>
              {editAttachments.length > 0 && (
                <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                  {editAttachments.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <i className="bi bi-file-earmark" style={{ color: "var(--gold)" }} />
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: "2px 8px", color: "var(--danger)" }}
                        onClick={() => setEditAttachments((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="Remove file"
                      >
                        <i className="bi bi-x-lg" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {editingProject && !editAttachments.length && projectAttachmentUrls(editingProject).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
                  {projectAttachmentUrls(editingProject).map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="muted"
                      style={{ fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <i className="bi bi-download" /> {displayUploadedFileName(url) || `Attachment ${i + 1}`}
                    </a>
                  ))}
                </div>
              )}
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
