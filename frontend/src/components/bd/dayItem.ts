import type { BDCard, BDLead, DayFollowUp, LastTouch } from "@/lib/bd";

/** One thing on My Day — a follow-up, a new lead or a quiet deal — in a single shape the
 *  list rows, the "do this first" card and Focus mode all share. */
export type DayItem = {
  key: string;
  leadId: number;
  followId?: number;
  type: "follow_up" | "new_lead" | "quiet_deal";
  title: string;
  contact: string;
  company: string;
  phone: string;
  whatsapp: string;
  email: string;
  kind: string; // follow-up kind (call, meeting...) or "lead"
  dueAt?: string;
  note?: string;
  meetingUrl?: string;
  score?: number;
  scoreLabel?: BDLead["score_label"];
  scoreReasons?: string[];
  value: string;
  currency: string;
  source: string;
  stage: string;
  lastTouch?: LastTouch;
  quietDays?: number;
  createdAt?: string;
  services?: string[];
  ownerName: string;
};

export function fromFollowUp(f: DayFollowUp): DayItem {
  return {
    key: `f${f.id}`,
    leadId: f.lead,
    followId: f.id,
    type: "follow_up",
    title: f.lead_name,
    contact: f.contact_name,
    company: f.lead_name,
    phone: f.phone,
    whatsapp: f.whatsapp,
    email: f.email,
    kind: f.kind,
    dueAt: f.due_at,
    note: f.note,
    meetingUrl: f.meeting_url,
    score: f.score,
    scoreLabel: f.score_label,
    scoreReasons: f.score_reasons,
    value: f.value,
    currency: f.currency,
    source: f.source,
    stage: f.stage,
    lastTouch: f.last_touch,
    ownerName: f.owner_name,
  };
}

export function fromCard(c: BDCard, type: "new_lead" | "quiet_deal"): DayItem {
  return {
    key: `${type === "new_lead" ? "n" : "q"}${c.id}`,
    leadId: c.id,
    type,
    title: c.title,
    contact: c.contact_name,
    company: c.company,
    phone: c.phone,
    whatsapp: c.whatsapp,
    email: c.email,
    kind: "lead",
    score: c.score,
    scoreLabel: c.score_label,
    value: c.value,
    currency: c.currency,
    source: c.source,
    stage: c.stage,
    quietDays: c.quiet_days,
    createdAt: c.created_at,
    services: c.services,
    ownerName: c.owner_name,
    lastTouch: null,
  };
}

/** Short "why this needs you" line. */
export function reasonLine(it: DayItem, lateLabel: string): string {
  if (it.type === "new_lead") return "New lead - nobody has contacted them yet";
  if (it.type === "quiet_deal") return `Gone quiet for ${it.quietDays ?? "?"} days`;
  if (lateLabel) return `${lateLabel}${it.note ? ` - ${it.note}` : ""}`;
  return it.note || "Due today";
}
