"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { ClientFormFields } from "@/components/sales/ClientFormFields";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { SalesClient, clientPayload, emptyClientForm } from "@/lib/salesClient";
import { useToast } from "@/lib/toast";

export default function NewSalesClientPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "sales_clients");

  const [form, setForm] = useState(emptyClientForm);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  if (!hasAccess) return <p className="muted">You don&apos;t have access to Sales.</p>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Client name is required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await api<SalesClient>("/api/sales/clients", {
        method: "POST",
        body: JSON.stringify(clientPayload(form)),
      });
      if (pendingLogoFile) {
        try {
          const fd = new FormData();
          fd.append("file", pendingLogoFile);
          await api(`/api/sales/clients/${created.id}/logo`, { method: "POST", body: fd });
        } catch {
          showToast("Client created, but logo upload failed.", "error");
        }
      }
      showToast("Client added.");
      router.replace(`/sales/clients/${created.id}?edit=1`);
    } catch (err: any) {
      setError(err instanceof ApiError ? formatApiError(err.data) || err.message : err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <BackLink href="/sales/clients" label="Back to Clients" />
        <h1 style={{ margin: "8px 0 0", fontSize: 22 }}>Add Client</h1>
      </div>

      <form className="card" onSubmit={submit}>
        <ClientFormFields
          form={form}
          setForm={setForm}
          clientId={null}
          pendingLogoFile={pendingLogoFile}
          onPendingLogoFile={setPendingLogoFile}
        />
        {error && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 12 }}>{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn" disabled={saving}>
            {saving ? "Saving…" : "Create client"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => router.push("/sales/clients")}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
