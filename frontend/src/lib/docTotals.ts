// Discount + VAT maths shared by estimates and invoices — mirrors backend/sales/totals.py.
// Order: discount comes off the subtotal, VAT is then charged on the discounted amount.

export type DiscountType = "none" | "percent" | "amount";

export type DocTotalsFields = {
  vat_enabled: boolean;
  vat_percent: number;
  discount_type: DiscountType;
  discount_value: number;
};

export const DEFAULT_VAT_PERCENT = 5;

export const TOTALS_DEFAULTS: DocTotalsFields = {
  vat_enabled: false,
  vat_percent: DEFAULT_VAT_PERCENT,
  discount_type: "none",
  discount_value: 0,
};

export type DocTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  vat: number;
  total: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeTotals(subtotal: number, f: Partial<DocTotalsFields>): DocTotals {
  const sub = round2(subtotal);
  const value = Math.max(Number(f.discount_value) || 0, 0);
  let discount = 0;
  if (f.discount_type === "percent") discount = round2((sub * Math.min(value, 100)) / 100);
  else if (f.discount_type === "amount") discount = round2(Math.min(value, sub));
  const taxable = round2(sub - discount);
  const rate = Math.max(Number(f.vat_percent ?? DEFAULT_VAT_PERCENT) || 0, 0);
  const vat = f.vat_enabled ? round2((taxable * rate) / 100) : 0;
  return { subtotal: sub, discount, taxable, vat, total: round2(taxable + vat) };
}

export function discountLabel(f: Partial<DocTotalsFields>): string {
  return f.discount_type === "percent" ? `Discount (${Number(f.discount_value) || 0}%)` : "Discount";
}

export function vatLabel(f: Partial<DocTotalsFields>): string {
  return `VAT (${Number(f.vat_percent ?? DEFAULT_VAT_PERCENT) || 0}%)`;
}
