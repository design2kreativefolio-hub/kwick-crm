// Canonical shape of Proposal.content (the builder document) — mirrors
// backend/sales/proposal_content.py. Keep the two in sync on keys/shape;
// see "PROPOSAL INSTRUCTIONS - KWICK.docx" for the underlying spec.

export type SocialPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "tiktok"
  | "youtube"
  | "snapchat"
  | "google_ads";

export const SOCIAL_PLATFORM_OPTIONS: { value: SocialPlatform; label: string; icon: string }[] = [
  { value: "instagram", label: "Instagram", icon: "bi-instagram" },
  { value: "facebook", label: "Facebook", icon: "bi-facebook" },
  { value: "linkedin", label: "LinkedIn", icon: "bi-linkedin" },
  { value: "tiktok", label: "TikTok", icon: "bi-tiktok" },
  { value: "youtube", label: "YouTube", icon: "bi-youtube" },
  { value: "snapchat", label: "Snapchat", icon: "bi-snapchat" },
  { value: "google_ads", label: "Google Ads", icon: "bi-google" },
];

export type StrategyRow = { category: string; details: string; goal: string };
export type WhatWeCanDoRow = { area: string; details: string };
export type PricingRow = { category: string; details: string; frequency: string };

export type SocialPlatformBlock = {
  platform: SocialPlatform;
  enabled: boolean;
  page_break_before: boolean;
  // "" -> falls back to the platform's own name (Instagram, Facebook, ...).
  heading: string;
  description_label: string;
  key_problems_label: string;
  col_category: string;
  col_details: string;
  col_goal: string;
  description: string;
  image_urls: string[];
  key_problems: string;
  strategy_rows: StrategyRow[];
};

export type PricingItem = {
  enabled: boolean;
  page_break_before: boolean;
  service_name: string;
  ad_budget_label: string;
  ad_budget: string;
  management_fee_label: string;
  management_fee: string;
  col_category: string;
  col_details: string;
  col_frequency: string;
  rows: PricingRow[];
};

/** User-added section — editable title + description and/or images. */
export type CustomSection = {
  id: string;
  enabled: boolean;
  page_break_before: boolean;
  title: string;
  content: string;
  image_urls: string[];
};

// The nine rich "content" sections (About Kreativefolio … What We Can Do).
export const CONTENT_SECTION_KEYS = [
  "about_kreativefolio",
  "about_client",
  "traffic",
  "technical_seo",
  "keyword_strategy",
  "onpage_seo",
  "geo",
  "social_medias",
  "what_we_can_do",
] as const;

// Every section except Home is drag-reorderable. content.content_order holds
// these built-in keys plus a `custom:<id>` entry for each user-added section,
// in the order they render. Home stays pinned on top.
export const REORDERABLE_SECTION_KEYS = [
  ...CONTENT_SECTION_KEYS,
  "pricing",
  "terms",
  "full_page_image",
] as const;

export function customSectionKey(id: string): string {
  return `custom:${id}`;
}

/** Sanitize a saved order: drop unknown/duplicate keys, then append any
 *  missing built-in sections (canonical order) and any missing custom
 *  sections (in `customIds` order) so older proposals — and any section
 *  added since — still render in a sensible place. */
