// Canonical shape of Estimate.content — mirrors backend/sales/estimate_content.py.

export type EstimateLineItem = {
  description: string;
  details: string;
  qty: number;
  rate: number;
};

export type EstimateContent = {
  quote_number: string;
  bill_to: string;
  client_id: number | null;
  date: string | null;
  expiry_date: string | null;
  currency: string;
  items: EstimateLineItem[];
  notes: string;
  terms: string;
};

const DEFAULT_NOTES = "Looking forward for your business.";

const DEFAULT_TERMS =
  "1. 100% Advance Payment\n" +
  "2. Delivery of the website within 15 working days after receiving the advance payment & all the content and materials from the client.\n" +
  "3. Prices may vary if the services are changed\n" +
  "4. This proposal is valid for 7 days from the date of issue.\n" +
  "5. No refunds once the project has been started\n" +
  "6. 2 Rounds of Corrections are Free of Charge. Extra Corrections will be charged accordingly.";

export function defaultLineItem(): EstimateLineItem {
  return { description: "", details: "", qty: 1, rate: 0 };
}

export function defaultEstimateContent(): EstimateContent {
  return {
    quote_number: "",
    bill_to: "",
    client_id: null,
    date: new Date().toISOString().slice(0, 10),
    expiry_date: null,
    currency: "AED",
    items: [defaultLineItem()],
    notes: DEFAULT_NOTES,
    terms: DEFAULT_TERMS,
  };
}

export function lineAmount(item: EstimateLineItem): number {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  return Math.round(qty * rate * 100) / 100;
}

export function estimateSubtotal(items: EstimateLineItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + lineAmount(item), 0) * 100) / 100;
}

export function mergedEstimateContent(raw: Partial<EstimateContent> | null | undefined): EstimateContent {
  const base = defaultEstimateContent();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    items:
      Array.isArray(raw.items) && raw.items.length > 0
        ? raw.items.map((item) => ({ ...defaultLineItem(), ...item }))
        : base.items,
  };
}
