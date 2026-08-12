// Canonical shape of Invoice.content — mirrors backend/sales/invoice_content.py.

export type InvoiceKind = "standard" | "proforma" | "petty_cash";

export type InvoiceLineItem = {
  description: string;
  details: string;
  qty: number;
  rate: number;
};

export type InvoicePayment = {
  payment_method: string;
  bank_name: string;
  account_name: string;
  iban: string;
  paid_amount: string;
};

export type InvoiceContent = {
  title: string;
  invoice_kind: InvoiceKind;
  invoice_number: string;
  bill_to: string;
  bill_to_email: string;
  client_id: number | null;
  date: string | null;
  due_date: string | null;
  currency: string;
  items: InvoiceLineItem[];
  payment: InvoicePayment;
  /** Petty cash only */
  received_by: string;
  /** Petty cash only */
  passed_by: string;
  notes: string;
};

const DEFAULT_NOTES = "Thanks for your business.";

export function defaultLineItem(): InvoiceLineItem {
  return { description: "", details: "", qty: 1, rate: 0 };
}

export function defaultPayment(): InvoicePayment {
  return {
    payment_method: "Bank Transfer",
    bank_name: "",
    account_name: "",
    iban: "",
    paid_amount: "",
  };
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
    bill_to: "",
    bill_to_email: "",
    client_id: null,
    date: new Date().toISOString().slice(0, 10),
    due_date: null,
    currency: "AED",
    items: [defaultLineItem()],
    payment: defaultPayment(),
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
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  return Math.round(qty * rate * 100) / 100;
}

export function invoiceSubtotal(items: InvoiceLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + lineAmount(item), 0) * 100) / 100;
}

export function mergedInvoiceContent(raw: Partial<InvoiceContent> | null | undefined): InvoiceContent {
  const kind = (raw?.invoice_kind as InvoiceKind) || "standard";
  const base = defaultInvoiceContent(kind);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    invoice_kind: kind,
    items:
      Array.isArray(raw.items) && raw.items.length > 0
        ? raw.items.map((item) => ({ ...defaultLineItem(), ...item }))
        : base.items,
    payment: { ...defaultPayment(), ...(raw.payment || {}) },
    received_by: raw.received_by ?? base.received_by,
    passed_by: raw.passed_by ?? base.passed_by,
  };
}
