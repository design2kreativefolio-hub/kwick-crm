"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function Topbar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ read_at: string | null }[]>("/api/notifications")
      .then((items) => setUnread(items.filter((n) => !n.read_at).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    // Sticky wrapper spans the FULL strip (including what used to be a bare
    // margin gap above the bar) so nothing can scroll through uncovered —
    // that gap was letting scrolled content bleed above the floating bar.
    // The wrapper itself carries the glass blur, so content sliding underneath
    // reads as frosted rather than a hard cut or a visible seam.
    <div style={stickyWrap}>
      <header style={bar}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onToggleCollapsed} className="icon-btn-anim" style={circleBtn} aria-label="Toggle sidebar">
            <i className={`bi ${collapsed ? "bi-layout-sidebar" : "bi-layout-sidebar-inset"}`} />
          </button>
          <div style={searchWrap}>
            <i className="bi bi-search" style={{ color: "var(--text-muted)" }} />
            <input placeholder="Search anything…" style={searchInput} />
            <span style={kbdHint}>⌘K</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/reminders" className="icon-btn-anim" style={circleBtn} aria-label="Reminders">
            <i className="bi bi-bell-fill" style={{ fontSize: 17 }} />
            {unread > 0 && <span style={dot}>{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/messages" className="icon-btn-anim" style={circleBtn} aria-label="Messages">
            <i className="bi bi-chat-dots-fill" style={{ fontSize: 17 }} />
          </Link>

          <div ref={menuRef} style={{ position: "relative", marginLeft: 6 }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="icon-btn-anim"
              style={profileBtn}
              aria-label="Account menu"
            >
              <span style={avatar}>{(user?.full_name || user?.email || "?")[0].toUpperCase()}</span>
              <span style={{ textAlign: "left", lineHeight: 1.2 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>
                  {user?.full_name || user?.email}
                </span>
                <span className="muted" style={{ fontSize: 11.5, textTransform: "capitalize" }}>
                  {user?.role}
                </span>
              </span>
              <i className="bi bi-chevron-down" style={{ fontSize: 11, color: "var(--text-muted)" }} />
            </button>
            {menuOpen && (
              <div style={dropdown}>
                <Link href="/profile" style={dropdownItem} onClick={() => setMenuOpen(false)}>
                  <i className="bi bi-person-fill" /> Profile
                </Link>
                <button
                  style={{ ...dropdownItem, width: "100%", border: "none", background: "none" }}
                  onClick={logout}
                >
                  <i className="bi bi-door-open-fill" /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}

const stickyWrap: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  padding: "16px 16px 0 16px",
  background: "rgba(244, 245, 251, 0.55)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
};
const bar: React.CSSProperties = {
  height: "var(--topbar-height)",
  background: "rgba(255, 255, 255, 0.78)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: "var(--radius)",
  boxShadow: "var(--shadow)",
  border: "1px solid rgba(255, 255, 255, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 22px",
};
const searchWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  background: "var(--bg)",
  borderRadius: 999,
  padding: "9px 16px",
  width: 300,
  maxWidth: "36vw",
};
const searchInput: React.CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  flex: 1,
  fontSize: 13.5,
  color: "var(--text)",
};
const kbdHint: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  color: "var(--text-muted)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 5,
  padding: "2px 6px",
};
const circleBtn: React.CSSProperties = {
  position: "relative",
  width: 40,
  height: 40,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  color: "var(--navy)",
  background: "var(--bg)",
  border: "none",
};
const dot: React.CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  background: "var(--danger)",
  color: "#fff",
  fontSize: 9.5,
  fontWeight: 700,
  borderRadius: 999,
  minWidth: 16,
  height: 16,
  display: "grid",
  placeItems: "center",
  padding: "0 3px",
};
const profileBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "none",
  border: "none",
  padding: "6px 8px",
  borderRadius: 8,
};
const avatar: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "var(--navy)",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 700,
  fontSize: 14,
};
const dropdown: React.CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 8px)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  minWidth: 170,
  padding: 6,
  zIndex: 20,
};
const dropdownItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  borderRadius: 8,
  fontSize: 13.5,
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "left",
};
