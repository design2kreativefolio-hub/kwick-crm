// Canonical shape of Invoice.content — mirrors backend/sales/invoice_content.py.

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
  invoice_number: string;
  bill_to: string;
  bill_to_email: string;
  client_id: number | null;
  date: string | null;
  due_date: string | null;
  currency: string;
  items: InvoiceLineItem[];
  payment: InvoicePayment;
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

export function defaultInvoiceContent(): InvoiceContent {
  return {
    title: "Invoice",
    invoice_number: "",
    bill_to: "",
    bill_to_email: "",
    client_id: null,
    date: new Date().toISOString().slice(0, 10),
    due_date: null,
    currency: "AED",
    items: [defaultLineItem()],
    payment: defaultPayment(),
    notes: DEFAULT_NOTES,
  };
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
  const base = defaultInvoiceContent();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    items:
      Array.isArray(raw.items) && raw.items.length > 0
        ? raw.items.map((item) => ({ ...defaultLineItem(), ...item }))
        : base.items,
    payment: { ...defaultPayment(), ...(raw.payment || {}) },
  };
}
