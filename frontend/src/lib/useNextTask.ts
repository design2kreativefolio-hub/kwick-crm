"use client";

import { useCallback, useEffect, useState } from "react";

import { api, unwrapList } from "@/lib/api";
import { isProjectTerminal } from "@/lib/statusBadges";

export type NextTask = {
  id: number;
  title: string;
  status: string;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  due_time: string | null;
  client_name?: string;
  project_name?: string;
};

const RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Most urgent unfinished task: overdue first, then soonest, then priority. */
export function pickNextTask(tasks: NextTask[]): NextTask | null {
  const open = tasks.filter((t) => !isProjectTerminal(t.status));
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const ad = a.due_date || "9999-99-99";
    const bd = b.due_date || "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return (RANK[a.priority] ?? 9) - (RANK[b.priority] ?? 9) || a.title.localeCompare(b.title);
  });
  return open[0];
}

/** "3 days overdue", "Due today", "Due tomorrow", "Due 12 Dec", or "No due date". */
export function dueLabel(due: string | null | undefined): { text: string; late: boolean } {
  if (!due) return { text: "No due date", late: false };
  const today = todayIso();
  if (due === today) return { text: "Due today", late: false };
  const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000);
  if (days < 0) return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, late: true };
  if (days === 1) return { text: "Due tomorrow", late: false };
  return {
    text: `Due ${new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    late: false,
  };
}

/** The signed-in person's single most urgent task (the "Do this first" card on Dashboard and Tasks). */
export function useNextTask() {
  const [task, setTask] = useState<NextTask | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    api<NextTask[] | { results: NextTask[] }>("/api/tasks?mine=1&page_size=100")
      .then((d) => setTask(pickNextTask(unwrapList(d))))
      .catch(() => setTask(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(reload, [reload]);
  return { task, loaded, reload };
}
