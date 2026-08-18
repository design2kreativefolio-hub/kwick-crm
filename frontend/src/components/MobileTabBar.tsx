"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLiveUpdates } from "@/lib/liveUpdates";

const TABS = [
  { href: "/dashboard", label: "Home", icon: "bi-house-fill" },
  { href: "/tasks", label: "Tasks", icon: "bi-check-square-fill" },
  { href: "/calendar", label: "Calendar", icon: "bi-calendar3-fill" },
  { href: "/chat", label: "Chat", icon: "bi-chat-dots-fill" },
] as const;

export function MobileTabBar({
  moreOpen,
  onMore,
}: {
  moreOpen: boolean;
  onMore: () => void;
}) {
  const pathname = usePathname();
  const { chatUnread: chatCount } = useLiveUpdates();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="mobile-tabbar" aria-label="Main">
      {TABS.map((tab) => {
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
          <i className="bi bi-grid-3x3-gap-fill" />
        </span>
        <span className="mobile-tabbar__label">More</span>
      </button>
    </nav>
  );
}
