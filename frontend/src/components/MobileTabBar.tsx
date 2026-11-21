"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { hasSalesDashboard, isBde, useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/liveUpdates";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "bi-house-door-fill" },
  { href: "/tasks", label: "Tasks", icon: "bi-check2-circle" },
  { href: "/calendar", label: "Calendar", icon: "bi-calendar2-week-fill" },
  { href: "/chat", label: "Chat", icon: "bi-chat-square-text-fill" },
] as const;

export function MobileTabBar({
  moreOpen,
  onMore,
}: {
  moreOpen: boolean;
  onMore: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const live = useLiveUpdates();
  // Business Development executives live in My Day. On the Sales dashboard Home already is My Day, so
  // the spare tab becomes Leads; otherwise My Day takes Tasks' slot.
  const bdTab = hasSalesDashboard(user)
    ? { href: "/bd/leads", label: "Leads", icon: "bi-person-plus-fill" }
    : { href: "/bd", label: "My Day", icon: "bi-sun-fill" };
  const tabs: readonly { href: string; label: string; icon: string }[] = isBde(user)
    ? TABS.map((t) => (t.href === "/tasks" ? bdTab : t))
    : TABS;
  const chatCount = "chatUnread" in live ? Number((live as { chatUnread?: number }).chatUnread || 0) : 0;

  // /bd is a prefix of /bd/leads etc., so treat it as active across the whole module.
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="mobile-tabbar" aria-label="Main">
      <div className="mobile-tabbar__inner">
        {tabs.map((tab) => {
          const active = !moreOpen && isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`mobile-tabbar__item${active ? " is-active" : ""}`}
              onClick={() => {
                if (moreOpen) onMore();
              }}
            >
              <span className="mobile-tabbar__icon">
                <i className={`bi ${tab.icon}`} />
                {tab.href === "/chat" && chatCount > 0 && (
                  <span className="mobile-tabbar__badge">{chatCount > 9 ? "9+" : chatCount}</span>
                )}
              </span>
              <span className="mobile-tabbar__label">{tab.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`mobile-tabbar__item${moreOpen ? " is-active" : ""}`}
          onClick={onMore}
        >
          <span className="mobile-tabbar__icon">
            <i className="bi bi-three-dots" />
          </span>
          <span className="mobile-tabbar__label">More</span>
        </button>
      </div>
    </nav>
  );
}
