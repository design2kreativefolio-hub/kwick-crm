export type ClientExecutive = { name: string; phone: string; email?: string };

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
  start_date: string | null;
  services: string[];
  other_service: string;
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
  start_date: string;
  services: string[];
  other_service: string;
};

/** Same catalog as Projects → Clients / Client.Service. */
export const CLIENT_SERVICES: { value: string; label: string }[] = [
  { value: "branding", label: "Branding" },
  { value: "graphic_design", label: "Graphic Design" },
  { value: "web_design", label: "Web Design & Development" },
  { value: "ads_leads", label: "Ads And Leads Management" },
  { value: "photo_video", label: "Photography & Videography" },
  { value: "digital_marketing", label: "Digital Marketing" },
  { value: "podcast", label: "Podcast Production" },
  { value: "other", label: "Other Services" },
];

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
    executives: [{ name: "", phone: "", email: "" }],
    additional_fields: [],
    accent_color: DEFAULT_CLIENT_ACCENT,
    start_date: "",
    services: [],
    other_service: "",
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
      ? c.executives.map((e) => ({ name: e.name || "", phone: e.phone || "", email: e.email || "" }))
      : [{ name: "", phone: "", email: "" }],
    additional_fields: (c?.additional_fields || []).map((f) => ({
      name: f.name || "",
      field_type: f.field_type === "attachment" ? "attachment" : "text",
      value: f.value || "",
    })),
    accent_color: c?.accent_color || DEFAULT_CLIENT_ACCENT,
    start_date: c?.start_date || "",
    services: Array.isArray(c?.services) ? [...c.services] : [],
    other_service: c?.other_service || "",
  };
}

/** Payload for create/update — company mirrors name; first executive → POC. */
export function clientPayload(form: SalesClientForm) {
  const executives = form.executives
    .filter((e) => e.name.trim() || e.phone.trim() || (e.email || "").trim())
    .map((e) => ({
      name: e.name.trim(),
      phone: e.phone.trim(),
      email: (e.email || "").trim(),
    }));
  const firstExec = executives[0];
  return {
    name: form.name.trim(),
    company: form.name.trim(),
    contact_email: form.contact_email.trim(),
    contact_phone: (firstExec?.phone || form.contact_phone).trim(),
    poc_name: (firstExec?.name || "").trim(),
    notes: form.notes,
    website: form.website.trim(),
    address: form.address.trim(),
    trade_license_url: form.trade_license_url,
    vat_registration_url: form.vat_registration_url,
    executives,
    additional_fields: form.additional_fields.filter((f) => f.name.trim()),
    accent_color: form.accent_color || DEFAULT_CLIENT_ACCENT,
    start_date: form.start_date || null,
    services: form.services,
    other_service: form.services.includes("other") ? form.other_service.trim() : "",
  };
}
