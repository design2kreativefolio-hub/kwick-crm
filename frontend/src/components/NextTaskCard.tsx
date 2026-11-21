"use client";

import { useState } from "react";

import { NextUpCard } from "@/components/NextUpCard";
import { api } from "@/lib/api";
import { TASK_STATUS_LABEL } from "@/lib/statusBadges";
import { useToast } from "@/lib/toast";
import { dueLabel, useNextTask } from "@/lib/useNextTask";

/**
 * "Do this first" for work: the person's most urgent unfinished task, with one button to open it and
 * one to move it along (Start, then Mark complete). When nothing is waiting it says so and points to
 * the next useful thing to do. Used on the Dashboard ("Your day") and on Tasks.
 */
export function NextTaskCard({
  eyebrow = "Do this first",
  onChanged,
  onAddTask,
}: {
  eyebrow?: string;
  /** Called after the task is moved along, so the page can refresh its own list. */
  onChanged?: () => void;
  /** On the Tasks page: open the new-task form right here instead of navigating. */
  onAddTask?: () => void;
}) {
  const { task, loaded, reload } = useNextTask();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  if (!loaded) return null;

  if (!task) {
    return (
      <NextUpCard
        eyebrow={eyebrow}
        icon="bi-check2-circle"
        title="You're all clear"
        subtitle="Nothing is waiting on you right now. Add a task, or ask EDITH to help plan your day."
        actions={[
          onAddTask
            ? { label: "Add a task", icon: "bi-plus-lg", onClick: onAddTask, primary: true }
            : { label: "Add a task", icon: "bi-plus-lg", href: "/tasks?new=1", primary: true },
          { label: "Ask EDITH", icon: "bi-stars", href: `/ai?ask=${encodeURIComponent("Help me plan my day")}` },
        ]}
      />
    );
  }

  const due = dueLabel(task.due_date);
  const next = task.status === "in_progress" ? { status: "completed", label: "Mark complete", icon: "bi-check2-circle" } : { status: "in_progress", label: "Start", icon: "bi-play-fill" };

  const advance = async () => {
    setBusy(true);
    try {
      await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: next.status }) });
      showToast(next.status === "completed" ? "Nice - marked complete." : "Started.");
      reload();
      onChanged?.();
    } catch {
      showToast("Couldn't update that task.", "error");
    } finally {
      setBusy(false);
    }
  };

  const where = [task.client_name, task.project_name].filter(Boolean).join(" · ");

  return (
    <NextUpCard
      eyebrow={eyebrow}
      icon={due.late ? "bi-exclamation-triangle-fill" : "bi-check2-square"}
      title={task.title}
      subtitle={`${due.text}${where ? ` - ${where}` : ""}`}
      chips={[
        { text: `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`, icon: "bi-flag-fill" },
        { text: TASK_STATUS_LABEL[task.status] ?? task.status },
      ]}
      actions={[
        { label: next.label, icon: next.icon, onClick: advance, primary: true, disabled: busy },
        { label: "Open task", icon: "bi-box-arrow-up-right", href: `/tasks/${task.id}` },
      ]}
    />
  );
}
