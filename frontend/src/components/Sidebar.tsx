"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/liveUpdates";
import { NavItem, visibleNav } from "@/lib/nav";

export function Sidebar({
  role,
  collapsed,
  mobileOpen = false,
  onNavigate,
}: {
  role: "superadmin" | "employee";
  collapsed: boolean;
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const groups = visibleNav(role, user?.module_access ?? []);
  const { notifUnread, chatUnread } = useLiveUpdates();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const badgeCounts: Record<string, number> = { "/reminders": notifUnread, "/chat": chatUnread };

  // Auto-expand (never auto-collapse) whichever parent contains the current
  // page, so landing directly on e.g. /projects/clients still shows it open.
  useEffect(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (!item.children) continue;
        const childActive = item.children.some(
          (c) => c.href && (pathname === c.href || pathname.startsWith(c.href + "/"))
        );
        if (childActive) setExpanded((prev) => new Set(prev).add(item.label));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (href?: string) => !!href && (pathname === href || pathname.startsWith(href + "/"));

  // Sibling-aware version for leaves inside a group: a prefix match (e.g.
  // /projects matching /projects/artwork) shouldn't win when the pathname
  // matches a MORE specific sibling route more exactly — otherwise "Projects"
  // and "Artwork Generator" both light up at once.
  const isActiveAmongSiblings = (href: string | undefined, siblingHrefs: string[]) => {
    if (!href || !isActive(href)) return false;
    if (pathname === href) return true;
    return !siblingHrefs.some((h) => h !== href && isActive(h) && h.length > href.length);
  };

  const renderLeaf = (item: NavItem, siblingHrefs: string[] = []) => {
    const active = isActiveAmongSiblings(item.href, siblingHrefs);
    const count = badgeCounts[item.href ?? ""] ?? 0;
    const showUnreadBadge = count > 0;
    return (
      <Link
        key={item.href}
        href={item.href ?? "#"}
        className="sidebar-link"
        style={navLink(active, collapsed)}
        title={collapsed ? item.label : undefined}
        onClick={onNavigate}
      >
        <span style={{ position: "relative" }}>
          <span style={iconChip(active)}>
            <i className={`bi ${item.icon}`} style={{ fontSize: 14.5 }} />
          </span>
          {showUnreadBadge && <span style={navBadge}>{count > 9 ? "9+" : count}</span>}
        </span>
        {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
        {!collapsed && showUnreadBadge && <span className="badge badge-danger">{count}</span>}
        {!collapsed && !showUnreadBadge && active && <span style={statusDot} />}
      </Link>
    );
  };

  const renderParent = (item: NavItem) => {
    const children = item.children ?? [];
    const anyChildActive = children.some((c) => isActive(c.href));
    const isOpen = expanded.has(item.label);
    return (
      <div key={item.label}>
        <button
          type="button"
          className="sidebar-link"
          style={{ ...navLink(anyChildActive, collapsed), width: "100%", border: "none", background: anyChildActive ? "rgba(255,255,255,0.12)" : "transparent" }}
          title={collapsed ? item.label : undefined}
          onClick={() => {
            if (collapsed) {
              // No room to show children in icon-rail mode — jump to the
              // first child instead of toggling an invisible accordion.
              const first = children[0];
              if (first?.href) window.location.assign(first.href);
              return;
            }
            setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has(item.label)) next.delete(item.label);
              else next.add(item.label);
              return next;
            });
          }}
        >
          <span style={iconChip(anyChildActive)}>
            <i className={`bi ${item.icon}`} style={{ fontSize: 14.5 }} />
          </span>
          {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{item.label}</span>}
          {!collapsed && (
            <i
              className="bi bi-chevron-down"
              style={{ fontSize: 10, transition: "transform 0.15s ease", transform: isOpen ? "rotate(180deg)" : "none" }}
            />
          )}
        </button>
        {!collapsed && isOpen && (
          <div style={{ marginLeft: 14, paddingLeft: 12, borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
            {children.map((c) => renderLeaf(c, children.map((sib) => sib.href).filter((h): h is string => !!h)))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {mobileOpen && (
        <div className="sidebar-mobile-backdrop sidebar-mobile-backdrop" onClick={onNavigate} />
      )}
      <aside
        className={`app-sidebar app-sidebar${mobileOpen ? " sidebar-mobile-open sidebar-mobile-open" : ""}`}
        style={aside(collapsed)}
      >
      <div style={brand(collapsed)}>{collapsed ? <Logo icon height={26} /> : <Logo height={26} light />}</div>
      <nav className="sidebar-nav-scroll" style={{ padding: "14px 12px", overflowY: "auto", flex: 1 }}>
        {groups.map((group) => (
          <div key={group.heading} style={{ marginBottom: 20 }}>
            {!collapsed && <div style={heading}>{group.heading}</div>}
            {group.items.map((item) => (item.children ? renderParent(item) : renderLeaf(item)))}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div style={profileCard}>
          <UserAvatar user={user} size={36} style={{ color: "#fff" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.full_name || "User"}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.email}
            </div>
          </div>
        </div>
      )}
      </aside>
    </>
  );
}

const aside = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? 84 : "var(--sidebar-width)",
  minWidth: collapsed ? 84 : "var(--sidebar-width)",
  background: "var(--sidebar-bg)",
  borderRadius: "var(--radius)",
  margin: "16px 0 16px 16px",
  height: "calc(100vh - 32px)",
  position: "sticky",
  top: 16,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 8px 24px rgba(16, 19, 63, 0.28)",
  transition: "width 0.18s ease, min-width 0.18s ease",
  overflow: "hidden",
});
const brand = (collapsed: boolean): React.CSSProperties => ({
  height: "var(--topbar-height)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: collapsed ? 0 : "0 20px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
});
const heading: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  color: "rgba(255,255,255,0.4)",
  padding: "0 10px",
  marginBottom: 8,
};
function navLink(active: boolean, collapsed: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: 12,
    padding: collapsed ? "8px" : "9px 10px",
    borderRadius: 12,
    marginBottom: 3,
    color: active ? "#fff" : "rgba(255,255,255,0.65)",
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    fontWeight: active ? 600 : 500,
    fontSize: 13.5,
  };
}
function iconChip(active: boolean): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    minWidth: 28,
    borderRadius: 8,
    display: "grid",
    placeItems: "center",
    background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)",
    color: active ? "#fff" : "rgba(255,255,255,0.8)",
  };
}
const statusDot: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--success)",
};
const navBadge: React.CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  minWidth: 15,
  height: 15,
  borderRadius: 999,
  background: "var(--danger)",
  color: "#fff",
  fontSize: 9,
  fontWeight: 700,
  display: "grid",
  placeItems: "center",
  padding: "0 3px",
  border: "1.5px solid var(--navy-soft)",
};
const profileCard: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 14px",
  margin: "0 12px 14px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.06)",
};
