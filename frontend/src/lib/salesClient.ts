export type ClientExecutive = { name: string; phone: string };

export type ClientAdditionalField = {
  name: string;
  field_type: "text" | "attachment";
  value: string;
};

export const DEFAULT_CLIENT_ACCENT = "#3673FC";

export type SalesClient = {
  id: number;
  name: string;
  company: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  website: string;
  address: string;
  trade_license_url: string;
  vat_registration_url: string;
  executives: ClientExecutive[];
  additional_fields: ClientAdditionalField[];
  accent_color: string;
  logo_url: string;
  created_at: string;
  updated_at?: string;
};

export type SalesClientForm = {
  name: string;
  contact_email: string;
  contact_phone: string;
  notes: string;
  website: string;
  address: string;
  trade_license_url: string;
  vat_registration_url: string;
  executives: ClientExecutive[];
  additional_fields: ClientAdditionalField[];
  accent_color: string;
};

export function emptyClientForm(): SalesClientForm {
  return {
    name: "",
    contact_email: "",
    contact_phone: "",
    notes: "",
    website: "",
    address: "",
    trade_license_url: "",
    vat_registration_url: "",
    executives: [{ name: "", phone: "" }],
    additional_fields: [],
    accent_color: DEFAULT_CLIENT_ACCENT,
  };
}

export function formFromClient(c: Partial<SalesClient> | null | undefined): SalesClientForm {
  return {
    name: c?.name || "",
    contact_email: c?.contact_email || "",
    contact_phone: c?.contact_phone || "",
    notes: c?.notes || "",
    website: c?.website || "",
    address: c?.address || "",
    trade_license_url: c?.trade_license_url || "",
    vat_registration_url: c?.vat_registration_url || "",
    executives: c?.executives?.length
      ? c.executives.map((e) => ({ name: e.name || "", phone: e.phone || "" }))
      : [{ name: "", phone: "" }],
    additional_fields: (c?.additional_fields || []).map((f) => ({
      name: f.name || "",
      field_type: f.field_type === "attachment" ? "attachment" : "text",
      value: f.value || "",
    })),
    accent_color: c?.accent_color || DEFAULT_CLIENT_ACCENT,
  };
}

/** Payload for create/update — company mirrors name. */
export function clientPayload(form: SalesClientForm) {
  return {
    name: form.name.trim(),
    company: form.name.trim(),
    contact_email: form.contact_email.trim(),
    contact_phone: form.contact_phone.trim(),
    notes: form.notes,
    website: form.website.trim(),
    address: form.address.trim(),
    trade_license_url: form.trade_license_url,
    vat_registration_url: form.vat_registration_url,
    executives: form.executives.filter((e) => e.name.trim() || e.phone.trim()),
    additional_fields: form.additional_fields.filter((f) => f.name.trim()),
    accent_color: form.accent_color || DEFAULT_CLIENT_ACCENT,
  };
}
