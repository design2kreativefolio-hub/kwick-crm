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
  description: string;
  image_urls: string[];
  key_problems: string;
  strategy_rows: StrategyRow[];
};

export type PricingItem = {
  enabled: boolean;
  service_name: string;
  ad_budget_label: string;
  ad_budget: string;
  management_fee_label: string;
  management_fee: string;
  rows: PricingRow[];
};

export type ProposalContent = {
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
  about_kreativefolio: { enabled: boolean; content: string };
  about_client: { enabled: boolean; content: string; image_urls: string[] };
  traffic: { enabled: boolean; image_urls: string[] };
  technical_seo: { enabled: boolean; content: string };
  keyword_strategy: { enabled: boolean; image_urls: string[] };
  onpage_seo: { enabled: boolean; content: string; image_urls: string[] };
  geo: { enabled: boolean; description: string; recommendations: string; approach: string };
  social_medias: { enabled: boolean; platforms: SocialPlatformBlock[] };
  what_we_can_do: { enabled: boolean; rows: WhatWeCanDoRow[] };
  pricing: PricingItem[];
  terms: { enabled: boolean; duration: string; payment_percent: string };
  full_page_image: { enabled: boolean; image_url: string };
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
  "<li>Digital Marketing</li><li>Podcast Production</li></ul>";

export function defaultContent(): ProposalContent {
  return {
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
    about_kreativefolio: { enabled: true, content: DEFAULT_ABOUT_KREATIVEFOLIO },
    about_client: { enabled: true, content: "", image_urls: [] },
    traffic: { enabled: true, image_urls: [] },
    technical_seo: { enabled: true, content: "" },
    keyword_strategy: { enabled: true, image_urls: [] },
    onpage_seo: { enabled: true, content: "", image_urls: [] },
    geo: { enabled: true, description: "", recommendations: "", approach: "" },
    social_medias: { enabled: true, platforms: [] },
    what_we_can_do: { enabled: true, rows: [] },
    pricing: [],
    terms: { enabled: true, duration: "6 months", payment_percent: "100" },
    full_page_image: { enabled: true, image_url: "" },
  };
}

export function defaultPricingItem(): PricingItem {
  return {
    enabled: true,
    service_name: "Service",
    ad_budget_label: "Ad Budget",
    ad_budget: "",
    management_fee_label: "Ad Management Fee",
    management_fee: "",
    rows: [],
  };
}

export function defaultSocialPlatform(platform: SocialPlatform): SocialPlatformBlock {
  return { platform, enabled: true, description: "", image_urls: [], key_problems: "", strategy_rows: [] };
}

export function termsHtml(terms: { duration: string; payment_percent: string }): string {
  return (
    "<ol>" +
    `<li>Payment Terms: ${terms.payment_percent || "100"}% advance payment.</li>` +
    `<li>Duration: ${terms.duration || "6 months"}.</li>` +
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
    if (key === "pricing" && Array.isArray(value)) {
      out.pricing = value.map((item) => ({ ...defaultPricingItem(), ...item }));
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
  return out as ProposalContent;
}
