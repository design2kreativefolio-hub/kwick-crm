// Sidebar navigation grouping (NiceAdmin-style structure, spec §2/§4 role gating).
// `managerOnly` items are hidden for employees — but the backend still enforces
// access server-side; hiding here is cosmetic only. Icons are Bootstrap Icons
// (`bi bi-*`), the same icon set the NiceAdmin reference template uses.

export type NavItem = {
  label: string;
  href: string;
  icon: string;
  managerOnly?: boolean;
};

export type NavGroup = { heading: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "bi-grid-1x2-fill" }],
  },
  {
    heading: "Work",
    items: [
      { label: "Projects", href: "/projects", icon: "bi-folder-fill" },
      { label: "Tasks", href: "/tasks", icon: "bi-check-square-fill" },
      { label: "To-Do", href: "/todo", icon: "bi-ui-checks-grid" },
      { label: "Kanban", href: "/kanban", icon: "bi-kanban-fill", managerOnly: true },
      { label: "Calendar", href: "/calendar", icon: "bi-calendar3-fill" },
    ],
  },
  {
    heading: "Business",
    items: [
      { label: "Sales", href: "/sales", icon: "bi-briefcase-fill", managerOnly: true },
      { label: "HR", href: "/hr", icon: "bi-people-fill", managerOnly: true },
      { label: "Renewals", href: "/renewals", icon: "bi-calendar-check-fill", managerOnly: true },
      { label: "Reports", href: "/reports", icon: "bi-bar-chart-line-fill", managerOnly: true },
    ],
  },
  {
    heading: "Communication",
    items: [
      { label: "Messages", href: "/messages", icon: "bi-chat-dots-fill" },
      { label: "Reminders", href: "/reminders", icon: "bi-bell-fill" },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Profile", href: "/profile", icon: "bi-person-circle" }],
  },
];

export function visibleNav(role: "manager" | "employee"): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !i.managerOnly || role === "manager"),
  })).filter((group) => group.items.length > 0);
}
