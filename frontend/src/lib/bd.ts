// Business Development (pre-sale pipeline) — shared types, labels and link helpers.

import { timeAgo } from "@/lib/notifications";

export { CLIENT_SERVICES as SERVICES } from "@/lib/salesClient";

export type Currency = "AED" | "USD";

export type DealStage = "qualified" | "meeting" | "proposal_sent" | "negotiation" | "won" | "lost";
export type LeadStatus = "new" | "contacted" | "qualified" | "disqualified" | "converted";
/** Board columns: two lead statuses, then the deal stages. */
export type StageKey = "new" | "contacted" | DealStage;

export type BDDealSummary = {
  id: number;
  title: string;
  stage: DealStage;
  value: string;
  currency: Currency;
  value_aed: string;
  expected_close_date: string | null;
  probability: number;
  lost_reason: string;
  lost_note: string;
  proposal: number | null;
  estimate: number | null;
  client: number | null;
  client_name: string;
  client_code: string;
  invoice: number | null;
  stage_changed_at: string;
  won_at: string | null;
  lost_at: string | null;
};

export type BDLead = {
  id: number;
  owner: number;
  owner_name: string;
  display_name: string;
  company: string;
  contact_name: string;
  designation: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  country: string;
  city: string;
  source: string;
  source_detail: string;
  services: string[];
  est_value: string;
  currency: Currency;
  status: LeadStatus;
  disqualify_reason: string;
  next_follow_up_at: string | null;
  first_contacted_at: string | null;
  last_activity_at: string;
  score: number;
  score_label: "hot" | "warm" | "cold" | "closed" | "won";
  score_reasons: string[];
  deal: BDDealSummary | null;
  created_at: string;
  updated_at: string;
};

export type BDActivity = {
  id: number;
  lead: number;
  user: number | null;
  user_name: string;
  kind: "call" | "whatsapp" | "email" | "meeting" | "note" | "stage_change" | "system";
  direction: "in" | "out";
  outcome: string;
  body: string;
  occurred_at: string;
  meeting_url: string;
};

export type BDFollowUp = {
  id: number;
  lead: number;
  lead_name: string;
  owner_name: string;
  kind: "follow_up" | "call" | "whatsapp" | "email" | "meeting" | "recontact";
  due_at: string;
  note: string;
  meeting_url: string;
  done: boolean;
};

/** The most recent thing logged on a lead (for the "Called 3d ago · No answer" line). */
export type LastTouch = {
  kind: BDActivity["kind"];
  direction: "in" | "out";
  outcome: string;
  at: string;
} | null;

/** Row on My Day (a follow-up joined with its lead's contact details). */
export type DayFollowUp = {
  id: number;
  lead: number;
  lead_name: string;
  contact_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  kind: BDFollowUp["kind"];
  due_at: string;
  note: string;
  meeting_url: string;
  owner: number;
  owner_name: string;
  score: number;
  score_label: BDLead["score_label"];
  score_reasons: string[];
  source: string;
  stage: string;
  value: string;
  currency: Currency;
  last_touch: LastTouch;
};

/** Card on the board / My Day (a lead, or its deal once qualified). */
export type BDCard = {
  id: number; // lead id — always what the detail page opens
  deal_id: number | null;
  kind: "lead" | "deal";
  title: string;
  company: string;
  contact_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  source: string;
  stage: StageKey;
  value: string;
  currency: Currency;
  value_aed: string;
  owner: number;
  owner_name: string;
  next_follow_up_at: string | null;
  last_activity_at: string;
  created_at: string;
  stage_changed_at: string | null;
  quiet_days?: number;
  score?: number;
  score_label?: BDLead["score_label"];
  services?: string[];
};

export type BDMyDay = {
  overdue: DayFollowUp[];
  today: DayFollowUp[];
  new_leads: BDCard[];
  stale_deals: BDCard[];
  meetings: DayFollowUp[];
  counts: Record<"overdue" | "today" | "new_leads" | "stale_deals" | "meetings", number>;
  done_today?: number;
};

