// Sidebar navigation grouping (NiceAdmin-style structure, spec §2/§4 role gating).
// `managerOnly` items are hidden for employees — but the backend still enforces
// access server-side; hiding here is cosmetic only. Icons are Bootstrap Icons
// (`bi bi-*`), the same icon set the NiceAdmin reference template uses.

export type NavItem = {
  label: string;
  // Omitted (undefined) for a parent item that only expands/collapses its
  // children and isn't itself a page.
  href?: string;
  icon: string;
  managerOnly?: boolean;
  children?: NavItem[];
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
      {
        label: "Projects",
        icon: "bi-folder-fill",
        children: [
          { label: "Projects", href: "/projects", icon: "bi-kanban-fill" },
          { label: "Artwork Generator", href: "/projects/artwork", icon: "bi-palette-fill" },
          { label: "Clients", href: "/projects/clients", icon: "bi-person-lines-fill" },
        ],
      },
      { label: "Tasks", href: "/tasks", icon: "bi-check-square-fill" },
      { label: "To-Do", href: "/todo", icon: "bi-ui-checks-grid" },
      { label: "Kanban", href: "/kanban", icon: "bi-kanban-fill" },
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
      { label: "Chat", href: "/chat", icon: "bi-chat-dots-fill" },
      { label: "Reminders", href: "/reminders", icon: "bi-bell-fill" },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Profile", href: "/profile", icon: "bi-person-circle" }],
  },
];

function visibleItem(item: NavItem, role: "manager" | "employee"): NavItem | null {
  if (item.managerOnly && role !== "manager") return null;
  if (!item.children) return item;
  const children = item.children
    .map((c) => visibleItem(c, role))
    .filter((c): c is NavItem => c !== null);
  return children.length > 0 ? { ...item, children } : null;
}

export function visibleNav(role: "manager" | "employee"): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .map((i) => visibleItem(i, role))
      .filter((i): i is NavItem => i !== null),
  })).filter((group) => group.items.length > 0);
}
