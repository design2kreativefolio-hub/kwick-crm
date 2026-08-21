export type NotificationEvent = {
  id: number;
  source: string;
  title: string;
  body: string;
  object_ref?: string;
  sent_at: string | null;
  read_at: string | null;
  recurring: boolean;
  active: boolean;
  created_at: string;
};

export const SOURCE_META: Record<
  string,
  { icon: string; color: string; bg: string; label: string; href: string }
> = {
  renewal: { icon: "bi-calendar-check-fill", color: "var(--gold)", bg: "var(--gold-soft)", label: "Renewal", href: "/renewals" },
  calendar: { icon: "bi-calendar3-fill", color: "var(--gold)", bg: "var(--gold-soft)", label: "Calendar", href: "/calendar" },
  task: { icon: "bi-check-square-fill", color: "#219150", bg: "var(--success-soft)", label: "Task", href: "/tasks" },
  leave_request: { icon: "bi-airplane-fill", color: "var(--warning)", bg: "var(--warning-soft)", label: "Leave request", href: "/hr/staff" },
  ticket: { icon: "bi-ticket-perforated-fill", color: "var(--danger)", bg: "var(--danger-soft)", label: "Ticket", href: "/hr/staff" },
  document: { icon: "bi-file-earmark-text-fill", color: "#7C4FE0", bg: "#F0EBFB", label: "Document", href: "/hr/documents" },
  staff_renewal: { icon: "bi-exclamation-triangle-fill", color: "var(--danger)", bg: "var(--danger-soft)", label: "Renewal due", href: "/hr/staff" },
  registration: { icon: "bi-person-plus-fill", color: "var(--gold)", bg: "var(--gold-soft)", label: "Signup", href: "/hr/staff" },
  project: { icon: "bi-kanban-fill", color: "#7C4FE0", bg: "#F0EBFB", label: "Project", href: "/projects" },
  content_calendar: { icon: "bi-check-square-fill", color: "#219150", bg: "var(--success-soft)", label: "Task", href: "/tasks" },
  todo: { icon: "bi-check2-square", color: "#219150", bg: "var(--success-soft)", label: "To-do", href: "/todo" },
};
export const DEFAULT_SOURCE_META = { icon: "bi-bell-fill", color: "var(--gold)", bg: "var(--gold-soft)", label: "Update", href: "" };

/** Deep-link from object_ref (e.g. task:42) or fall back to source module. */
export function notificationHref(source: string, objectRef?: string | null): string {
  const ref = (objectRef || "").trim();
  if (ref.startsWith("task:")) {
    const id = ref.split(":")[1];
    if (id && /^\d+$/.test(id)) return `/tasks/${id}`;
  }
  if (ref.startsWith("project:")) {
    const id = ref.split(":")[1];
    if (id && /^\d+$/.test(id)) return `/projects/${id}`;
  }
  return (SOURCE_META[source] ?? DEFAULT_SOURCE_META).href || "/reminders";
}

export function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