export type BDPipeline = {
  columns: { key: StageKey; label: string; count: number; total_aed: string; cards: BDCard[] }[];
  open_total_aed: string;
};

export type DuplicateMatch = {
  type: "lead" | "client";
  fields: string[];
  hard: boolean;
  mine: boolean;
  scope?: "other_bde" | "client";
  lead_id?: number;
  client_id?: number;
  name?: string;
  owner_name?: string;
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export const SOURCES = [
  { value: "website", label: "Website" },
  { value: "meta_ads", label: "Meta ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "referral", label: "Referral" },
  { value: "event", label: "Event" },
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "other", label: "Other" },
];
export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.value, s.label]));

export const STAGES: { key: StageKey; label: string; icon: string }[] = [
  { key: "new", label: "New", icon: "bi-stars" },
  { key: "contacted", label: "Contacted", icon: "bi-telephone-outbound-fill" },
  { key: "qualified", label: "Qualified", icon: "bi-patch-check-fill" },
  { key: "meeting", label: "Meeting", icon: "bi-camera-video-fill" },
  { key: "proposal_sent", label: "Proposal Sent", icon: "bi-send-fill" },
  { key: "negotiation", label: "Negotiation", icon: "bi-chat-left-dots-fill" },
  { key: "won", label: "Won", icon: "bi-trophy-fill" },
  { key: "lost", label: "Lost", icon: "bi-x-octagon-fill" },
];
export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const STAGE_BADGE: Record<string, string> = {
  new: "badge-info",
  contacted: "badge-purple",
  qualified: "badge-teal",
  meeting: "badge-purple",
  proposal_sent: "badge-warning",
  negotiation: "badge-warning",
  won: "badge-success",
  lost: "badge-danger",
  disqualified: "badge-danger",
  converted: "badge-success",
};

export const LOST_REASONS = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "competitor", label: "Went with a competitor" },
  { value: "no_response", label: "No response" },
  { value: "not_a_fit", label: "Not a fit" },
  { value: "other", label: "Other" },
];

export const ACTIVITY_KINDS: { value: BDActivity["kind"]; label: string; icon: string }[] = [
  { value: "call", label: "Call", icon: "bi-telephone-fill" },
  { value: "whatsapp", label: "WhatsApp", icon: "bi-whatsapp" },
  { value: "email", label: "Email", icon: "bi-envelope-fill" },
  { value: "meeting", label: "Meeting", icon: "bi-camera-video-fill" },
  { value: "note", label: "Note", icon: "bi-sticky-fill" },
];
export const KIND_ICON: Record<string, string> = {
  ...Object.fromEntries(ACTIVITY_KINDS.map((k) => [k.value, k.icon])),
  stage_change: "bi-arrow-right-circle-fill",
  system: "bi-gear-fill",
  follow_up: "bi-alarm-fill",
  recontact: "bi-arrow-repeat",
};

export const OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "interested", label: "Interested" },
  { value: "callback", label: "Asked for callback" },
  { value: "no_answer", label: "No answer" },
  { value: "busy", label: "Busy" },
  { value: "not_interested", label: "Not interested" },
];
export const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(OUTCOMES.map((o) => [o.value, o.label]));
export const OUTCOME_BADGE: Record<string, string> = {
  connected: "badge-success",
  interested: "badge-success",
  callback: "badge-warning",
  no_answer: "badge-muted",
  busy: "badge-muted",
  not_interested: "badge-danger",
};

