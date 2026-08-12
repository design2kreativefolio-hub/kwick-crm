"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { Select } from "@/components/Select";
import { api, ApiError, unwrapList } from "@/lib/api";
import { useAuth, hasModuleAccess } from "@/lib/auth";
import { DOC_TYPES, DocType, defaultLetterContent, docTypeLabel } from "@/lib/hrLetterContent";
import { sendDocumentViaEmail } from "@/lib/sendDocumentEmail";
import { useToast } from "@/lib/toast";

type Letter = {
  id: number;
  doc_type: DocType;
  doc_type_label: string;
  title: string;
  staff: number | null;
  staff_name: string;
  status: "draft" | "issued";
  file_url: string;
  created_at: string;
  updated_at: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-muted",
  issued: "badge-success",
};

export default function HrDocumentsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const isSuperadmin = user?.role === "superadmin";
  const hasAccess = isSuperadmin || hasModuleAccess(user?.module_access, "hr_documents");

  const [letters, setLetters] = useState<Letter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [docType, setDocType] = useState<DocType>("experience_letter");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    api<Letter[] | { results: Letter[] }>(`/api/hr/letters${qs}`)
      .then((d) => setLetters(unwrapList(d)))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, [search]);

  const createLetter = async () => {
    setCreating(true);
    try {
      const created = await api<{ id: number }>("/api/hr/letters", {
        method: "POST",
        body: JSON.stringify({
          doc_type: docType,
          title: docTypeLabel(docType),
          content: defaultLetterContent(docType),
        }),
      });
      setCreateOpen(false);
      router.push(`/hr/documents/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't create document." : err.message, "error");
      setCreating(false);
    }
  };

  const deleteLetter = async (letter: Letter) => {
    const name = letter.title || docTypeLabel(letter.doc_type);
    const ok = await confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`, {
      title: "Delete Document",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setBusyId(letter.id);
    try {
      await api(`/api/hr/letters/${letter.id}`, { method: "DELETE" });
      showToast("Document deleted.");
      load();
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't delete document." : err.message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const duplicateLetter = async (letter: Letter) => {
    setBusyId(letter.id);
    try {
      const created = await api<{ id: number }>(`/api/hr/letters/${letter.id}/duplicate`, { method: "POST" });
      showToast("Document duplicated.");
      router.push(`/hr/documents/${created.id}`);
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't duplicate document." : err.message, "error");
      setBusyId(null);
    }
  };

  const sendToEmail = async (letter: Letter) => {
    setSendingId(letter.id);
    try {
      const detail = await api<{
        content: Record<string, any>;
        title: string;
        staff: number | null;
        file_url: string;
      }>(`/api/hr/letters/${letter.id}`);
      let to = String(detail.content?.email || "");
      if (!to && detail.staff) {
        const staffList = await api<{ id: number; email: string }[] | { results: { id: number; email: string }[] }>(
          "/api/hr/staff"
        );
        const list = Array.isArray(staffList) ? staffList : staffList.results || [];
        to = list.find((s) => s.id === detail.staff)?.email || "";
      }
      const res = await api<{ file_url: string }>(`/api/hr/letters/${letter.id}/pdf`, { method: "POST" });
      const subject = detail.title || docTypeLabel(letter.doc_type);
      await sendDocumentViaEmail({
        pdfUrl: res.file_url,
        to,
        subject,
        body: `Please find the attached document.\n\nAttach the downloaded PDF if it is not already attached, then send.`,
        filename: `${subject.replace(/[^\w\-]+/g, "_")}.pdf`,
      });
      showToast(
        to
          ? "Email draft opened. Attach the downloaded PDF before sending."
          : "PDF downloaded. Assign an employee or add an email on the letter, or pick one in your mail app."
      );
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't prepare email." : err.message, "error");
    } finally {
      setSendingId(null);
    }
  };

  if (!hasAccess) {
    return <p className="muted">You don&apos;t have access to HR Documents.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {ConfirmDialog}
      <Modal open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth={440}>
        <span className="card-title" style={{ margin: 0 }}>
          Create document
        </span>
        <label className="field-label" style={{ marginTop: 16 }}>
          Document type
        </label>
        <Select
          value={docType}
          onChange={(v) => setDocType(v as DocType)}
          options={DOC_TYPES.map((d) => ({ value: d.value, label: d.label }))}
          ariaLabel="Document type"
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button className="btn" disabled={creating} onClick={createLetter}>
            {creating ? "Creating…" : "Continue"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={creating} onClick={() => setCreateOpen(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>Documents</h1>
        </div>
        <button className="btn btn-accent" onClick={() => setCreateOpen(true)}>
          <i className="bi bi-plus-lg" /> Create document
        </button>
      </div>

      <input
        className="input"
        placeholder="Search by title, employee or type…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 360 }}
      />

      <div className="card">
        <span className="card-title">
          <i className="bi bi-folder2-open" style={{ color: "var(--gold)" }} />
          All Documents
        </span>
        {loading && <p className="muted">Loading…</p>}
        {!loading && letters.length === 0 && <p className="muted">No documents yet.</p>}
        {!loading && letters.length > 0 && (
          <div className="table-wrap">
            <table className="kwick-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Employee</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>
                      <Link href={`/hr/documents/${l.id}`} style={{ color: "var(--navy)" }}>
                        {l.title || docTypeLabel(l.doc_type)}
                      </Link>
                    </td>
                    <td>{l.doc_type_label || docTypeLabel(l.doc_type)}</td>
                    <td>{l.doc_type === "offer_letter" ? "—" : l.staff_name || "Unassigned"}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[l.status]}`}>{l.status}</span>
                    </td>
                    <td>{new Date(l.updated_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <Link className="btn btn-ghost btn-sm" href={`/hr/documents/${l.id}`}>
                          <i className="bi bi-pencil-fill" /> Edit
                        </Link>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={sendingId === l.id}
                          onClick={() => sendToEmail(l)}
                          title="Open email draft with PDF"
                        >
                          <i className="bi bi-envelope" /> {sendingId === l.id ? "…" : "Send to"}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === l.id}
                          onClick={() => duplicateLetter(l)}
                          title="Duplicate"
                        >
                          <i className="bi bi-copy" /> Duplicate
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--danger)" }}
                          disabled={busyId === l.id}
                          onClick={() => deleteLetter(l)}
                        >
                          <i className="bi bi-trash-fill" />
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
