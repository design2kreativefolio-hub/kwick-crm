"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { visibleNav } from "@/lib/nav";
import { NotificationEvent } from "@/lib/notifications";

export function Sidebar({
  role,
  collapsed,
}: {
  role: "manager" | "employee";
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const groups = visibleNav(role);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api<NotificationEvent[]>("/api/notifications")
      .then((items) => setUnread(items.filter((n) => !n.read_at).length))
      .catch(() => {});
  }, [pathname]);

  return (
    <aside style={aside(collapsed)}>
      <div style={brand(collapsed)}>{collapsed ? <Logo icon height={26} /> : <Logo height={26} light />}</div>
      <nav className="sidebar-nav-scroll" style={{ padding: "14px 12px", overflowY: "auto", flex: 1 }}>
        {groups.map((group) => (
          <div key={group.heading} style={{ marginBottom: 20 }}>
            {!collapsed && <div style={heading}>{group.heading}</div>}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const showUnreadBadge = item.href === "/reminders" && unread > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="sidebar-link"
                  style={navLink(active, collapsed)}
                  title={collapsed ? item.label : undefined}
                >
                  <span style={{ position: "relative" }}>
                    <span style={iconChip(active)}>
                      <i className={`bi ${item.icon}`} style={{ fontSize: 14.5 }} />
                    </span>
                    {showUnreadBadge && <span style={navBadge}>{unread > 9 ? "9+" : unread}</span>}
                  </span>
                  {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                  {!collapsed && showUnreadBadge && <span className="badge badge-danger">{unread}</span>}
                  {!collapsed && !showUnreadBadge && active && <span style={statusDot} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div style={profileCard}>
          <span style={avatar}>{(user?.full_name || user?.email || "?")[0].toUpperCase()}</span>
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
const avatar: React.CSSProperties = {
  width: 34,
  height: 34,
  minWidth: 34,
  borderRadius: "50%",
  background: "var(--gold)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 14,
};
