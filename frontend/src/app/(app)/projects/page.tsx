"use client";

import { useEffect, useMemo, useState } from "react";

import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type ProjectStatus = "assigned" | "started" | "waiting_approval" | "completed";

type Project = {
  id: number;
  name: string;
  client: number | null;
  client_name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  members: number[];
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
const STATUS_BADGE: Record<ProjectStatus, string> = {
  assigned: "badge-muted",
  started: "badge-warning",
  waiting_approval: "badge-warning",
  completed: "badge-success",
};
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

const emptyForm = {
  name: "",
  client: "",
  assignee: "",
  status: "assigned" as ProjectStatus,
};

export default function ProjectsPage() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [directory, setDirectory] = useState<Contact[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [showAddClient, setShowAddClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);

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

  const clientOptions = useMemo(
    () => [{ value: "", label: "No client" }, ...clients.map((c) => ({ value: String(c.id), label: c.name }))],
    [clients]
  );
  const assigneeOptions = useMemo(
    () => [{ value: "", label: "Unassigned" }, ...directory.map((c) => ({ value: String(c.id), label: c.full_name || c.email }))],
    [directory]
  );

  const addClient = async () => {
    if (!newClientName.trim()) return;
    setAddingClient(true);
    try {
      const created = await api<ClientOption>("/api/projects/clients", {
        method: "POST",
        body: JSON.stringify({ name: newClientName.trim(), services: [] }),
      });
      setNewClientName("");
      setShowAddClient(false);
      loadClients();
      setForm((f) => ({ ...f, client: String(created.id) }));
      showToast("Client added.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't add that client." : err.message, "error");
    } finally {
      setAddingClient(false);
    }
  };

  const addProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          client: form.client ? Number(form.client) : null,
          status: form.status,
          members: form.assignee ? [Number(form.assignee)] : [],
        }),
      });
      setForm(emptyForm);
      setShowForm(false);
      showToast("Project added.");
      loadProjects();
    } catch (err: any) {
      setError(err instanceof ApiError ? JSON.stringify(err.data) : err.message);
    } finally {
      setCreating(false);
    }
  };

  const changeStatus = async (project: Project, status: string) => {
    setBusyId(project.id);
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, status: status as ProjectStatus } : p)));
    try {
      await api(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    } catch {
      showToast("Couldn't update project status.", "error");
      loadProjects();
    } finally {
      setBusyId(null);
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm("Delete this project?")) return;
    setBusyId(id);
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      showToast("Project deleted.");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete project." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Projects</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Short-term projects — e.g. &quot;Last Flight Out Podcast&quot;. Assign a client, an employee, and track status.
          </p>
        </div>
        {isManager && (
          <button className="btn btn-accent" onClick={() => setShowForm((v) => !v)}>
            <i className="bi bi-plus-lg" /> Add Project
          </button>
        )}
      </div>

      {showForm && isManager && (
        <form className="card" onSubmit={addProject}>
          <span className="card-title">New Project</span>
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
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
            <div style={fieldGrid}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Client
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 8, padding: "1px 8px" }}
                    onClick={() => setShowAddClient((v) => !v)}
                  >
                    + new client
                  </button>
                </label>
                <Select
                  value={form.client}
                  onChange={(v) => setForm((f) => ({ ...f, client: v }))}
                  options={clientOptions}
                  ariaLabel="Client"
                />
                {showAddClient && (
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input
                      className="input"
                      placeholder="New client name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={addingClient || !newClientName.trim()}
                      onClick={addClient}
                    >
                      {addingClient ? "…" : "Add"}
                    </button>
                  </div>
                )}
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
            </div>

            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            <button className="btn" style={{ width: "fit-content" }} disabled={creating}>
              {creating ? "Adding…" : "Add project"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <span className="card-title">
          <i className="bi bi-kanban-fill" style={{ color: "var(--gold)" }} />
          {isManager ? "All Projects" : "My Projects"}
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
                  <th>Status</th>
                  {isManager && <th></th>}
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const assignee = p.members[0] ? directoryById.get(p.members[0]) : undefined;
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: "var(--navy)" }}>{p.name}</td>
                      <td>{p.client_name || "—"}</td>
                      <td>{assignee ? assignee.full_name || assignee.email : "—"}</td>
                      <td>
                        {isManager ? (
                          <div style={{ width: 170 }}>
                            <Select
                              value={p.status}
                              onChange={(v) => changeStatus(p, v)}
                              options={STATUS_OPTIONS}
                              compact
                              ariaLabel={`Change status for ${p.name}`}
                            />
                          </div>
                        ) : (
                          <span className={`badge ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                        )}
                      </td>
                      {isManager && (
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: "var(--danger)" }}
                            disabled={busyId === p.id}
                            onClick={() => deleteProject(p.id)}
                          >
                            <i className="bi bi-trash-fill" />
                          </button>
                        </td>
                      )}
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

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};
