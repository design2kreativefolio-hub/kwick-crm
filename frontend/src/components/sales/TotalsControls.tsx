"use client";

import { DocTotals, DocTotalsFields, DiscountType, computeTotals } from "@/lib/docTotals";

/** Discount + VAT inputs and a running summary, shared by the estimate and invoice builders. */
export function TotalsControls({
  fields,
  subtotal,
  currency,
  onChange,
}: {
  fields: DocTotalsFields;
  subtotal: number;
  currency: string;
  onChange: (partial: Partial<DocTotalsFields>) => void;
}) {
  const t: DocTotals = computeTotals(subtotal, fields);
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  const hasDiscount = fields.discount_type !== "none";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>Discount</label>
          <select
            className="input"
            value={fields.discount_type}
            onChange={(e) => onChange({ discount_type: e.target.value as DiscountType, discount_value: 0 })}
          >
            <option value="none">No discount</option>
            <option value="percent">Percentage (%)</option>
            <option value="amount">Fixed amount</option>
          </select>
        </div>
        {hasDiscount && (
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>
              {fields.discount_type === "percent" ? "Discount %" : `Discount (${currency})`}
            </label>
            <input
              className="input"
              type="number"
              min="0"
              max={fields.discount_type === "percent" ? 100 : undefined}
              step="0.01"
              value={fields.discount_value}
              onChange={(e) => onChange({ discount_value: Number(e.target.value) })}
            />
          </div>
        )}
        <div>
          <label className="field-label" style={{ marginTop: 0 }}>VAT</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, height: 38, fontSize: 14 }}>
            <input
              type="checkbox"
              checked={fields.vat_enabled}
              onChange={(e) => onChange({ vat_enabled: e.target.checked })}
            />
            Add VAT
          </label>
        </div>
        {fields.vat_enabled && (
          <div>
            <label className="field-label" style={{ marginTop: 0 }}>VAT %</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={fields.vat_percent}
              onChange={(e) => onChange({ vat_percent: Number(e.target.value) })}
            />
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
        <span>Subtotal: <strong>{fmt(t.subtotal)}</strong></span>
        {t.discount > 0 && <span>Discount: <strong>-{fmt(t.discount)}</strong></span>}
        {fields.vat_enabled && <span>VAT ({fields.vat_percent}%): <strong>{fmt(t.vat)}</strong></span>}
        <span style={{ fontSize: 15 }}>Total: <strong>{fmt(t.total)}</strong></span>
      </div>
    </div>
  );
}
