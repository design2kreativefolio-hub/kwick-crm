/**
 * Shared status → badge class mapping so Projects, Tasks, To-Do, and Content
 * Calendar all use the same color language.
 *
 *   Assigned / Planned / To do  → blue (info)
 *   In progress / Started       → purple
 *   Waiting for approval / QC   → amber (warning)
 *   Completed / Done            → green (success)
 *   Approved / Published        → teal
 */

export const STATUS_BADGE: Record<string, string> = {
  // Tasks + content calendar + kanban
  assigned: "badge-info",
  todo: "badge-info",
  planned: "badge-info",
  in_progress: "badge-purple",
  doing: "badge-purple",
  completed: "badge-success",
  done: "badge-success",
  qc_completed: "badge-warning",
  approved: "badge-teal",
  published: "badge-teal",
  // Projects
  started: "badge-purple",
  waiting_approval: "badge-warning",
  pending: "badge-warning",
};

/** Hex accents for calendar chips (same palette as badges). */
export const STATUS_COLOR: Record<string, string> = {
  assigned: "#3673FC",
  todo: "#3673FC",
  planned: "#3673FC",
  in_progress: "#7C4FE0",
  doing: "#7C4FE0",
  started: "#7C4FE0",
  waiting_approval: "#C9821B",
  pending: "#C9821B",
  qc_completed: "#C9821B",
  completed: "#1E9E62",
  done: "#1E9E62",
  approved: "#0D9488",
  published: "#0D9488",
};

export const TASK_STATUS_OPTIONS = [
  { value: "assigned", label: "Assigned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "qc_completed", label: "QC Completed" },
  { value: "approved", label: "Approved / Published" },
] as const;

/** Mini-projects use the same workflow as tasks. */
export const PROJECT_STATUS_OPTIONS = TASK_STATUS_OPTIONS;

export const TASK_STATUS_LABEL: Record<string, string> = {
  assigned: "Assigned",
  todo: "Assigned",
  planned: "Assigned",
  in_progress: "In Progress",
  started: "In Progress",
  completed: "Completed",
  done: "Completed",
  qc_completed: "QC Completed",
  waiting_approval: "QC Completed",
  approved: "Approved / Published",
  published: "Approved / Published",
};

export const PROJECT_STATUS_LABEL = TASK_STATUS_LABEL;

export type TaskStatus = (typeof TASK_STATUS_OPTIONS)[number]["value"];
export type ProjectStatus = TaskStatus;

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE[status] ?? "badge-muted";
}

/** Final shipped state — hide due date / strike title. */
export function isTaskApproved(status: string | null | undefined): boolean {
  return status === "approved" || status === "published";
}

/** Completed through approval — not overdue / not "ongoing". */
export function isProjectTerminal(status: string | null | undefined): boolean {
  return (
    status === "completed" ||
    status === "qc_completed" ||
    status === "approved" ||
    status === "published"
  );
}
