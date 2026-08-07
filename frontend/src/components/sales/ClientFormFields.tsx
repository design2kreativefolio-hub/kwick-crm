"use client";

import { Select } from "@/components/Select";
import { ClientFileField } from "@/components/sales/ClientFileField";
import {
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
}: {
  form: SalesClientForm;
  setForm: React.Dispatch<React.SetStateAction<SalesClientForm>>;
  clientId: number | null;
}) {
  const patch = (partial: Partial<SalesClientForm>) => setForm((f) => ({ ...f, ...partial }));

  const updateExecutive = (idx: number, partial: Partial<ClientExecutive>) =>
    setForm((f) => ({
      ...f,
      executives: f.executives.map((e, i) => (i === idx ? { ...e, ...partial } : e)),
    }));

  const addExecutive = () => setForm((f) => ({ ...f, executives: [...f.executives, { name: "", phone: "" }] }));
  const removeExecutive = (idx: number) =>
    setForm((f) => ({
      ...f,
      executives: f.executives.length <= 1 ? [{ name: "", phone: "" }] : f.executives.filter((_, i) => i !== idx),
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
          <label className="field-label" style={{ marginTop: 0 }}>Company name</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            required
            placeholder="Company / client name"
          />
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            Used as both name and company.
          </p>
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>Contact email</label>
          <input
            className="input"
            type="email"
            value={form.contact_email}
            onChange={(e) => patch({ contact_email: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>Contact phone</label>
          <input
            className="input"
            value={form.contact_phone}
            onChange={(e) => patch({ contact_phone: e.target.value })}
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>Website</label>
          <input
            className="input"
            value={form.website}
            onChange={(e) => patch({ website: e.target.value })}
            placeholder="www.example.com"
          />
        </div>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>Theme color</label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={form.accent_color || "#3673FC"}
              onChange={(e) => patch({ accent_color: e.target.value })}
              style={{ width: 44, height: 36, border: "1px solid var(--border)", borderRadius: 8, padding: 2, background: "#fff" }}
              aria-label="Theme color"
            />
            <span className="muted" style={{ fontSize: 12.5, fontFamily: "monospace" }}>
              {form.accent_color || "#3673FC"}
            </span>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            Same theme color as Projects → Clients.
          </p>
        </div>
      </div>

      <div>
        <label className="field-label" style={{ marginTop: 0 }}>Address</label>
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
      {!clientId && (
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          File uploads unlock after the client is saved for the first time.
        </p>
      )}

      <div>
        <label className="field-label" style={{ marginTop: 0 }}>Notes</label>
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
          <label className="field-label" style={{ marginTop: 0 }}>Company executives</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addExecutive}>
            <i className="bi bi-plus-lg" /> Add executive
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.executives.map((exec, idx) => (
            <div key={idx} style={{ ...fieldGrid, border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Name</label>
                <input
                  className="input"
                  value={exec.name}
                  onChange={(e) => updateExecutive(idx, { name: e.target.value })}
                  placeholder="Executive name"
                />
              </div>
              <div>
                <label className="field-label" style={{ marginTop: 0 }}>Phone number</label>
                <input
                  className="input"
                  value={exec.phone}
                  onChange={(e) => updateExecutive(idx, { phone: e.target.value })}
                  placeholder="Phone"
                />
              </div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: "var(--danger)" }}
                  onClick={() => removeExecutive(idx)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <label className="field-label" style={{ marginTop: 0 }}>Additional fields</label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addAdditional}>
            <i className="bi bi-plus-lg" /> Add field
          </button>
        </div>
        {form.additional_fields.length === 0 && (
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
            Optional custom fields — text or attachment.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.additional_fields.map((field, idx) => (
            <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={fieldGrid}>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Field name</label>
                  <input
                    className="input"
                    value={field.name}
                    onChange={(e) => updateAdditional(idx, { name: e.target.value })}
                    placeholder="e.g. Contract number"
                  />
                </div>
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Type</label>
                  <Select
                    value={field.field_type}
                    onChange={(v) =>
                      updateAdditional(idx, {
                        field_type: v === "attachment" ? "attachment" : "text",
                        value: v === field.field_type ? field.value : "",
                      })
                    }
                    options={FIELD_TYPE_OPTIONS}
                    ariaLabel="Field type"
                  />
                </div>
              </div>
              {field.field_type === "text" ? (
                <div>
                  <label className="field-label" style={{ marginTop: 0 }}>Value</label>
                  <input
                    className="input"
                    value={field.value}
                    onChange={(e) => updateAdditional(idx, { value: e.target.value })}
                  />
                </div>
              ) : (
                <ClientFileField
                  clientId={clientId}
                  label="Attachment"
                  value={field.value}
                  onChange={(url) => updateAdditional(idx, { value: url })}
                />
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: "var(--danger)", alignSelf: "flex-start" }}
                onClick={() => removeAdditional(idx)}
              >
                Remove field
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
