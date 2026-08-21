"use client";

import Link from "next/link";

import { STATUS_BADGE } from "@/lib/statusBadges";

export type EdithCardItem = {
  id?: number;
  title: string;
  status?: string;
  status_label?: string;
  priority?: string;
  priority_label?: string;
  due_date?: string | null;
  assignee?: string;
  assignees?: string[];
  project?: string | null;
  client?: string | null;
  href?: string;
};

export type EdithCards = {
  kind?: string;
  title?: string;
  subtitle?: string;
  groups?: { person: string; items: EdithCardItem[] }[];
};

function formatDue(iso?: string | null): { label: string; tone: "overdue" | "soon" | "ok" } | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return { label: iso, tone: "ok" };
  const date = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  const label = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (diff < 0) return { label, tone: "overdue" };
  if (diff === 0) return { label: "Today", tone: "soon" };
  if (diff === 1) return { label: "Tomorrow", tone: "soon" };
  return { label, tone: "ok" };
}

export function EdithVisualCards({ cards }: { cards?: EdithCards | null }) {
  if (!cards?.kind) return null;
  const groups = cards.groups?.filter((g) => g.items?.length) || [];
  const isTodo = cards.kind === "todo_cards";
  const allHref = isTodo ? "/todo" : "/tasks";

  return (
    <div className="edith-cards">
      <div className="edith-cards__head">
        <div>
          <strong>{cards.title || (isTodo ? "To-dos" : "Tasks")}</strong>
          {cards.subtitle && <span className="muted">{cards.subtitle}</span>}
        </div>
        <Link href={allHref} className="edith-cards__all">
          View all
          <i className="bi bi-chevron-right" />
        </Link>
      </div>
      {groups.length === 0 ? (
        <div className="edith-cards__empty">Nothing open right now.</div>
      ) : (
        groups.map((group) => (
          <div key={group.person} className="edith-cards__group">
            {groups.length > 1 && (
              <div className="edith-cards__person">
                <span className="edith-cards__avatar">{initials(group.person)}</span>
                <span className="edith-cards__person-name">{group.person}</span>
                <span className="edith-cards__count">{group.items.length}</span>
              </div>
            )}
            <div className="edith-cards__grid">
              {group.items.map((item, i) => {
                const due = formatDue(item.due_date);
                const href = item.href || allHref;
                return (
                  <Link key={item.id ?? `${group.person}-${i}`} href={href} className="edith-task-card">
                    <div className="edith-task-card__top">
                      {!isTodo && (
                        <span className={`badge ${STATUS_BADGE[item.status || "assigned"] || "badge-muted"}`}>
                          {item.status_label || item.status || "Assigned"}
                        </span>
                      )}
                      {item.priority === "high" && <span className="edith-task-card__pri">High</span>}
                    </div>
                    <strong className="edith-task-card__title">{item.title}</strong>
                    <div className="edith-task-card__meta">
                      {item.client && <span>{item.client}</span>}
                      {item.project && <span>{item.project}</span>}
                      {due && (
                        <span className={`edith-task-card__due is-${due.tone}`}>
                          <i className="bi bi-calendar3" /> {due.label}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}
