"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Sheet } from "@/components/bd/Sheet";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { api, ApiError, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SERVICES, SOURCES, loadMailStatus, type BDLead, type DuplicateMatch, type MailStatus } from "@/lib/bd";
import { useToast } from "@/lib/toast";

type Form = {
  company: string;
  contact_name: string;
  designation: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  city: string;
  source: string;
  source_detail: string;
  services: string[];
  est_value: string;
  currency: string;
  note: string;
  owner: string;
};

const EMPTY: Form = {
  company: "",
  contact_name: "",
  designation: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  city: "",
  source: "cold_outreach",
  source_detail: "",
  services: [],
  est_value: "",
  currency: "AED",
  note: "",
  owner: "",
};

function describe(m: DuplicateMatch): { text: string; href?: string } {
  const fields = m.fields.join(" / ");
  if (m.type === "client") {
    return { text: `Already a client${m.name ? ` (${m.name})` : ""} — matched on ${fields}.` };
  }
  if (m.mine) {
    return { text: `You already have this lead${m.name ? `: ${m.name}` : ""} — matched on ${fields}.`, href: m.lead_id ? `/bd/leads/${m.lead_id}` : undefined };
  }
  if (m.lead_id) {
    return {
      text: `${m.owner_name || "Another BDE"} already has this lead (${m.name}) — matched on ${fields}.`,
      href: `/bd/leads/${m.lead_id}`,
    };
  }
  return { text: `Another BDE is already working this contact — matched on ${fields}.` };
}

/** Shrink a phone photo before upload (cards read fine at 1600px, and it is much faster). */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85));
  } catch {
    return file;
  }
}