export const FOLLOW_UP_KINDS = [
  { value: "follow_up", label: "Follow-up" },
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
];

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function fmtMoney(value: string | number | null | undefined, currency: string = "AED"): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0`;
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

// ---------------------------------------------------------------------------
// Contact links
// ---------------------------------------------------------------------------
/** Digits-only international number for wa.me ("050 123 4567" → "971501234567"). */
export function waDigits(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && d.length === 10) d = `971${d.slice(1)}`;
  else if (d.length === 9 && d.startsWith("5")) d = `971${d}`;
  return d;
}

export function telUrl(phone: string): string {
  const d = waDigits(phone);
  return d ? `tel:+${d}` : "";
}

export function waUrl(phone: string, text = ""): string {
  const d = waDigits(phone);
  if (!d) return "";
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function mailUrl(email: string, subject = "", body = ""): string {
  if (!email) return "";
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`]
    .filter(Boolean)
    .join("&");
  return `mailto:${email}${q ? `?${q}` : ""}`;
}

export type MessageTemplate = { id: string; label: string; text: string };

/** Ready-made WhatsApp messages. {name}, {company} and {me} are filled in. */
export const WA_TEMPLATES: MessageTemplate[] = [
  {
    id: "intro",
    label: "Introduction",
    text: "Hi {name}, this is {me} from Kreativefolio. Thanks for your interest — I'd love to understand what you're looking for and see how we can help {company}. When would be a good time for a quick call?",
  },
  {
    id: "missed",
    label: "Missed call",
    text: "Hi {name}, {me} from Kreativefolio here — I just tried calling you. Is there a good time to speak today?",
  },
  {
    id: "followup",
    label: "Follow-up",
    text: "Hi {name}, just following up on our last conversation about {company}. Do you have any questions I can help with?",
  },
  {
    id: "meeting",
    label: "Meeting request",
    text: "Hi {name}, would you be free for a short meeting this week to go through your requirements? Let me know a time that suits you and I'll send an invite. — {me}, Kreativefolio",
  },
  {
    id: "proposal",
    label: "Proposal sent",
    text: "Hi {name}, I've just sent over the proposal for {company}. Please have a look and tell me what you think — happy to walk you through it. — {me}, Kreativefolio",
  },
  {
    id: "nudge",
    label: "Gentle nudge",
    text: "Hi {name}, a quick check-in on the proposal I shared. Anything I can clarify or adjust to help you decide? — {me}, Kreativefolio",
  },
];

export function fillTemplate(text: string, vars: { name?: string; company?: string; me?: string }): string {
  return text
    .replace(/\{name\}/g, (vars.name || "there").split(" ")[0])
    .replace(/\{company\}/g, vars.company || "your business")
    .replace(/\{me\}/g, vars.me || "the Kreativefolio team");
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

export function toLocalIso(date: string, time: string): string {
  // date "YYYY-MM-DD" + time "HH:MM" in the user's timezone → ISO instant
  return new Date(`${date}T${time || "09:00"}:00`).toISOString();
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "Today 3:30 PM", "Tomorrow 9:00 AM", "Mon 17 Nov, 9:00 AM". */
export function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000
  );
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Tomorrow ${time}`;
  if (diff === -1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

export function isOverdue(iso: string | null | undefined): boolean {
  return !!iso && new Date(iso).getTime() < Date.now();
}

/** "3h late", "1 day late" - how far past due a follow-up is ("" when it isn't). */
export function lateLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins}m late`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h late`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} late`;
}

const TOUCH_VERB: Record<string, [string, string]> = {
  call: ["Called", "Call from them"],
  whatsapp: ["WhatsApp sent", "WhatsApp from them"],
  email: ["Emailed", "Email from them"],
  meeting: ["Met", "Met"],
  note: ["Note added", "They enquired"],
};

/** "Called 3d ago · No answer" */
export function touchLine(t: LastTouch): string {
  if (!t) return "Not contacted yet";
  const [out, inn] = TOUCH_VERB[t.kind] ?? ["Touched", "Touched"];
  const base = `${t.direction === "in" ? inn : out} ${timeAgo(t.at).toLowerCase()}`;
  return t.outcome ? `${base} · ${OUTCOME_LABEL[t.outcome] ?? t.outcome}` : base;
}

