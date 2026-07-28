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
    <header style={bar}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button onClick={onToggleCollapsed} style={circleBtn} aria-label="Toggle sidebar">
          <i className={`bi ${collapsed ? "bi-layout-sidebar" : "bi-layout-sidebar-inset"}`} />
        </button>
        <div style={searchWrap}>
          <input placeholder="Search…" style={searchInput} />
          <i className="bi bi-search" style={{ color: "var(--text-muted)" }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/notifications" style={circleBtn} aria-label="Notifications">
          <i className="bi bi-bell-fill" style={{ fontSize: 17 }} />
          {unread > 0 && <span style={dot}>{unread > 9 ? "9+" : unread}</span>}
        </Link>
        <Link href="/messages" style={circleBtn} aria-label="Messages">
          <i className="bi bi-chat-dots-fill" style={{ fontSize: 17 }} />
        </Link>

        <div ref={menuRef} style={{ position: "relative", marginLeft: 6 }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
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
                <i className="bi bi-person" /> Profile
              </Link>
              <button
                style={{ ...dropdownItem, width: "100%", border: "none", background: "none" }}
                onClick={logout}
              >
                <i className="bi bi-box-arrow-right" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

const bar: React.CSSProperties = {
  height: "var(--topbar-height)",
  background: "var(--surface)",
  borderBottom: "1px solid var(--border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 24px",
  position: "sticky",
  top: 0,
  zIndex: 10,
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
