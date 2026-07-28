"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";
import { visibleNav } from "@/lib/nav";

export function Sidebar({
  role,
  collapsed,
}: {
  role: "manager" | "employee";
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const groups = visibleNav(role);

  return (
    <aside style={aside(collapsed)}>
      <div style={brand}>{collapsed ? <Logo icon height={26} /> : <Logo height={28} />}</div>
      <nav style={{ padding: "16px 14px", overflowY: "auto", flex: 1 }}>
        {groups.map((group) => (
          <div key={group.heading} style={{ marginBottom: 22 }}>
            {!collapsed && <div style={heading}>{group.heading}</div>}
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={navLink(active, collapsed)}
                  title={collapsed ? item.label : undefined}
                >
                  <span style={iconChip(active)}>
                    <i className={`bi ${item.icon}`} style={{ fontSize: 15 }} />
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

const aside = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? 84 : "var(--sidebar-width)",
  minWidth: collapsed ? 84 : "var(--sidebar-width)",
  background: "var(--sidebar-bg)",
  borderRight: "1px solid var(--border)",
  height: "100vh",
  position: "sticky",
  top: 0,
  display: "flex",
  flexDirection: "column",
  transition: "width 0.18s ease, min-width 0.18s ease",
});
const brand: React.CSSProperties = {
  height: "var(--topbar-height)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 22px",
  borderBottom: "1px solid var(--border)",
};
const heading: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  color: "var(--text-muted)",
  opacity: 0.8,
  padding: "0 10px",
  marginBottom: 10,
};
function navLink(active: boolean, collapsed: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: collapsed ? "center" : "flex-start",
    gap: 12,
    padding: collapsed ? "8px" : "8px 10px",
    borderRadius: 12,
    marginBottom: 4,
    color: active ? "var(--sidebar-active-text)" : "var(--sidebar-text)",
    background: active ? "var(--sidebar-active-bg)" : "transparent",
    fontWeight: active ? 600 : 500,
    fontSize: 13.5,
  };
}
function iconChip(active: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    minWidth: 30,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: active ? "rgba(255,255,255,0.16)" : "var(--sidebar-chip-bg)",
    color: active ? "#fff" : "var(--navy)",
  };
}