export function normalizeContentOrder(value: unknown, customIds: string[] = []): string[] {
  const validCustom = new Set(customIds.map(customSectionKey));
  const builtins = new Set<string>(REORDERABLE_SECTION_KEYS);
  const out: string[] = [];
  if (Array.isArray(value)) {
    for (const k of value) {
      if (typeof k !== "string" || out.includes(k)) continue;
      if (builtins.has(k) || validCustom.has(k)) out.push(k);
    }
  }
  for (const k of REORDERABLE_SECTION_KEYS) if (!out.includes(k)) out.push(k);
  for (const id of customIds) {
    const k = customSectionKey(id);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

export type ProposalContent = {
  // Render order of every non-Home section (built-in keys + `custom:<id>`).
  content_order: string[];
  home: {
    enabled: boolean;
    qtn_no: string;
    date: string | null;
    title: string;
    client_id: number | null;
    client_name: string;
    client_email: string;
    client_phone: string;
  };
  about_kreativefolio: { enabled: boolean; page_break_before: boolean; heading: string; content: string };
  about_client: { enabled: boolean; page_break_before: boolean; heading: string; content: string; image_urls: string[] };
  traffic: { enabled: boolean; page_break_before: boolean; heading: string; image_urls: string[] };
  technical_seo: { enabled: boolean; page_break_before: boolean; heading: string; content: string };
  keyword_strategy: { enabled: boolean; page_break_before: boolean; heading: string; image_urls: string[] };
  onpage_seo: { enabled: boolean; page_break_before: boolean; heading: string; content: string; image_urls: string[] };
  geo: {
    enabled: boolean;
    page_break_before: boolean;
    heading: string;
    description_label: string;
    recommendations_label: string;
    approach_label: string;
    description: string;
    recommendations: string;
    approach: string;
  };
  social_medias: { enabled: boolean; page_break_before: boolean; heading: string; platforms: SocialPlatformBlock[] };
  what_we_can_do: {
    enabled: boolean;
    page_break_before: boolean;
    heading: string;
    col_area: string;
    col_details: string;
    rows: WhatWeCanDoRow[];
  };
  // "Pricing" is a repeatable list with no wrapper object, so its section
  // heading lives at the top level.
  pricing_heading: string;
  pricing: PricingItem[];
  terms: { enabled: boolean; page_break_before: boolean; heading: string; duration: string; payment_percent: string };
  full_page_image: { enabled: boolean; image_url: string };
  custom_sections: CustomSection[];
};

// Fixed, non-reorderable section order — the numbers from the spec doc are
// for internal reference only (not shown in the client-facing document).
export const SECTION_META: { key: keyof ProposalContent; label: string; icon: string }[] = [
  { key: "home", label: "Home Page", icon: "bi-house-door-fill" },
  { key: "about_kreativefolio", label: "About Kreativefolio", icon: "bi-building" },
  { key: "about_client", label: "About the Client", icon: "bi-person-badge-fill" },
  { key: "traffic", label: "Traffic", icon: "bi-graph-up-arrow" },
  { key: "technical_seo", label: "Technical SEO", icon: "bi-gear-fill" },
  { key: "keyword_strategy", label: "Keyword Strategy", icon: "bi-search" },
  { key: "onpage_seo", label: "Onpage SEO", icon: "bi-file-earmark-code-fill" },
  { key: "geo", label: "GEO", icon: "bi-robot" },
  { key: "social_medias", label: "Social Medias", icon: "bi-share-fill" },
  { key: "what_we_can_do", label: "What We Can Do", icon: "bi-lightbulb-fill" },
  { key: "pricing", label: "Pricing", icon: "bi-tag-fill" },
  { key: "terms", label: "Terms", icon: "bi-file-text-fill" },
  { key: "full_page_image", label: "Full Page Image", icon: "bi-image-fill" },
];

const DEFAULT_ABOUT_KREATIVEFOLIO =
  "<p>Kreativefolio Marketing Management L.L.C is a full-service creative and growth partner, helping brands stand out through:</p>" +
  "<ul><li>Branding</li><li>Graphic Design</li><li>Web Design &amp; Development</li>" +
  "<li>Ads &amp; Leads Management</li><li>Photography &amp; Videography</li>" +
  "<li>Digital Marketing</li><li>Podcast Marketing</li></ul>";

export function defaultContent(): ProposalContent {
  return {
    content_order: [...REORDERABLE_SECTION_KEYS],
    home: {
      enabled: true,
      qtn_no: "",
      date: new Date().toISOString().slice(0, 10),
      title: "Brand Audit",
      client_id: null,
      client_name: "",
      client_email: "",
      client_phone: "",
    },
    about_kreativefolio: {
      enabled: true,
      page_break_before: false,
      heading: "About Kreativefolio",
      content: DEFAULT_ABOUT_KREATIVEFOLIO,
    },
    about_client: { enabled: true, page_break_before: false, heading: "About the Client", content: "", image_urls: [] },
    traffic: { enabled: true, page_break_before: false, heading: "Traffic", image_urls: [] },
    technical_seo: { enabled: true, page_break_before: false, heading: "Technical SEO", content: "" },
    keyword_strategy: { enabled: true, page_break_before: false, heading: "Keyword Strategy", image_urls: [] },
    onpage_seo: { enabled: true, page_break_before: false, heading: "Onpage SEO", content: "", image_urls: [] },
    geo: {
      enabled: true,
      page_break_before: false,
      heading: "GEO",
      description_label: "Description",
      recommendations_label: "Recommendations",
      approach_label: "Our Approach",
      description: "",
      recommendations: "",
      approach: "",
    },
    social_medias: { enabled: true, page_break_before: false, heading: "Social Medias", platforms: [] },
    what_we_can_do: {
      enabled: true,
      page_break_before: false,
      heading: "What We Can Do",
      col_area: "Area",
      col_details: "How Kreativefolio Can Help",
      rows: [],
    },
    pricing_heading: "Pricing",
    pricing: [],
    terms: {
      enabled: true,
      page_break_before: false,
      heading: "Terms",
      duration: "6 months",
      payment_percent: "100",
    },
    full_page_image: { enabled: true, image_url: "" },
    custom_sections: [],
  };
}

export function defaultPricingItem(): PricingItem {
  return {
    enabled: true,
    page_break_before: false,
    service_name: "Service",
    ad_budget_label: "Ad Budget",
    ad_budget: "",
    management_fee_label: "Ad Management Fee",
    management_fee: "",
    col_category: "Category",
    col_details: "Details",
    col_frequency: "Frequency",
    rows: [],
  };
}

export function defaultCustomSection(): CustomSection {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    enabled: true,
    page_break_before: false,
    title: "Additional section",
    content: "",
    image_urls: [],
  };
}

export function defaultSocialPlatform(platform: SocialPlatform): SocialPlatformBlock {
  return {
    platform,
    enabled: true,
    page_break_before: false,
    heading: "",
    description_label: "Description",
    key_problems_label: "Key Problems Identified",
    col_category: "Category",
    col_details: "Details",
    col_goal: "Goal",
    description: "",
    image_urls: [],
    key_problems: "",
    strategy_rows: [],
  };
}

export function termsHtml(terms: { duration: string; payment_percent: string }): string {
  const duration = (terms.duration || "6 months").replace(/\r\n|\r|\n/g, "<br>");
  return (
    "<ol>" +
    `<li>Payment Terms: ${terms.payment_percent || "100"}% advance payment.</li>` +
    `<li>Duration: ${duration}.</li>` +
    "<li>The quoted prices are based on the specified services; prices may vary if the services are changed.</li>" +
    "<li>This proposal is valid for 7 days from the date of issue.</li>" +
    "</ol>"
  );
}

// Early builds stored a single `image_url` string for fields that are now
// `image_urls` arrays. Backfill so proposals saved before that change don't
// come back with `.map is not a function` crashes or silently lose their
// already-uploaded images — this makes every read self-healing, and the
// proposal's next save persists the migrated shape for good.
function migrateLegacyImages<T extends Record<string, any>>(item: T): T {
  const legacy = (item as any).image_url;
  const migrated: any = { ...item };
  if ((!migrated.image_urls || migrated.image_urls.length === 0) && legacy) {
    migrated.image_urls = [legacy];
  }
  delete migrated.image_url;
  return migrated;
}

// Deep-merge saved content over the defaults so a proposal saved before a
// section existed (or with a section never touched) still has every key —
// components can read content.x.y directly instead of optional-chaining
// everywhere. Also normalizes every item *inside* the pricing/social-platform
// lists over their own defaults — without this, an old item missing a field
// added later (e.g. a pricing label, or image_urls before it existed) comes
// back `undefined` instead of the field's default, which crashes anything
// that calls .map()/.filter() on it without a null check.
export function mergedContent(raw: Partial<ProposalContent> | null | undefined): ProposalContent {
  const base = defaultContent();
  if (!raw) return base;
  const out: any = base;
  for (const key of Object.keys(base) as (keyof ProposalContent)[]) {
    const value = (raw as any)[key];
    if (value === undefined || value === null) continue;
    if (key === "content_order") {
      // Normalized after the loop, once custom_sections (and their ids) are resolved.
      out.content_order = Array.isArray(value) ? value.slice() : base.content_order;
    } else if (key === "pricing" && Array.isArray(value)) {
      out.pricing = value.map((item) => ({ ...defaultPricingItem(), ...item }));
    } else if (key === "custom_sections" && Array.isArray(value)) {
      out.custom_sections = value.map((item) => ({
        ...defaultCustomSection(),
        ...item,
        id: item?.id || defaultCustomSection().id,
        image_urls: Array.isArray(item?.image_urls) ? item.image_urls : [],
      }));
    } else if (key === "social_medias" && value && typeof value === "object") {
      const platforms = Array.isArray(value.platforms) ? value.platforms : [];
      out.social_medias = {
        ...(base.social_medias as object),
        ...value,
        platforms: platforms.map((p: any) => migrateLegacyImages({ ...defaultSocialPlatform(p.platform), ...p })),
      };
    } else if (
      (key === "about_client" || key === "traffic" || key === "onpage_seo") &&
      value &&
      typeof value === "object"
    ) {
      out[key] = migrateLegacyImages({ ...(base[key] as object), ...value });
    } else if (Array.isArray(base[key])) {
      out[key] = value;
    } else if (typeof base[key] === "object") {
      out[key] = { ...(base[key] as object), ...value };
    } else {
      out[key] = value;
    }
  }
  out.content_order = normalizeContentOrder(
    out.content_order,
    (out.custom_sections || []).map((s: any) => s?.id).filter(Boolean)
  );
  return out as ProposalContent;
}
