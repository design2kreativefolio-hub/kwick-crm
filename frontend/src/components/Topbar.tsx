"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EdithOrb } from "@/components/EdithOrb";
import { ThemeToggle } from "@/components/ThemeToggle";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/liveUpdates";
import { NavItem, visibleNav } from "@/lib/nav";
import { useNotificationPermissionState } from "@/lib/pwa";
import { useToast } from "@/lib/toast";

type SearchResult = {
  type: string;
  id: number | string;
  label: string;
  sublabel: string;
  href: string;
  icon: string;
};

// "to do" should match the "To-Do" nav item, "kanban" should match "Kanban" —
// strip anything that isn't a letter/digit before comparing so spacing and
// punctuation differences don't matter.
function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function Topbar({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { notifUnread: unread } = useLiveUpdates();
  const { perm, enable, needsPrompt } = useNotificationPermissionState();
  const { showToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ results: SearchResult[] }>(`/api/dashboard/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.results))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Jump straight to a whole module/page — e.g. typing "visa" is a data
  // search (handled server-side, matches Renewals), but typing "to do" or
  // "kanban" should surface the page itself even with zero matching records.
  const pageMatches = useMemo<SearchResult[]>(() => {
    const q = normalize(query.trim());
    if (q.length < 2 || !user) return [];
    // Flatten recursively — parent items (e.g. "Projects") have no href of
    // their own and aren't navigable, only their children are.
    const flatten = (items: NavItem[]): NavItem[] =>
      items.flatMap((i) => (i.children ? flatten(i.children) : [i]));
    const items = flatten(visibleNav(user.role, user.module_access || []).flatMap((g) => g.items));
    return items
      .filter((i) => i.href && normalize(i.label).includes(q))
      .map((i) => ({ type: "page", id: i.href as string, label: i.label, sublabel: "Page", href: i.href as string, icon: i.icon }));
  }, [query, user]);

  const combined = [...pageMatches, ...results];

  const goToResult = (r: SearchResult) => {
    router.push(r.href);
    setQuery("");
    setResults([]);
    setSearchOpen(false);
  };

  return (
    <div className="topbar-wrap">
      <header className="topbar-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          <button onClick={onToggleCollapsed} className="icon-btn-anim" style={circleBtn} aria-label="Toggle sidebar">
            <i className={`bi ${collapsed ? "bi-list" : "bi-x-lg"}`} />
          </button>
          <div ref={searchRef} className="topbar-search" style={{ position: "relative", width: 300, maxWidth: "36vw" }}>
            <div style={searchWrap}>
              <i className="bi bi-search" style={{ color: "var(--text-muted)" }} />
              <input
                placeholder="Search anything…"
                style={searchInput}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearchOpen(false);
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Enter" && combined.length > 0) goToResult(combined[0]);
                }}
              />
              {query && (
                <button
                  type="button"
                  className="icon-btn-anim"
                  style={clearBtn}
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <i className="bi bi-x-lg" />
                </button>
              )}
            </div>

            {searchOpen && query.trim().length >= 2 && (
              <div style={searchPanel}>
                {pageMatches.length > 0 && (
                  <>
                    <div style={searchSectionLabel}>Pages</div>
                    {pageMatches.map((r) => (
                      <button key={`page-${r.href}`} style={searchResultRow} onClick={() => goToResult(r)}>
                        <span style={searchResultIcon}>
                          <i className={`bi ${r.icon}`} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{r.label}</div>
                        </span>
                        <i className="bi bi-arrow-right" style={{ fontSize: 12, color: "var(--text-muted)" }} />
                      </button>
                    ))}
                  </>
                )}

                {pageMatches.length > 0 && (results.length > 0 || searching) && (
                  <div style={searchSectionLabel}>Results</div>
                )}

                {searching && <p className="muted" style={{ fontSize: 12.5, padding: "10px 12px", margin: 0 }}>Searching…</p>}
                {!searching && results.length === 0 && pageMatches.length === 0 && (
                  <p className="muted" style={{ fontSize: 12.5, padding: "10px 12px", margin: 0 }}>No results.</p>
                )}
                {!searching &&
                  results.map((r) => (
                    <button key={`${r.type}-${r.id}`} style={searchResultRow} onClick={() => goToResult(r)}>
                      <span style={searchResultIcon}>
                        <i className={`bi ${r.icon}`} />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.label}
                        </div>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {r.sublabel}
                        </div>
                      </span>
                      <i className="bi bi-arrow-right" style={{ fontSize: 12, color: "var(--text-muted)" }} />
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="topbar-powered-by" style={poweredBy}>Powered by Kreativefolio</span>
          <Link
            href="/ai"
            className="edith-topbar-btn"
            aria-label="Open EDITH"
            title="EDITH"
          >
            <EdithOrb size="xs" />
            <span className="edith-topbar-btn__label">EDITH</span>
          </Link>
          <ThemeToggle />
          {(needsPrompt || perm === "denied") && (
            <button
              type="button"
              className="icon-btn-anim"
              style={{
                ...circleBtn,
                width: "auto",
                padding: "0 12px",
                borderRadius: 999,
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: perm === "denied" ? "var(--danger)" : "var(--gold)",
              }}
              title={
                perm === "denied"
                  ? "Notifications blocked in browser settings"
                  : "Allow desktop notifications for tasks, chat, and reminders"
              }
              onClick={async () => {
                const result = await enable();
                if (result === "granted") showToast("Desktop notifications enabled.");
                else if (result === "denied")
                  showToast("Notifications blocked — allow them in your browser site settings.", "error");
              }}
            >
              <i className={`bi ${perm === "denied" ? "bi-bell-slash-fill" : "bi-bell"}`} style={{ fontSize: 15 }} />
              <span style={{ whiteSpace: "nowrap" }}>
                {perm === "denied" ? "Blocked" : "Allow alerts"}
              </span>
            </button>
          )}
          <Link href="/reminders" className="icon-btn-anim" style={circleBtn} aria-label="Reminders">
            <i className="bi bi-bell-fill" style={{ fontSize: 17 }} />
            {unread > 0 && <span style={dot}>{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/support" className="icon-btn-anim" style={circleBtn} aria-label="Support">
            <i className="bi bi-headset" style={{ fontSize: 17 }} />
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
                <span style={{ display: "block", fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
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
                {perm !== "granted" && perm !== "unsupported" && (
                  <button
                    style={{ ...dropdownItem, width: "100%", border: "none", background: "none" }}
                    onClick={async () => {
                      setMenuOpen(false);
                      const result = await enable();
                      if (result === "granted") showToast("Desktop notifications enabled.");
                      else if (result === "denied")
                        showToast("Notifications blocked — allow them in your browser site settings.", "error");
                    }}
                  >
                    <i className="bi bi-bell-fill" /> Enable notifications
                  </button>
                )}
                {user?.role === "superadmin" && (
                  <Link href="/logs" style={dropdownItem} onClick={() => setMenuOpen(false)}>
                    <i className="bi bi-clock-history" /> Logs
                  </Link>
                )}
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

const searchWrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  background: "var(--bg)",
  borderRadius: 999,
  padding: "9px 16px",
  width: "100%",
};
const clearBtn: React.CSSProperties = {
  width: 20,
  height: 20,
  minWidth: 20,
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "transparent",
  color: "var(--text-muted)",
  border: "none",
  fontSize: 10,
};
const searchPanel: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  left: 0,
  right: 0,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "var(--shadow)",
  padding: 6,
  zIndex: 20,
  maxHeight: 360,
  overflowY: "auto",
};
const searchResultRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "none",
  background: "transparent",
  cursor: "pointer",
};
const searchResultIcon: React.CSSProperties = {
  width: 30,
  height: 30,
  minWidth: 30,
  borderRadius: 8,
  display: "grid",
  placeItems: "center",
  background: "var(--gold-soft)",
  color: "var(--gold)",
  fontSize: 13,
};
const searchSectionLabel: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--text-muted)",
  padding: "8px 10px 4px",
};
const searchInput: React.CSSProperties = {
  border: "none",
  outline: "none",
  background: "transparent",
  flex: 1,
  fontSize: 13.5,
  color: "var(--text)",
};
const poweredBy: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginRight: 4,
  whiteSpace: "nowrap",
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
  background: "var(--brand-fill)",
  color: "var(--on-brand)",
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
