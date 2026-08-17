/**
 * Shared status → badge class mapping so Projects, Tasks, To-Do, and Content
 * Calendar all use the same color language.
 *
 *   To do / Assigned / Planned  → blue (info)
 *   In progress / Started       → purple
 *   Waiting for approval        → amber (warning)
 *   Completed / Done            → green (success)
 *   Published                   → teal
 */

export const STATUS_BADGE: Record<string, string> = {
  // Tasks + content calendar + kanban
  todo: "badge-info",
  planned: "badge-info",
  in_progress: "badge-purple",
  doing: "badge-purple",
  completed: "badge-success",
  done: "badge-success",
  published: "badge-teal",
  // Projects
  assigned: "badge-info",
  started: "badge-purple",
  waiting_approval: "badge-warning",
  pending: "badge-warning",
};

/** Hex accents for calendar chips (same palette as badges). */
export const STATUS_COLOR: Record<string, string> = {
  todo: "#3673FC",
  planned: "#3673FC",
  assigned: "#3673FC",
  in_progress: "#7C4FE0",
  doing: "#7C4FE0",
  started: "#7C4FE0",
  waiting_approval: "#C9821B",
  pending: "#C9821B",
  completed: "#1E9E62",
  done: "#1E9E62",
  published: "#0D9488",
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "badge-muted";
}
