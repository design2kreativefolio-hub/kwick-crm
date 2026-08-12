"use client";

import { useEffect, useMemo, useState } from "react";

import { Select } from "@/components/Select";
import { api, ApiError, formatApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess, type Module } from "@/lib/auth";
import { useToast } from "@/lib/toast";

type Employee = { id: number; full_name: string; email: string };
type Grant = {
  id: number;
  user: number;
  user_name: string;
  user_email: string;
  module: Module;
};

type PageModule = {
  key: Module;
  label: string;
  blurb: string;
  icon: string;
};

type SectionGroup = {
  label: string;
  icon: string;
  parentKey?: Module;
  pages: PageModule[];
};

/** Grantable pages shown in Roles. Parents (`hr`/`sales`) are not toggled
 * directly — turning every child on/off expands or collapses a legacy parent. */
const SECTIONS: SectionGroup[] = [
  {
    label: "HR",
    icon: "bi-people-fill",
    parentKey: "hr",
    pages: [
      { key: "hr_documents", label: "Documents", blurb: "Letters & employee files", icon: "bi-folder2-open" },
      { key: "hr_staff", label: "Staffs", blurb: "Directory, leave & tickets", icon: "bi-people-fill" },
    ],
  },
  {
    label: "Sales",
    icon: "bi-briefcase-fill",
    parentKey: "sales",
    pages: [
      { key: "sales_clients", label: "Clients", blurb: "Sales client directory", icon: "bi-person-lines-fill" },
      { key: "sales_proposals", label: "Proposals", blurb: "Proposals & estimates", icon: "bi-file-earmark-text-fill" },
      { key: "sales_invoices", label: "Invoices", blurb: "Invoices & billing", icon: "bi-receipt" },
    ],
  },
  {
    label: "Other",
    icon: "bi-grid-fill",
    pages: [
      { key: "renewals", label: "Renewals", blurb: "Hosting, domains, visas", icon: "bi-calendar-check-fill" },
      { key: "reports", label: "Reports", blurb: "Employee and client reports", icon: "bi-bar-chart-line-fill" },
    ],
  },
];

const ALL_PAGE_KEYS: Module[] = SECTIONS.flatMap((s) => s.pages.map((p) => p.key));