export function initials(name: string): string {
  const parts = (name || "?").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_TONES = ["#3673fc", "#7c4fe0", "#0d9488", "#e0387d", "#c9821b", "#1e9e62", "#e5484d", "#0891b2"];
export function avatarTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** Quick follow-up presets used by the log / schedule sheets. */
export function followUpPresets(): { label: string; at: () => Date }[] {
  const at = (days: number, hour: number) => () => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  return [
    { label: "In 1 hour", at: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: "Tomorrow 10am", at: at(1, 10) },
    { label: "In 3 days", at: at(3, 10) },
    { label: "Next week", at: at(7, 10) },
  ];
}

// ---------------------------------------------------------------------------
// Phase 2
// ---------------------------------------------------------------------------
export type MailStatus = { can_send: boolean; from: string; can_read?: boolean; meta?: boolean; ai?: boolean };

export type ProposalLinkInfo = {
  id: number;
  url: string;
  views: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  accepted_at: string | null;
  accepted_name: string;
  expires_at: string | null;
};

export type CaptureSource = {
  id: number;
  name: string;
  token: string;
  endpoint: string;
  default_owner: number | null;
  default_owner_name: string;
  active: boolean;
  last_received_at: string | null;
  received_count: number;
};

export type BDReport = {
  days: number;
  summary: { new_leads: number; won: number; lost: number; win_rate: number; won_value_aed: string; avg_days_to_close: number | null };
  funnel: { key: string; label: string; count: number }[];
  sources: { source: string; label: string; leads: number; qualified: number; won: number; won_value_aed: string; conversion: number }[];
  lost_reasons: { reason: string; label: string; count: number }[];
  per_bde: { owner: number; name: string; leads: number; calls: number; whatsapp: number; emails: number; meetings: number; follow_ups_done: number; won: number; won_value_aed: string }[];
  pipeline: { open_deals: number; open_value_aed: string; stage_moves: number };
};

/** Ready-made emails. {name}, {company}, {me} and {link} are filled in. */
export const EMAIL_TEMPLATES: { id: string; label: string; subject: string; body: string; needsLink?: boolean }[] = [
  {
    id: "intro",
    label: "Introduction",
    subject: "Thanks for getting in touch, {company}",
    body: "Hi {name},\n\nThank you for your interest in Kreativefolio. I'd love to understand what you're looking for and how we can help {company}.\n\nWould you be free for a quick call this week? Let me know a time that suits you.\n\nBest regards,\n{me}\nKreativefolio",
  },
  {
    id: "followup",
    label: "Follow-up",
    subject: "Following up",
    body: "Hi {name},\n\nJust following up on our last conversation. Is there anything I can clarify or help with for {company}?\n\nBest regards,\n{me}\nKreativefolio",
  },
  {
    id: "meeting",
    label: "Meeting request",
    subject: "A short meeting this week?",
    body: "Hi {name},\n\nWould you be free for a short meeting this week to go through your requirements? Share a time that works and I'll send an invite.\n\nBest regards,\n{me}\nKreativefolio",
  },
  {
    id: "proposal",
    label: "Send proposal",
    subject: "Your proposal from Kreativefolio",
    body: "Hi {name},\n\nThank you for your time. Your proposal is ready — you can view it here:\n\n{link}\n\nIf everything looks good you can accept it right on that page, or reply with any questions and I'll walk you through it.\n\nBest regards,\n{me}\nKreativefolio",
    needsLink: true,
  },
  {
    id: "nudge",
    label: "Proposal nudge",
    subject: "Quick check-in on your proposal",
    body: "Hi {name},\n\nA quick check-in on the proposal I shared:\n\n{link}\n\nAnything I can clarify or adjust to help you decide?\n\nBest regards,\n{me}\nKreativefolio",
    needsLink: true,
  },
];

let mailStatusCache: Promise<MailStatus> | null = null;
/** One shared fetch per page load — drives whether Email opens the in-app composer. */
export function loadMailStatus(fetcher: () => Promise<MailStatus>): Promise<MailStatus> {
  if (!mailStatusCache) mailStatusCache = fetcher().catch(() => ({ can_send: false, from: "" }));
  return mailStatusCache;
}
