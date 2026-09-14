// Canonical shape of Invoice.content — mirrors backend/sales/invoice_content.py.

export type InvoiceKind = "standard" | "proforma" | "petty_cash";

export type InvoiceLineItem = {
  description: string;
  // Rich text (HTML from the editor); legacy invoices hold plain text with newlines.
  details: string;
  // When false the Details block is left out of the document entirely.
  show_details: boolean;
  // null / "" = no quantity — hidden in the document and the amount is just the rate.
  qty: number | null;
  rate: number;
};

// Legacy structured bank block — kept only to migrate old invoices into the
// free-form `payment_details` rich text below.
export type LegacyInvoicePayment = {
  payment_method?: string;
  bank_name?: string;
  account_name?: string;
  iban?: string;
  paid_amount?: string;
};

export type InvoiceContent = {
  title: string;
  invoice_kind: InvoiceKind;
  invoice_number: string;
  /** Big heading shown in the document itself — "" falls back to the kind label. */
  doc_heading: string;
  /** Editable "Item & Description" column header in the document. */
  items_heading: string;
  /** Editable "Notes" section heading in the document. */
  notes_heading: string;
  bill_to: string;
  bill_to_email: string;
  client_id: number | null;
  date: string | null;
  due_date: string | null;
  currency: string;
  items: InvoiceLineItem[];
  /** Editable heading for the free-form description block (non-petty-cash). */
  payment_heading: string;
  /** Rich text (HTML) shown under that heading — replaces the old bank fields. */
  payment_details: string;
  /** Petty cash only */
  received_by: string;
  /** Petty cash only */
  passed_by: string;
  notes: string;
};

const DEFAULT_NOTES = "Thanks for your business.";
const DEFAULT_ITEMS_HEADING = "Item & Description";
const DEFAULT_NOTES_HEADING = "Notes";
const DEFAULT_PAYMENT_HEADING = "Payment Details";

export function defaultLineItem(): InvoiceLineItem {
  return { description: "", details: "", show_details: true, qty: 1, rate: 0 };
}

/** Blank/null qty behaves as 1 for the amount; an explicit 0 stays 0. */
export function normalizedQty(qty: InvoiceLineItem["qty"]): number {
  if (qty === null || qty === undefined || (qty as unknown) === "") return 1;
  return Number(qty) || 0;
}

/** Build the migration HTML from an old structured payment block. Returns ""
 *  unless there is a real bank detail beyond the default payment method. */
export function legacyPaymentHtml(p: LegacyInvoicePayment | null | undefined): string {
  if (!p || typeof p !== "object") return "";
  const rows: [string, string][] = (
    [
      ["Payment Method", p.payment_method],
      ["Bank Name", p.bank_name],
      ["Account Name", p.account_name],
      ["IBAN / Account Number", p.iban],
      ["Paid Amount", p.paid_amount],
    ] as [string, string | undefined][]
  )
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => [k, v as string]);
  if (!rows.some(([k]) => k !== "Payment Method")) return "";
  const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<ul>${rows.map(([k, v]) => `<li><strong>${e(k)}:</strong> ${e(v)}</li>`).join("")}</ul>`;
}

export function defaultInvoiceContent(kind: InvoiceKind = "standard"): InvoiceContent {
  const titles: Record<InvoiceKind, string> = {
    standard: "Invoice",
    proforma: "Proforma Invoice",
    petty_cash: "Petty Cash Invoice",
  };
  return {
    title: titles[kind],
    invoice_kind: kind,
    invoice_number: "",
    doc_heading: "",
    items_heading: DEFAULT_ITEMS_HEADING,
    notes_heading: DEFAULT_NOTES_HEADING,
    bill_to: "",
    bill_to_email: "",
    client_id: null,
    date: new Date().toISOString().slice(0, 10),
    due_date: null,
    currency: "AED",
    items: [defaultLineItem()],
    payment_heading: DEFAULT_PAYMENT_HEADING,
    payment_details: "",
    received_by: "",
    passed_by: "",
    notes: DEFAULT_NOTES,
  };
}

export function invoiceDocLabel(kind: InvoiceKind | string | undefined): string {
  if (kind === "proforma") return "PROFORMA INVOICE";
  if (kind === "petty_cash") return "PETTY CASH INVOICE";
  return "INVOICE";
}

export function lineAmount(item: InvoiceLineItem): number {
  const rate = Number(item.rate) || 0;
  return Math.round(normalizedQty(item.qty) * rate * 100) / 100;
}

export function invoiceSubtotal(items: InvoiceLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + lineAmount(item), 0) * 100) / 100;
}

/** Legacy line-item details were plain text with one bullet per line. Convert
 *  that to HTML so the rich-text editor (and the document) keep the line
 *  breaks; anything already containing tags is passed through untouched. */
export function detailsToHtml(details: string): string {
  const d = (details || "").trim();
  if (!d || /<[a-z!/][\s\S]*>/i.test(d)) return d;
  const lines = d
    .split("\n")
    .map((ln) => ln.trim().replace(/^[•\-]\s*/, ""))
    .filter(Boolean);
  if (!lines.length) return "";
  const escLi = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<ul>${lines.map((ln) => `<li>${escLi(ln)}</li>`).join("")}</ul>`;
}

export function mergedInvoiceContent(raw: Partial<InvoiceContent> | null | undefined): InvoiceContent {
  const kind = (raw?.invoice_kind as InvoiceKind) || "standard";
  const base = defaultInvoiceContent(kind);
  if (!raw) return base;
  const merged: InvoiceContent = {
    ...base,
    ...raw,
    invoice_kind: kind,
    doc_heading: raw.doc_heading ?? base.doc_heading,
    items_heading: raw.items_heading || base.items_heading,
    notes_heading: raw.notes_heading || base.notes_heading,
    payment_heading: raw.payment_heading || base.payment_heading,
    payment_details: raw.payment_details ?? base.payment_details,
    items:
      Array.isArray(raw.items) && raw.items.length > 0
        ? raw.items.map((item) => ({ ...defaultLineItem(), ...item }))
        : base.items,
    received_by: raw.received_by ?? base.received_by,
    passed_by: raw.passed_by ?? base.passed_by,
  };
  // One-time migration: fold an old structured bank block into payment_details.
  if (!merged.payment_details.trim()) {
    const legacy = legacyPaymentHtml((raw as { payment?: LegacyInvoicePayment }).payment);
    if (legacy) merged.payment_details = legacy;
  }
  delete (merged as { payment?: unknown }).payment;
  return merged;
}