/** Quick-add (and edit) a lead. Checks for duplicates against leads + clients. */
export function LeadForm({
  open,
  onClose,
  lead,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  lead?: BDLead | null;
  onSaved: (lead: BDLead) => void;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperadmin = user?.role === "superadmin";
  const [f, setF] = useState<Form>(EMPTY);
  const [more, setMore] = useState(false);
  const [dupes, setDupes] = useState<DuplicateMatch[]>([]);
  const [canOverride, setCanOverride] = useState(true);
  const [saving, setSaving] = useState(false);
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [ai, setAi] = useState(false);
  const [scanning, setScanning] = useState(false);
  const cardRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || lead) return;
    loadMailStatus(() => api<MailStatus>("/api/bd/mail-status")).then((s) => setAi(!!s.ai));
  }, [open, lead]);

  useEffect(() => {
    if (!open) return;
    setDupes([]);
    setCanOverride(true);
    if (lead) {
      setF({
        ...EMPTY,
        company: lead.company,
        contact_name: lead.contact_name,
        designation: lead.designation,
        phone: lead.phone,
        whatsapp: lead.whatsapp,
        email: lead.email,
        website: lead.website,
        city: lead.city,
        source: lead.source,
        source_detail: lead.source_detail,
        services: lead.services,
        est_value: Number(lead.est_value) ? String(Number(lead.est_value)) : "",
        currency: lead.currency,
      });
      setMore(true);
    } else {
      setF(EMPTY);
      setMore(false);
    }
  }, [open, lead]);

  useEffect(() => {
    if (!open || !isSuperadmin || lead) return;
    api<{ id: number; name: string }[]>("/api/bd/leads/owners")
      .then(setOwners)
      .catch(() => {});
  }, [open, isSuperadmin, lead]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }));

  const checkDuplicates = async () => {
    if (!(f.phone || f.whatsapp || f.email || f.website)) return;
    try {
      const r = await api<{ duplicates: DuplicateMatch[]; can_override: boolean }>("/api/bd/leads/check-duplicate", {
        method: "POST",
        body: JSON.stringify({ phone: f.phone, whatsapp: f.whatsapp, email: f.email, website: f.website, exclude: lead?.id }),
      });
      setDupes(r.duplicates);
      setCanOverride(r.can_override);
    } catch {
      /* the save itself re-checks on the server */
    }
  };

  // Photo of a business card -> EDITH reads it -> the form fills itself in (nothing is saved yet).
  const scanCard = async (file: File) => {
    setScanning(true);
    try {
      const fd = new FormData();
      fd.append("image", await shrinkPhoto(file), "card.jpg");
      const { fields: x } = await api<{ fields: Record<string, string> }>("/api/bd/leads/scan-card", { method: "POST", body: fd });
      setF((prev) => ({
        ...prev,
        company: x.company || prev.company,
        contact_name: x.contact_name || prev.contact_name,
        designation: x.designation || prev.designation,
        phone: x.phone || prev.phone,
        email: x.email || prev.email,
        website: x.website || prev.website,
        city: x.city || prev.city,
        source: prev.source === "cold_outreach" ? "event" : prev.source,
      }));
      if (x.designation || x.website || x.city) setMore(true);
      const found = Object.values(x).some(Boolean);
      showToast(found ? "Card read. Please check the details." : "Couldn't find any details on that photo.", found ? "success" : "error");
      if (x.phone || x.email || x.website) {
        api<{ duplicates: DuplicateMatch[]; can_override: boolean }>("/api/bd/leads/check-duplicate", {
          method: "POST",
          body: JSON.stringify({ phone: x.phone, email: x.email, website: x.website }),
        })
          .then((r) => {
            setDupes(r.duplicates);
            setCanOverride(r.can_override);
          })
          .catch(() => {});
      }
    } catch (err) {
      showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't read that photo.", "error");
    } finally {
      setScanning(false);
      if (cardRef.current) cardRef.current.value = "";
    }
  };

  const save = async (confirmDuplicate = false) => {
    if (!f.company.trim() && !f.contact_name.trim()) {
      showToast("Add a company or a contact name.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company: f.company.trim(),
        contact_name: f.contact_name.trim(),
        designation: f.designation.trim(),
        phone: f.phone.trim(),
        whatsapp: f.whatsapp.trim(),
        email: f.email.trim(),
        website: f.website.trim(),
        city: f.city.trim(),
        source: f.source,
        source_detail: f.source_detail.trim(),
        services: f.services,
        est_value: f.est_value ? f.est_value : "0",
        currency: f.currency,
        confirm_duplicate: confirmDuplicate,
      };
      if (!lead) {
        payload.note = f.note.trim();
        if (isSuperadmin && f.owner) payload.owner = Number(f.owner);
      }
      const saved = await api<BDLead>(lead ? `/api/bd/leads/${lead.id}` : "/api/bd/leads", {
        method: lead ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      showToast(lead ? "Lead updated." : "Lead added.");
      onSaved(saved);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDupes(err.data?.duplicates ?? []);
        setCanOverride(!!err.data?.can_override);
      } else {
        showToast(err instanceof ApiError ? formatApiError(err.data) : "Couldn't save the lead.", "error");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={lead ? "Edit lead" : "Add lead"}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          {dupes.length > 0 && canOverride && (
            <button className="btn btn-accent" onClick={() => save(true)} disabled={saving}>
              Add anyway
            </button>
          )}
          <button className="btn" onClick={() => save(false)} disabled={saving || (dupes.length > 0 && !canOverride)}>
            {saving ? "Saving…" : lead ? "Save" : "Add lead"}
          </button>
        </>
      }
    >
      {!lead && ai && (
        <div className="bd-doc" style={{ borderStyle: "dashed", alignItems: "center" }}>
          <i className="bi bi-camera" />
          <span style={{ flex: 1 }}>
            <b style={{ display: "block", fontSize: 13.5 }}>Scan a business card</b>
            <span className="muted" style={{ fontSize: 12.5 }}>Take or choose a photo and EDITH fills in the form.</span>
          </span>
          <input
            ref={cardRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void scanCard(file);
            }}
          />
          <button type="button" className="btn btn-sm" onClick={() => cardRef.current?.click()} disabled={scanning}>
            {scanning ? "Reading…" : "Scan"}
          </button>
        </div>
      )}

      {dupes.length > 0 && (
        <div className={`bd-alert${canOverride ? "" : " is-danger"}`} role="alert">
          <i className={`bi ${canOverride ? "bi-exclamation-triangle-fill" : "bi-slash-circle-fill"}`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {dupes.map((m, i) => {
              const d = describe(m);
              return (
                <span key={i}>
                  {d.text}{" "}
                  {d.href && (
                    <Link href={d.href} style={{ fontWeight: 700 }}>
                      Open
                    </Link>
                  )}
                </span>
              );
            })}
            {!canOverride && <b>This contact can&apos;t be added again.</b>}
          </div>
        </div>
      )}

      <div className="bd-grid2">
        <div className="bd-field">
          <label htmlFor="lf-company">Company</label>
          <input id="lf-company" className="input" value={f.company} onChange={(e) => set("company", e.target.value)} autoFocus />
        </div>
        <div className="bd-field">
          <label htmlFor="lf-name">Contact person</label>
          <input id="lf-name" className="input" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} />
        </div>
        <div className="bd-field">
          <label htmlFor="lf-phone">Phone</label>
          <input
            id="lf-phone"
            className="input"
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => set("phone", e.target.value)}
            onBlur={checkDuplicates}
            placeholder="+971 50 123 4567"
          />
        </div>
        <div className="bd-field">
          <label htmlFor="lf-email">Email</label>
          <input
            id="lf-email"
            className="input"
            type="email"
            inputMode="email"
            value={f.email}
            onChange={(e) => set("email", e.target.value)}
            onBlur={checkDuplicates}
          />
        </div>
        <div className="bd-field">
          <span className="bd-label">Source</span>
          <Select value={f.source} onChange={(v) => set("source", v)} options={SOURCES} ariaLabel="Source" />
        </div>
        <div className="bd-field">
          <span className="bd-label">Interested in</span>
          <MultiSelect values={f.services} onChange={(v) => set("services", v)} options={SERVICES} placeholder="Select services…" />
        </div>
      </div>

      {!lead && (
        <div className="bd-field">
          <label htmlFor="lf-note">Note</label>
          <textarea id="lf-note" className="input" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Anything worth remembering from the first contact" />
        </div>
      )}

      {isSuperadmin && !lead && owners.length > 0 && (
        <div className="bd-field">
          <span className="bd-label">Assign to</span>
          <Select
            value={f.owner}
            onChange={(v) => set("owner", v)}
            options={[{ value: "", label: "Auto (round-robin)" }, ...owners.map((o) => ({ value: String(o.id), label: o.name }))]}
            ariaLabel="Assign to"
          />
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setMore((v) => !v)}>
        <i className={`bi ${more ? "bi-chevron-up" : "bi-chevron-down"}`} /> {more ? "Fewer details" : "More details"}
      </button>

      {more && (
        <div className="bd-grid2">
          <div className="bd-field">
            <label htmlFor="lf-wa">WhatsApp (if different)</label>
            <input id="lf-wa" className="input" type="tel" inputMode="tel" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} onBlur={checkDuplicates} />
          </div>
          <div className="bd-field">
            <label htmlFor="lf-web">Website</label>
            <input id="lf-web" className="input" value={f.website} onChange={(e) => set("website", e.target.value)} onBlur={checkDuplicates} placeholder="company.com" />
          </div>
          <div className="bd-field">
            <label htmlFor="lf-desig">Designation</label>
            <input id="lf-desig" className="input" value={f.designation} onChange={(e) => set("designation", e.target.value)} />
          </div>
          <div className="bd-field">
            <label htmlFor="lf-city">City</label>
            <input id="lf-city" className="input" value={f.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="bd-field">
            <label htmlFor="lf-detail">Source detail</label>
            <input id="lf-detail" className="input" value={f.source_detail} onChange={(e) => set("source_detail", e.target.value)} placeholder="Campaign, referrer, event…" />
          </div>
          <div className="bd-field">
            <span className="bd-label">Estimated value</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 96px", gap: 8 }}>
              <input className="input" inputMode="decimal" value={f.est_value} onChange={(e) => set("est_value", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" aria-label="Estimated value" />
              <Select value={f.currency} onChange={(v) => set("currency", v)} options={[{ value: "AED", label: "AED" }, { value: "USD", label: "USD" }]} ariaLabel="Currency" />
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}
