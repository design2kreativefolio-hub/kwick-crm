// Sidebar navigation grouping (NiceAdmin-style structure, spec §2/§4 role gating).
// Items tagged with `module` are hidden unless the user is the superadmin or
// has been granted access to that module — but the backend still enforces
// access server-side; hiding here is cosmetic only. Icons are Bootstrap Icons
// (`bi bi-*`), the same icon set the NiceAdmin reference template uses.

import { hasModuleAccess, type Module } from "@/lib/auth";

export type { Module };

export type NavItem = {
  label: string;
  // Omitted (undefined) for a parent item that only expands/collapses its
  // children and isn't itself a page.
  href?: string;
  icon: string;
  /** One short line shown under the label (parents, and pages people tend to mix up). */
  hint?: string;
  /** Older / alternative names, so search still finds a page after it is renamed. */
  aliases?: string[];
  /** Label the superadmin sees instead (same page, different audience). */
  adminLabel?: string;
  /** Hidden for a BDE whose Dashboard already is this page. */
  hideWithSalesDashboard?: boolean;
  module?: Module;
  /** Only the superadmin sees this item (e.g. Roles). */
  superadminOnly?: boolean;
  children?: NavItem[];
};

export type NavGroup = { heading: string; items: NavItem[] };

// Every item has its own icon, Title Case labels, and plain wording. EDITH and Support are not
// listed here: EDITH lives in the top bar, Support in the profile menu.
export const NAV: NavGroup[] = [
  {
    heading: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "bi-grid-1x2-fill", hint: "Your day at a glance" }],
  },
  {
    heading: "Work",
    items: [
      {
        label: "Projects",
        icon: "bi-folder-fill",
        hint: "Mini-projects and client calendars",
        children: [
          { label: "Mini-Projects", href: "/projects", icon: "bi-kanban-fill" },
          { label: "Artwork Generator", href: "/projects/artwork", icon: "bi-palette-fill" },
          {
            label: "Client Calendars",
            href: "/projects/clients",
            icon: "bi-calendar-range-fill",
            aliases: ["clients", "content calendar"],
          },
        ],
      },
      { label: "Tasks", href: "/tasks", icon: "bi-check-square-fill", hint: "Work assigned to you" },
      { label: "To-Do", href: "/todo", icon: "bi-list-check", hint: "Your own checklist" },
      { label: "Calendar", href: "/calendar", icon: "bi-calendar3", hint: "Deadlines and meetings" },
    ],
  },
  {
    heading: "Sales & Growth",
    items: [
      {
        label: "Sales",
        icon: "bi-briefcase-fill",
        hint: "Clients, proposals and invoices",
        children: [
          {
            label: "Client Accounts",
            href: "/sales/clients",
            icon: "bi-person-vcard-fill",
            module: "sales_clients",
            aliases: ["clients"],
          },
          { label: "Proposals", href: "/sales/proposals", icon: "bi-file-earmark-text-fill", module: "sales_proposals" },
          { label: "Invoices", href: "/sales/invoices", icon: "bi-receipt", module: "sales_invoices" },
        ],
      },
      {
        label: "Business Development",
        icon: "bi-bullseye",
        hint: "Find and win new clients",
        children: [
          {
            label: "My Day",
            adminLabel: "Overview",
            href: "/bd",
            icon: "bi-sun-fill",
            module: "bd",
            hideWithSalesDashboard: true,
            aliases: ["my day", "overview"],
          },
          { label: "Leads", href: "/bd/leads", icon: "bi-person-plus-fill", module: "bd" },
          { label: "Pipeline", href: "/bd/pipeline", icon: "bi-funnel-fill", module: "bd" },
          {
            label: "BD Reports",
            href: "/bd/reports",
            icon: "bi-bar-chart-line-fill",
            superadminOnly: true,
            aliases: ["pipeline reports"],
          },
          {
            label: "Website Lead Forms",
            href: "/bd/settings",
            icon: "bi-input-cursor-text",
            superadminOnly: true,
            aliases: ["lead capture"],
          },
        ],
      },
      { label: "Renewals", href: "/renewals", icon: "bi-arrow-repeat", module: "renewals", hint: "Domains, hosting and visas" },
    ],
  },
  {
    heading: "Team",
    items: [
      {
        label: "HR",
        icon: "bi-people-fill",
        hint: "Staff, documents and access",
        children: [
          { label: "Documents", href: "/hr/documents", icon: "bi-folder2-open", module: "hr_documents" },
          { label: "Staff", href: "/hr/staff", icon: "bi-person-badge-fill", module: "hr_staff", aliases: ["staffs"] },
          { label: "Roles", href: "/hr/roles", icon: "bi-shield-lock-fill", superadminOnly: true },
        ],
      },
      { label: "Passwords", href: "/passwords", icon: "bi-key-fill", module: "passwords", hint: "Shared logins vault" },
    ],
  },
  {
    heading: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: "bi-graph-up-arrow", module: "reports" }],
  },
  {
    heading: "Communication",
    items: [
      { label: "Chat", href: "/chat", icon: "bi-chat-dots-fill" },
      { label: "Reminders", href: "/reminders", icon: "bi-alarm-fill", hint: "Alerts and notifications" },
    ],
  },
  {
    heading: "Account",
    items: [{ label: "Profile", href: "/profile", icon: "bi-person-circle" }],
  },
];

export type NavOptions = {
  /** The person's Dashboard is the My Day screen (a BDE the admin switched to the Sales dashboard). */
  salesDashboard?: boolean;
};

function visibleItem(
  item: NavItem,
  role: "superadmin" | "employee",
  moduleAccess: Module[],
  opts: NavOptions = {}
): NavItem | null {
  if (item.superadminOnly && role !== "superadmin") return null;
  if (item.hideWithSalesDashboard && opts.salesDashboard) return null;
  if (item.adminLabel && role === "superadmin") item = { ...item, label: item.adminLabel };
  if (item.module && role !== "superadmin" && !hasModuleAccess(moduleAccess, item.module)) return null;
  if (!item.children) return item;
  const children = item.children
    .map((c) => visibleItem(c, role, moduleAccess, opts))
    .filter((c): c is NavItem => c !== null);
  return children.length > 0 ? { ...item, children } : null;
}

export function visibleNav(role: "superadmin" | "employee", moduleAccess: Module[] = [], opts: NavOptions = {}): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .map((i) => visibleItem(i, role, moduleAccess, opts))
      .filter((i): i is NavItem => i !== null),
  })).filter((group) => group.items.length > 0);
}
