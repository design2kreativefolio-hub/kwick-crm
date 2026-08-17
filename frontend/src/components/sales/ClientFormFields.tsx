"use client";

import { DatePicker } from "@/components/DatePicker";
import { Select } from "@/components/Select";
import { ClientFileField } from "@/components/sales/ClientFileField";
import { ClientLogoField } from "@/components/sales/ClientLogoField";
import {
  CLIENT_SERVICES,
  ClientAdditionalField,
  ClientExecutive,
  SalesClientForm,
} from "@/lib/salesClient";

const FIELD_TYPE_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "attachment", label: "Attachment" },
];

export function ClientFormFields({
  form,
  setForm,
  clientId,
  logoUrl = "",
  onLogoUrlChange,
  pendingLogoFile = null,
  onPendingLogoFile,
}: {
  form: SalesClientForm;
  setForm: React.Dispatch<React.SetStateAction<SalesClientForm>>;
  clientId: number | null;
  logoUrl?: string;
  onLogoUrlChange?: (url: string) => void;
  pendingLogoFile?: File | null;
  onPendingLogoFile?: (file: File | null) => void;
}) {
  const patch = (partial: Partial<SalesClientForm>) => setForm((f) => ({ ...f, ...partial }));

  const toggleService = (value: string) =>
    setForm((f) => {
      const on = f.services.includes(value);
      const services = on ? f.services.filter((v) => v !== value) : [...f.services, value];
      return {
        ...f,
        services,
        other_service: value === "other" && on ? "" : f.other_service,
      };
    });

  const updateExecutive = (idx: number, partial: Partial<ClientExecutive>) =>
    setForm((f) => ({
      ...f,
      executives: f.executives.map((e, i) => (i === idx ? { ...e, ...partial } : e)),
    }));

  const addExecutive = () =>
    setForm((f) => ({ ...f, executives: [...f.executives, { name: "", phone: "", email: "" }] }));
  const removeExecutive = (idx: number) =>
    setForm((f) => ({
      ...f,
      executives:
        f.executives.length <= 1
          ? [{ name: "", phone: "", email: "" }]
          : f.executives.filter((_, i) => i !== idx),
    }));

  const updateAdditional = (idx: number, partial: Partial<ClientAdditionalField>) =>
    setForm((f) => ({
      ...f,
      additional_fields: f.additional_fields.map((field, i) => (i === idx ? { ...field, ...partial } : field)),
    }));

  const addAdditional = () =>
    setForm((f) => ({
      ...f,
      additional_fields: [...f.additional_fields, { name: "", field_type: "text", value: "" }],
    }));

  const removeAdditional = (idx: number) =>
    setForm((f) => ({ ...f, additional_fields: f.additional_fields.filter((_, i) => i !== idx) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={fieldGrid}>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Client name
          </label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            required
            placeholder="Client name"
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Start date
          </label>
          <DatePicker
            value={form.start_date}
            onChange={(v) => patch({ start_date: v })}
            ariaLabel="Start date"
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Contact email
          </label>
          <input
            className="input"
            type="email"
            value={form.contact_email}
            onChange={(e) => patch({ contact_email: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Contact phone
          </label>
          <input
            className="input"
            value={form.contact_phone}
            onChange={(e) => patch({ contact_phone: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Website
          </label>
          <input
            className="input"
            value={form.website}
            onChange={(e) => patch({ website: e.target.value })}
            placeholder="www.example.com"
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>
            Theme color
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={form.accent_color || "#3673FC"}
              onChange={(e) => patch({ accent_color: e.target.value })}
              style={{
                width: 44,
                height: 36,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 2,
                background: "#fff",
              }}
              aria-label="Theme color"
            />
            <span className="muted" style={{ fontSize: 12.5, fontFamily: "monospace" }}>
              {form.accent_color || "#3673FC"}
            </span>
          </div>
        </div>
        <ClientLogoField
          clientId={clientId}
          logoUrl={logoUrl}
          onLogoUrlChange={(url) => onLogoUrlChange?.(url)}
          pendingFile={pendingLogoFile}
          onPendingFile={onPendingLogoFile}
        />
      </div>

      <div>
        <label className="field-label" style={{ marginTop: 0 }}>
          Services using
        </label>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 6,
            marginTop: 8,
          }}
        >
          {CLIENT_SERVICES.map((s) => (
            <label key={s.value} style={serviceCheckboxRow}>
              <input
                type="checkbox"
                checked={form.services.includes(s.value)}
                onChange={() => toggleService(s.value)}
              />
              {s.label}
            </label>
          ))}
        </div>
        {form.services.includes("other") && (
          <div style={{ marginTop: 10 }}>
            <label className="field-label" style={{ marginTop: 0 }}>
              Other service
            </label>
            <input
              className="input"
              value={form.other_service}
              onChange={(e) => patch({ other_service: e.target.value })}
              placeholder="Describe the other service…"
            />
          </div>
        )}
      </div>

      <div>
        <label className="field-label" style={{ marginTop: 0 }}>
          Address
        </label>
        <textarea
          className="input"
          rows={3}
          value={form.address}
          onChange={(e) => patch({ address: e.target.value })}
          style={{ resize: "vertical" }}
        />
      </div>

      <div style={fieldGrid}>
        <ClientFileField
          clientId={clientId}
          label="Trade license"
          value={form.trade_license_url}
          onChange={(url) => patch({ trade_license_url: url })}
        />
        <ClientFileField
          clientId={clientId}
          label="VAT registration"
          value={form.vat_registration_url}
          onChange={(url) => patch({ vat_registration_url: url })}
        />
      </div>
      <div>
        <label className="field-label" style={{ marginTop: 0 }}>
          Notes
        </label>
        <textarea
          className="input"
          rows={3}
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          style={{ resize: "vertical" }}
        />
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label className="field-label" style={{ marginTop: 0 }}>
            Company executives
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addExecutive}>
            <i className="bi bi-plus-lg" /> Add executive
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.executives.map((exec, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "flex-end",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Name
                </label>
                <input
                  className="input"
                  value={exec.name}
                  onChange={(e) => updateExecutive(idx, { name: e.target.value })}
                  placeholder="Executive name"
                />
              </div>
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Email
                </label>
                <input
                  className="input"
                  type="email"
                  value={exec.email || ""}
                  onChange={(e) => updateExecutive(idx, { email: e.target.value })}
                  placeholder="email@company.com"
                />
              </div>
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Phone number
                </label>
                <input
                  className="input"
                  value={exec.phone}
                  onChange={(e) => updateExecutive(idx, { phone: e.target.value })}
                  placeholder="Phone"
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)", flexShrink: 0, height: 42 }}
                onClick={() => removeExecutive(idx)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label className="field-label" style={{ marginTop: 0 }}>
            Additional fields
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addAdditional}>
            <i className="bi bi-plus-lg" /> Add field
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.additional_fields.map((field, idx) => (
            <div
              key={idx}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "flex-end",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Field name
                </label>
                <input
                  className="input"
                  value={field.name}
                  onChange={(e) => updateAdditional(idx, { name: e.target.value })}
                />
              </div>
              <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label className="field-label" style={{ marginTop: 0 }}>
                  Type
                </label>
                <Select
                  value={field.field_type}
                  onChange={(v) =>
                    updateAdditional(idx, {
                      field_type: v as "text" | "attachment",
                      value: v === field.field_type ? field.value : "",
                    })
                  }
                  options={FIELD_TYPE_OPTIONS}
                />
              </div>
              {field.field_type === "text" ? (
                <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                  <label className="field-label" style={{ marginTop: 0 }}>
                    Value
                  </label>
                  <input
                    className="input"
                    value={field.value}
                    onChange={(e) => updateAdditional(idx, { value: e.target.value })}
                  />
                </div>
              ) : (
                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <ClientFileField
                    clientId={clientId}
                    label="Attachment"
                    value={field.value}
                    onChange={(url) => updateAdditional(idx, { value: url })}
                  />
                </div>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)", flexShrink: 0, height: 42 }}
                onClick={() => removeAdditional(idx)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const fieldGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 14,
};

const serviceCheckboxRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  padding: "6px 8px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  cursor: "pointer",
};
