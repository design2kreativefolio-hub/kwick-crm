"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BackLink } from "@/components/BackLink";
import { DatePicker } from "@/components/DatePicker";
import { Combobox } from "@/components/Combobox";
import { useConfirm } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { assigneeSelectOptions } from "@/lib/assigneeOptions";
import { useAuth } from "@/lib/auth";
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
const PRIORITY_OPTIONS = (Object.keys(PRIORITY_LABEL) as ProjectPriority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function isOverdue(iso: string | null, status: ProjectStatus) {
  if (!iso || isProjectTerminal(status)) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    client: "",
    assignee: "",
    status: "assigned" as ProjectStatus,
    priority: "medium" as ProjectPriority,
    delivery_date: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api<Project>(`/api/projects/${id}`)
      .then(setProject)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  useEffect(() => {
    api<ClientOption[] | { results: ClientOption[] }>("/api/projects/clients").then((d) => setClients(unwrapList(d))).catch(() => {});
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

  const assigneeLabel = (() => {
    if (!project?.members[0]) return null;
    const named = project.member_names?.[0];
    if (named?.name) return named.name;
    const fromDir = directoryById.get(project.members[0]);
    if (fromDir) return fromDir.full_name || fromDir.email;
    if (user && project.members[0] === user.id) return user.full_name || user.email;
    return null;
  })();
  const overdue = project ? isOverdue(project.delivery_date, project.status) : false;

  const openEdit = () => {
    if (!project) return;
    setEditForm({
      name: project.name,
      description: project.description || "",
      client: project.client || "",
      assignee: project.members[0] ? String(project.members[0]) : user?.id ? String(user.id) : "",
      status: project.status,
      priority: project.priority,
      delivery_date: project.delivery_date || "",
    });
    setEditError(null);
    setEditing(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setEditError(null);
    setSaving(true);
    try {
      const updated = await api<Project>(`/api/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description,
          client: editForm.client.trim(),
          status: editForm.status,
          priority: editForm.priority,
          delivery_date: editForm.delivery_date || null,
          members: editForm.assignee ? [Number(editForm.assignee)] : [],
        }),
      });
      setProject(updated);
      showToast("Project updated.");
      setEditing(false);
    } catch (err: any) {
      setEditError(err instanceof ApiError ? formatApiError(err.data) : err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    if (
      !(await confirm(`Are you sure you want to delete "${project.name}"? This cannot be undone.`, {
        title: "Delete Project",
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}`, { method: "DELETE" });
      showToast("Project deleted.");
      router.push("/projects");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete project." : err.message, "error");
      setBusy(false);
    }
  };

  if (loading) return <p className="muted">Loading…</p>;
  if (notFound || !project) return <p className="muted">Project not found.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <BackLink href="/projects" label="Back to Projects" />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>{project.name}</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={openEdit}>
              <i className="bi bi-pencil-fill" /> Edit
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={busy} onClick={deleteProject}>
              <i className="bi bi-trash-fill" /> Delete
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <span className="card-title">Description</span>
        <p style={{ marginTop: 10, whiteSpace: "pre-wrap", color: project.description ? "var(--text)" : "var(--text-muted)" }}>
          {project.description || "No description added yet."}
        </p>
      </div>

      <div style={infoGrid}>
        <InfoTile icon="bi-person-lines-fill" label="Client" value={project.client || "—"} />
        <InfoTile icon="bi-person-fill" label="Assigned to" value={assigneeLabel || "Unassigned"} />
        <InfoTile
          icon="bi-flag-fill"
          label="Priority"
          value={<span className={`badge ${PRIORITY_BADGE[project.priority]}`}>{PRIORITY_LABEL[project.priority]}</span>}
        />
        <InfoTile
          icon="bi-kanban-fill"
          label="Status"
          value={<span className={`badge ${STATUS_BADGE[project.status]}`}>{STATUS_LABEL[project.status]}</span>}
        />
        <InfoTile
          icon="bi-calendar-event-fill"
          label="Delivery date"
          value={formatDate(project.delivery_date)}
          valueStyle={overdue ? { color: "var(--danger)", fontWeight: 700 } : undefined}
        />
        <InfoTile icon="bi-clock-history" label="Created" value={formatDateTime(project.created_at)} />
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            style={modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setEditing(false)}
          >
            <motion.form
              className="card"
              style={modalCard}
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveEdit}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="card-title" style={{ margin: 0 }}>Edit Project</span>
                <button type="button" className="icon-btn-anim" style={closeBtn} onClick={() => setEditing(false)} aria-label="Close">
                  <i className="bi bi-x-lg" style={{ fontSize: 13 }} />
                </button>
              </div>
              <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Project name</label>
                  <input
                    className="input"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Description</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="What's this project about?"
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Client</label>
                  <Combobox
                    value={editForm.client}
                    onChange={(v) => setEditForm((f) => ({ ...f, client: v }))}
                    options={clientNames}
                    placeholder="Pick an existing client or type one"
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

                {editError && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{editError}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn" disabled={saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      {ConfirmDialog}
    </div>
  );
}

function InfoTile({
  icon,
  label,
  value,
  valueStyle,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
      <span style={tileIcon}>
        <i className={`bi ${icon}`} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, ...valueStyle }}>{value}</div>
      </div>
    </div>
  );
}

const infoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const tileIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  minWidth: 38,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  background: "var(--gold-soft)",
  color: "var(--gold)",
  fontSize: 16,
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(16, 19, 63, 0.35)",
  display: "grid",
  placeItems: "center",
  zIndex: 50,
  padding: 16,
};

const modalCard: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  maxHeight: "90vh",
  overflowY: "auto",
};

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
