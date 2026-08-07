// Sidebar navigation grouping (NiceAdmin-style structure, spec §2/§4 role gating).
// Items tagged with `module` are hidden unless the user is the superadmin or
// has been granted access to that module — but the backend still enforces
// access server-side; hiding here is cosmetic only. Icons are Bootstrap Icons
// (`bi bi-*`), the same icon set the NiceAdmin reference template uses.

export type Module = "hr" | "sales" | "renewals" | "reports";

export type NavItem = {
  label: string;
  // Omitted (undefined) for a parent item that only expands/collapses its
  // children and isn't itself a page.
  href?: string;
  icon: string;
  module?: Module;
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
      // Hidden for now — re-enable when ready:
      // { label: "Kanban", href: "/kanban", icon: "bi-kanban-fill" },
      { label: "Calendar", href: "/calendar", icon: "bi-calendar3-fill" },
    ],
  },
  {
    heading: "Business",
    items: [
      {
        label: "Sales",
        icon: "bi-briefcase-fill",
        module: "sales",
        children: [
          { label: "Clients", href: "/sales/clients", icon: "bi-person-lines-fill" },
          { label: "Proposals", href: "/sales/proposals", icon: "bi-file-earmark-text-fill" },
          { label: "Invoices", href: "/sales/invoices", icon: "bi-receipt" },
        ],
      },
      {
        label: "HR",
        icon: "bi-people-fill",
        module: "hr",
        children: [
          { label: "Documents", href: "/hr/documents", icon: "bi-folder2-open" },
          { label: "Staffs", href: "/hr/staff", icon: "bi-people-fill" },
        ],
      },
      { label: "Renewals", href: "/renewals", icon: "bi-calendar-check-fill", module: "renewals" },
      { label: "Reports", href: "/reports", icon: "bi-bar-chart-line-fill", module: "reports" },
    ],
  },
  {
    heading: "Communication",
    items: [
      { label: "Chat", href: "/chat", icon: "bi-chat-dots-fill" },
      { label: "Reminders", href: "/reminders", icon: "bi-bell-fill" },
      { label: "Support", href: "/support", icon: "bi-headset" },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Profile", href: "/profile", icon: "bi-person-circle" }],
  },
];

function visibleItem(
  item: NavItem,
  role: "superadmin" | "employee",
  moduleAccess: Module[]
): NavItem | null {
  if (item.module && role !== "superadmin" && !moduleAccess.includes(item.module)) return null;
  if (!item.children) return item;
  const children = item.children
    .map((c) => visibleItem(c, role, moduleAccess))
    .filter((c): c is NavItem => c !== null);
  return children.length > 0 ? { ...item, children } : null;
}

export function visibleNav(role: "superadmin" | "employee", moduleAccess: Module[] = []): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .map((i) => visibleItem(i, role, moduleAccess))
      .filter((i): i is NavItem => i !== null),
  })).filter((group) => group.items.length > 0);
}