export default function RolesPage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyModule, setBusyModule] = useState<Module | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [emps, access] = await Promise.all([
        api<Employee[]>("/api/auth/employees"),
        api<Grant[] | { results: Grant[] }>("/api/auth/module-access"),
      ]);
      setEmployees(emps);
      setGrants(unwrapList(access));
      setSelectedId((prev) => {
        if (prev && emps.some((e) => String(e.id) === prev)) return prev;
        return emps[0] ? String(emps[0].id) : "";
      });
    } catch {
      showToast("Couldn't load roles.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSuperadmin) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin]);

  const selected = useMemo(
    () => employees.find((e) => String(e.id) === selectedId) || null,
    [employees, selectedId]
  );

  const selectedGrantKeys = useMemo(
    () => (selected ? grants.filter((g) => g.user === selected.id).map((g) => g.module) : []),
    [grants, selected]
  );

  const selectedGrantCount = useMemo(
    () => ALL_PAGE_KEYS.filter((k) => hasModuleAccess(selectedGrantKeys, k)).length,
    [selectedGrantKeys]
  );

  const employeeOptions = useMemo(
    () => [
      { value: "", label: "Select employee…" },
      ...employees.map((e) => ({
        value: String(e.id),
        label: e.full_name || e.email,
      })),
    ],
    [employees]
  );

  const grantModule = async (module: Module) => {
    if (!selected) return null;
    const created = await api<Grant>("/api/auth/module-access", {
      method: "POST",
      body: JSON.stringify({ user: selected.id, module }),
    });
    setGrants((prev) => [...prev.filter((g) => !(g.user === selected.id && g.module === module)), created]);
    return created;
  };

  const revokeModule = async (module: Module) => {
    if (!selected) return;
    const grant = grants.find((g) => g.user === selected.id && g.module === module);
    if (!grant) return;
    await api(`/api/auth/module-access/${grant.id}`, { method: "DELETE" });
    setGrants((prev) => prev.filter((g) => g.id !== grant.id));
  };

  /** If a legacy parent grant is on, replace it with explicit children (minus optional). */
  const expandParentIfNeeded = async (parent: Module | undefined, children: Module[], keep: Module[]) => {
    if (!selected || !parent) return;
    const parentGrant = grants.find((g) => g.user === selected.id && g.module === parent);
    if (!parentGrant) return;
    await revokeModule(parent);
    for (const child of children) {
      if (keep.includes(child)) await grantModule(child);
    }
  };

  const togglePage = async (section: SectionGroup, page: PageModule, enable: boolean) => {
    if (!selected) return;
    setBusyModule(page.key);
    try {
      const childKeys = section.pages.map((p) => p.key);
      if (enable) {
        if (hasModuleAccess(selectedGrantKeys, page.key)) return;
        // Drop parent if present so grants stay explicit at page level.
        if (section.parentKey) {
          const parentGrant = grants.find((g) => g.user === selected.id && g.module === section.parentKey);
          if (parentGrant) {
            const keep = childKeys.filter((k) => k === page.key || hasModuleAccess(selectedGrantKeys, k));
            await expandParentIfNeeded(section.parentKey, childKeys, keep);
          } else {
            await grantModule(page.key);
          }
        } else {
          await grantModule(page.key);
        }
        showToast(`${page.label} access granted.`);
      } else {
        if (section.parentKey && selectedGrantKeys.includes(section.parentKey)) {
          const keep = childKeys.filter((k) => k !== page.key);
          await expandParentIfNeeded(section.parentKey, childKeys, keep);
        } else {
          await revokeModule(page.key);
        }
        showToast(`${page.label} access removed.`);
      }
      refreshUser?.();
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't update access.", "error");
    } finally {
      setBusyModule(null);
    }
  };

  const toggleSectionAll = async (section: SectionGroup, enable: boolean) => {
    if (!selected || !section.pages.length) return;
    setBusyModule(section.pages[0].key);
    try {
      if (section.parentKey) {
        // Prefer a single parent grant when enabling everything.
        for (const page of section.pages) {
          if (selectedGrantKeys.includes(page.key)) await revokeModule(page.key);
        }
        if (enable) {
          if (!selectedGrantKeys.includes(section.parentKey)) await grantModule(section.parentKey);
        } else if (selectedGrantKeys.includes(section.parentKey)) {
          await revokeModule(section.parentKey);
        }
      } else {
        for (const page of section.pages) {
          const on = hasModuleAccess(selectedGrantKeys, page.key);
          if (enable && !on) await grantModule(page.key);
          if (!enable && on) await revokeModule(page.key);
        }
      }
      showToast(enable ? `${section.label} access granted.` : `${section.label} access removed.`);
      refreshUser?.();
    } catch (err: unknown) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't update access.", "error");
    } finally {
      setBusyModule(null);
    }
  };

  if (!user) return null;

  if (!isSuperadmin) {
    return <p className="muted">Only the superadmin can manage section roles.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Roles</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Choose an employee and grant access to whole sections or individual pages (e.g. Documents only).
        </p>
      </div>

      <div className="roles-layout">
        <aside className="card roles-sidebar">
          <span className="card-title">Employees</span>
          <div style={{ marginTop: 10, marginBottom: 12 }}>
            <Select
              value={selectedId}
              onChange={setSelectedId}
              options={employeeOptions}
              ariaLabel="Select employee"
            />
          </div>
          {loading && <p className="muted">Loading…</p>}
          {!loading && employees.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>No active employees yet.</p>
          )}
          <div className="roles-employee-list">
            {employees.map((e) => {
              const keys = grants.filter((g) => g.user === e.id).map((g) => g.module);
              const count = ALL_PAGE_KEYS.filter((k) => hasModuleAccess(keys, k)).length;
              const active = String(e.id) === selectedId;
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`roles-employee${active ? " is-active" : ""}`}
                  onClick={() => setSelectedId(String(e.id))}
                >
                  <span className="roles-employee__avatar">
                    {(e.full_name || e.email).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="roles-employee__meta">
                    <strong>{e.full_name || e.email}</strong>
                    <span className="muted">{e.email}</span>
                  </span>
                  <span className={`badge ${count ? "badge-success" : "badge-muted"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="card roles-main">
          {!selected ? (
            <p className="muted">Select an employee to assign sections.</p>
          ) : (
            <>
              <div className="roles-main__head">
                <div>
                  <span className="card-title" style={{ margin: 0 }}>
                    {selected.full_name || selected.email}
                  </span>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
                    {selected.email}
                  </p>
                </div>
                <span className="badge badge-muted">
                  {selectedGrantCount} page{selectedGrantCount === 1 ? "" : "s"}
                </span>
              </div>

              <div className="roles-section-list">
                {SECTIONS.map((section) => {
                  const allOn = section.pages.every((p) => hasModuleAccess(selectedGrantKeys, p.key));
                  const someOn = section.pages.some((p) => hasModuleAccess(selectedGrantKeys, p.key));
                  return (
                    <div key={section.label} className="roles-section">
                      <div className="roles-section__head">
                        <span className="roles-section__title">
                          <i className={`bi ${section.icon}`} />
                          {section.label}
                        </span>
                        {section.pages.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={!!busyModule}
                            onClick={() => toggleSectionAll(section, !allOn)}
                          >
                            {allOn ? "Turn all off" : someOn ? "Grant all" : "Grant all"}
                          </button>
                        )}
                      </div>
                      <div className="roles-module-grid">
                        {section.pages.map((m) => {
                          const on = hasModuleAccess(selectedGrantKeys, m.key);
                          const busy = busyModule === m.key;
                          return (
                            <button
                              key={m.key}
                              type="button"
                              className={`roles-module-card${on ? " is-on" : ""}`}
                              disabled={!!busyModule}
                              onClick={() => togglePage(section, m, !on)}
                              aria-pressed={on}
                            >
                              <span className="roles-module-card__icon">
                                <i className={`bi ${m.icon}`} />
                              </span>
                              <span className="roles-module-card__body">
                                <strong>{m.label}</strong>
                                <span className="muted">{m.blurb}</span>
                              </span>
                              <span className={`roles-module-card__switch${on ? " is-on" : ""}`}>
                                {busy ? "…" : on ? "On" : "Off"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
