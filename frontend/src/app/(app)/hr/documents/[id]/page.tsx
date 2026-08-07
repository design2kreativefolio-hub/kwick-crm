"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { BackLink } from "@/components/BackLink";
import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { LetterPreview } from "@/components/hr/LetterPreview";
import { api, ApiError, unwrapList } from "@/lib/api";
import {
  DocType,
  LetterContent,
  isAssignable,
  mergedLetterContent,
} from "@/lib/hrLetterContent";
import { useToast } from "@/lib/toast";
import { useDirtySnapshot, useUnsavedChanges } from "@/lib/useUnsavedChanges";

type Staff = { id: number; full_name: string; email: string; job_title?: string; department?: string };

type Letter = {
  id: number;
  doc_type: DocType;
  doc_type_label: string;
  title: string;
  staff: number | null;
  content: LetterContent;
  status: string;
  file_url: string;
};

export default function HrLetterBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [content, setContent] = useState<LetterContent | null>(null);
  const [docName, setDocName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const formState = useMemo(
    () => ({ content, docName, staffId }),
    [content, docName, staffId]
  );
  const { dirty, markClean } = useDirtySnapshot(formState, !loading && !!content && !!letter);
  const { ConfirmDialog } = useUnsavedChanges(dirty);

  useEffect(() => {
    api<Staff[] | { results: Staff[] }>("/api/hr/staff")
      .then((d) => setStaff(unwrapList(d).filter((s: any) => s.role === "employee" || !s.role)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api<Letter>(`/api/hr/letters/${id}`)
      .then((l) => {
        setLetter(l);
        setContent(mergedLetterContent(l.doc_type, l.content));
        setDocName(l.title || l.doc_type_label);
        setStaffId(l.staff ? String(l.staff) : "");
      })
      .catch(() => showToast("Couldn't load document.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const staffOptions = useMemo(
    () => [
      { value: "", label: "— Unassigned —" },
      ...staff.map((s) => ({ value: String(s.id), label: s.full_name || s.email })),
    ],
    [staff]
  );

  const patch = (partial: LetterContent) => setContent((prev) => (prev ? { ...prev, ...partial } : prev));

  const pickStaff = (value: string) => {
    setStaffId(value);
    if (!value) return;
    const s = staff.find((x) => String(x.id) === value);
    if (!s) return;
    patch({
      employee_name: s.full_name || s.email,
      job_title: s.job_title || content?.job_title || "",
      department: s.department || content?.department || "",
      acknowledgment_name: s.full_name || s.email,
    });
  };

  const save = async (): Promise<boolean> => {
    if (!letter || !content) return false;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        content,
        title: docName.trim() || letter.doc_type_label,
      };
      if (isAssignable(letter.doc_type)) {
        payload.staff = staffId ? Number(staffId) : null;
      } else {
        payload.staff = null;
      }
      const updated = await api<Letter>(`/api/hr/letters/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setLetter(updated);
      const nextContent = mergedLetterContent(updated.doc_type, updated.content);
      const nextName = updated.title || updated.doc_type_label;
      const nextStaff = updated.staff ? String(updated.staff) : "";
      setContent(nextContent);
      setDocName(nextName);
      setStaffId(nextStaff);
      markClean({ content: nextContent, docName: nextName, staffId: nextStaff });
      showToast("Document saved.");
      return true;
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't save document." : err.message, "error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    const ok = await save();
    if (!ok) return;
    setExporting(true);
    try {
      const res = await api<{ file_url: string }>(`/api/hr/letters/${id}/pdf`, { method: "POST" });
      window.open(res.file_url, "_blank");
      showToast("PDF exported.");
    } catch (err: any) {
      showToast(err instanceof ApiError ? "Couldn't export PDF." : err.message, "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading || !letter || !content) return <p className="muted">Loading document…</p>;

  const assignable = isAssignable(letter.doc_type);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {ConfirmDialog}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <BackLink href="/hr/documents" label="Back to Documents" />
          <input
            className="input"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            aria-label="Document name"
            placeholder={letter.doc_type_label}
            style={{
              marginTop: 8,
              fontSize: 22,
              fontWeight: 700,
              color: "var(--navy)",
              border: "1px solid transparent",
              background: "transparent",
              padding: "4px 8px",
              marginLeft: -8,
              width: "min(100%, 520px)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.background = "#fff";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.background = "transparent";
            }}
          />
          <p className="muted" style={{ marginTop: 4 }}>
            {letter.doc_type_label} — rename above for the list and PDF filename. The letter itself keeps the type heading.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost" disabled={saving} onClick={save}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-accent" disabled={exporting} onClick={exportPdf}>
            <i className="bi bi-file-earmark-pdf-fill" /> {exporting ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      <div className="proposal-builder-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-person-fill" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Recipient</span>
            </div>
            <div className="section-card-body">
              {assignable ? (
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Assign to employee</label>
                  <Select value={staffId} onChange={pickStaff} options={staffOptions} ariaLabel="Employee" />
                  <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
                    Assigned letters appear on the employee&apos;s Profile → Documents after export.
                  </p>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Offer letters are not assigned to staff — enter the candidate details below.
                </p>
              )}
              <div style={fieldGrid}>
                <div>
                  <label className="field-label">Employee / candidate name</label>
                  <input className="input" value={content.employee_name || ""} onChange={(e) => patch({ employee_name: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Job title / designation</label>
                  <input className="input" value={content.job_title || ""} onChange={(e) => patch({ job_title: e.target.value })} />
                </div>
              </div>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Letter date</label>
                  <DatePicker value={content.date || ""} onChange={(v) => patch({ date: v || null })} ariaLabel="Letter date" />
                </div>
                {(letter.doc_type === "relieving_letter" || letter.doc_type === "handover_letter" || letter.doc_type === "experience_letter") && (
                  <div>
                    <label className="field-label" style={{ marginTop: 0 }}>Department</label>
                    <input className="input" value={content.department || ""} onChange={(e) => patch({ department: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="section-card">
            <div className="section-card-head">
              <i className="bi bi-pencil-square" style={{ color: "var(--gold)", fontSize: 16 }} />
              <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>Letter fields</span>
            </div>
            <div className="section-card-body">
              <LetterFields docType={letter.doc_type} content={content} patch={patch} />
            </div>
          </div>
        </div>

        <div style={{ position: "sticky", top: 16, alignSelf: "flex-start" }}>
          <LetterPreview docType={letter.doc_type} content={content} documentTitle={docName} />
        </div>
      </div>
    </div>
  );
}

function LetterFields({
  docType,
  content,
  patch,
}: {
  docType: DocType;
  content: LetterContent;
  patch: (p: LetterContent) => void;
}) {
  if (docType === "experience_letter") {
    return (
      <>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Start date</label>
            <DatePicker value={content.start_date || ""} onChange={(v) => patch({ start_date: v || null })} ariaLabel="Start date" />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>End date</label>
            <DatePicker value={content.end_date || ""} onChange={(v) => patch({ end_date: v || null })} ariaLabel="End date" />
          </div>
        </div>
        <label className="field-label">Pronoun</label>
        <Select
          value={content.pronoun || "their"}
          onChange={(v) => patch({ pronoun: v })}
          options={[
            { value: "their", label: "their" },
            { value: "his", label: "his" },
            { value: "her", label: "her" },
          ]}
          ariaLabel="Pronoun"
        />
        <label className="field-label">Achievements paragraph</label>
        <textarea className="input" rows={3} value={content.achievements || ""} onChange={(e) => patch({ achievements: e.target.value })} style={{ resize: "vertical" }} />
        <label className="field-label">Closing paragraph</label>
        <textarea className="input" rows={3} value={content.closing || ""} onChange={(e) => patch({ closing: e.target.value })} style={{ resize: "vertical" }} />
        <label className="field-label">Contact information</label>
        <input className="input" value={content.contact_info || ""} onChange={(e) => patch({ contact_info: e.target.value })} />
      </>
    );
  }

  if (docType === "handover_letter") {
    return (
      <>
        <label className="field-label" style={{ marginTop: 0 }}>Last working day</label>
        <DatePicker value={content.last_working_day || ""} onChange={(v) => patch({ last_working_day: v || null })} ariaLabel="Last working day" />
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Phone</label>
            <input className="input" value={content.phone || ""} onChange={(e) => patch({ phone: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Email</label>
            <input className="input" value={content.email || ""} onChange={(e) => patch({ email: e.target.value })} />
          </div>
        </div>
        {(
          [
            ["responsibilities", "1. Handover Of Responsibilities"],
            ["key_contacts", "2. Key Contacts And Critical Information"],
            ["documentation_notes", "3. Documentation And File Handover"],
            ["property_notes", "4. Company Property"],
            ["system_access_notes", "5. System Access And Credentials"],
            ["accounts_notes", "6. Accounts And Financial Handover (If Applicable)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="field-label">{label}</label>
            <textarea
              className="input"
              rows={key === "property_notes" ? 7 : 4}
              value={content[key] || ""}
              onChange={(e) => patch({ [key]: e.target.value })}
              style={{ resize: "vertical" }}
            />
          </div>
        ))}
      </>
    );
  }

  if (docType === "relieving_letter") {
    return (
      <>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Resignation date</label>
            <DatePicker value={content.resignation_date || ""} onChange={(v) => patch({ resignation_date: v || null })} ariaLabel="Resignation date" />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Last working date</label>
            <DatePicker value={content.last_working_date || ""} onChange={(v) => patch({ last_working_date: v || null })} ariaLabel="Last working date" />
          </div>
        </div>
        <label className="field-label">Body paragraph</label>
        <textarea className="input" rows={4} value={content.body_extra || ""} onChange={(e) => patch({ body_extra: e.target.value })} style={{ resize: "vertical" }} />
      </>
    );
  }

  if (docType === "probation_confirmation") {
    return (
      <>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Effective date</label>
            <DatePicker value={content.effective_date || ""} onChange={(v) => patch({ effective_date: v || null })} ariaLabel="Effective date" />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Probation months</label>
            <input className="input" value={content.probation_months || ""} onChange={(e) => patch({ probation_months: e.target.value })} />
          </div>
        </div>
        <label className="field-label">Strengths / performance text</label>
        <textarea className="input" rows={4} value={content.strengths || ""} onChange={(e) => patch({ strengths: e.target.value })} style={{ resize: "vertical" }} />
      </>
    );
  }

  if (docType === "warning_letter") {
    return (
      <>
        <label className="field-label" style={{ marginTop: 0 }}>Subject</label>
        <input className="input" value={content.subject || ""} onChange={(e) => patch({ subject: e.target.value })} />
        <label className="field-label">Incident summary</label>
        <textarea className="input" rows={3} value={content.incident_summary || ""} onChange={(e) => patch({ incident_summary: e.target.value })} style={{ resize: "vertical" }} />
        <label className="field-label">Details</label>
        <textarea className="input" rows={4} value={content.details || ""} onChange={(e) => patch({ details: e.target.value })} style={{ resize: "vertical" }} />
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Response hours</label>
            <input className="input" value={content.response_hours || ""} onChange={(e) => patch({ response_hours: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Acknowledgment name</label>
            <input className="input" value={content.acknowledgment_name || ""} onChange={(e) => patch({ acknowledgment_name: e.target.value })} />
          </div>
        </div>
      </>
    );
  }

  if (docType === "increment_letter") {
    return (
      <>
        <label className="field-label" style={{ marginTop: 0 }}>Effective date</label>
        <DatePicker value={content.effective_date || ""} onChange={(v) => patch({ effective_date: v || null })} ariaLabel="Effective date" />
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Current salary (AED)</label>
            <input className="input" value={content.current_salary || ""} onChange={(e) => patch({ current_salary: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>New salary (AED)</label>
            <input className="input" value={content.new_salary || ""} onChange={(e) => patch({ new_salary: e.target.value })} />
          </div>
        </div>
      </>
    );
  }

  if (docType === "payslip_letter") {
    return (
      <>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Period</label>
            <input className="input" value={content.period || ""} onChange={(e) => patch({ period: e.target.value })} placeholder="e.g. July 2026" />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Employee ID</label>
            <input className="input" value={content.employee_id || ""} onChange={(e) => patch({ employee_id: e.target.value })} />
          </div>
        </div>
        <label className="field-label">Date of joining</label>
        <DatePicker value={content.date_of_joining || ""} onChange={(v) => patch({ date_of_joining: v || null })} ariaLabel="Date of joining" />
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Bank name</label>
            <input className="input" value={content.bank_name || ""} onChange={(e) => patch({ bank_name: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Bank A/C No</label>
            <input className="input" value={content.bank_account || ""} onChange={(e) => patch({ bank_account: e.target.value })} />
          </div>
        </div>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Payment mode</label>
            <input className="input" value={content.payment_mode || ""} onChange={(e) => patch({ payment_mode: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Days worked</label>
            <input className="input" value={content.days_worked || ""} onChange={(e) => patch({ days_worked: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Absent days</label>
            <input className="input" value={content.absent_days || ""} onChange={(e) => patch({ absent_days: e.target.value })} />
          </div>
        </div>
        <div style={fieldGrid}>
          {(["basic", "housing_allowance", "leave_salary", "other_earnings", "absent_deductions", "other_deductions"] as const).map((key) => (
            <div key={key}>
              <label className="field-label" style={{ marginTop: 0 }}>{key.replace(/_/g, " ")}</label>
              <input className="input" value={content[key] || ""} onChange={(e) => patch({ [key]: e.target.value })} />
            </div>
          ))}
        </div>
        <label className="field-label">Net payable in words</label>
        <input className="input" value={content.net_in_words || ""} onChange={(e) => patch({ net_in_words: e.target.value })} />
      </>
    );
  }

  if (docType === "offer_letter") {
    return (
      <>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Reporting date</label>
            <DatePicker value={content.reporting_date || ""} onChange={(v) => patch({ reporting_date: v || null })} ariaLabel="Reporting date" />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Offer valid until</label>
            <DatePicker value={content.valid_until || ""} onChange={(v) => patch({ valid_until: v || null })} ariaLabel="Valid until" />
          </div>
        </div>
        <div style={fieldGrid}>
          {(
            [
              ["basic_salary", "Basic salary"],
              ["basic_salary_words", "Basic in words"],
              ["hra", "HRA"],
              ["hra_words", "HRA in words"],
              ["other_allowance", "Other allowance"],
              ["other_allowance_words", "Other allowance in words"],
              ["total_salary", "Total"],
              ["total_salary_words", "Total in words"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="field-label" style={{ marginTop: 0 }}>{label}</label>
              <input className="input" value={content[key] || ""} onChange={(e) => patch({ [key]: e.target.value })} />
            </div>
          ))}
        </div>
        <div style={fieldGrid}>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Probation months</label>
            <input className="input" value={content.probation_months || ""} onChange={(e) => patch({ probation_months: e.target.value })} />
          </div>
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>Notice period text</label>
            <input className="input" value={content.notice_period || ""} onChange={(e) => patch({ notice_period: e.target.value })} />
          </div>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginTop: 8 }}>
          <input type="checkbox" checked={!!content.include_commission} onChange={(e) => patch({ include_commission: e.target.checked })} />
          Include commission clause (BDE)
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>
          <input type="checkbox" checked={!!content.include_telephone} onChange={(e) => patch({ include_telephone: e.target.checked })} />
          Include telephone allowance (BDE)
        </label>
      </>
    );
  }

  return <p className="muted">No extra fields for this type.</p>;
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 14,
};
