import type { DonutSlice } from "@/components/DonutCard";

/** Leave days inside the current calendar month, as sent by the leave-balance API. */
export type LeaveMonth = {
  label: string;
  taken: Record<string, number>;
  pending: number;
};

const TYPE_STYLE: { key: string; label: string; color: string }[] = [
  { key: "annual", label: "Annual", color: "var(--chart-1)" },
  { key: "sick", label: "Sick", color: "var(--chart-3)" },
  { key: "unpaid", label: "Unpaid", color: "var(--chart-4)" },
  { key: "other", label: "Other", color: "var(--chart-2)" },
];

/** Donut slices for the monthly chart: approved days by type, plus pending. */
export function buildMonthlyLeaveSlices(month: LeaveMonth | null | undefined): DonutSlice[] {
  if (!month) return [];
  const slices: DonutSlice[] = TYPE_STYLE.map((t) => ({
    label: t.label,
    value: month.taken?.[t.key] ?? 0,
    color: t.color,
  }));
  slices.push({ label: "Pending", value: month.pending ?? 0, color: "var(--warning, #f59e0b)" });
  return slices.filter((s) => s.value > 0);
}

export const EMPTY_LEAVE_SLICES: DonutSlice[] = [{ label: "No leave this month", value: 1, color: "var(--border)" }];

export type LeaveSplitPart = { type: string; days: number };

const TYPE_LABEL: Record<string, string> = { annual: "Annual", sick: "Sick", unpaid: "Unpaid", other: "Other" };
export const leaveTypeLabel = (t: string) => TYPE_LABEL[t] ?? t;

/** "2 days Sick + 1 day Annual" — empty string when the request isn't split. */
export function describeLeaveSplit(split?: LeaveSplitPart[] | null): string {
  if (!split || split.length === 0) return "";
  return split
    .map((p) => `${p.days} day${p.days === 1 ? "" : "s"} ${leaveTypeLabel(p.type)}`)
    .join(" + ");
}
