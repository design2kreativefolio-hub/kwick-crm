"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useConfirm } from "@/components/ConfirmDialog";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SalesClient } from "@/lib/salesClient";
import { useToast } from "@/lib/toast";

export default function SalesClientsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || (user?.module_access ?? []).includes("sales");

  const [clients, setClients] = useState<SalesClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadClients = () => {
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    api<SalesClient[] | { results: SalesClient[] }>(`/api/sales/clients${qs}`)
      .then((d) => setClients(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!hasAccess) return;
    const timer = setTimeout(loadClients, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAccess, search]);

  const deleteClient = async (c: SalesClient) => {
    const ok = await confirm(`Are you sure you want to delete "${c.name}"? This cannot be undone.`, {
      title: "Delete Client",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;

    setBusyId(c.id);
    try {
      await api(`/api/sales/clients/${c.id}`, { method: "DELETE" });
      showToast("Client deleted.");
      loadClients();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete client." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  if (!user) return null;

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to Sales.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {ConfirmDialog}
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Clients</h1>
        <p className="muted" style={{ marginTop: 4 }}>
          Sales clients directory.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <input
          className="input"
          placeholder="Search by name, email or website…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button className="btn btn-accent" onClick={() => router.push("/sales/clients/new")}>
          <i className="bi bi-plus-lg" /> Add Client
        </button>
      </div>

      <div className="card">
        <span className="card-title">
          <i className="bi bi-person-lines-fill" style={{ color: "var(--gold)" }} />
          All Clients
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && clients.length === 0 && <p className="muted">No clients yet.</p>}
        {!loading && clients.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact Email</th>
                  <th>Contact Phone</th>
                  <th>Website</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/sales/clients/${c.id}`} style={{ fontWeight: 600, color: "var(--navy)" }}>
                        {c.name}
                      </Link>
                    </td>
                    <td>{c.contact_email || "—"}</td>
                    <td>{c.contact_phone || "—"}</td>
                    <td>{c.website || "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href={`/sales/clients/${c.id}`} className="btn btn-ghost btn-sm">
                          <i className="bi bi-eye-fill" /> View
                        </Link>
                        <Link href={`/sales/clients/${c.id}?edit=1`} className="btn btn-ghost btn-sm">
                          <i className="bi bi-pencil-fill" /> Edit
                        </Link>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={busyId === c.id}
                          onClick={() => deleteClient(c)}
                        >
                          {busyId === c.id ? "…" : "Delete"}
                        </button>
                      </div>
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
