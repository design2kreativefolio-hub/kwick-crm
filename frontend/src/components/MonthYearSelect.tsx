"use client";

import { useMemo } from "react";

import { Select } from "@/components/Select";

export const CALENDAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type MonthYearSelectProps = {
  month: number;
  year: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  yearFrom?: number;
  yearTo?: number;
  /** For calendar headers on colored backgrounds */
  light?: boolean;
  className?: string;
};

export function monthYearRange(from?: number, to?: number) {
  const now = new Date().getFullYear();
  const start = from ?? now - 30;
  const end = to ?? now + 5;
  const years: number[] = [];
  for (let y = end; y >= start; y--) years.push(y);
  return years;
}

export function MonthYearSelect({
  month,
  year,
  onMonthChange,
  onYearChange,
  yearFrom,
  yearTo,
  light = false,
  className = "",
}: MonthYearSelectProps) {
  const years = monthYearRange(yearFrom, yearTo);

  const monthOptions = useMemo(
    () => CALENDAR_MONTHS.map((label, idx) => ({ value: String(idx), label })),
    []
  );
  const yearOptions = useMemo(
    () => years.map((y) => ({ value: String(y), label: String(y) })),
    [years]
  );

  return (
    <div className={`month-year-select${className ? ` ${className}` : ""}`}>
      <Select
        compact
        variant={light ? "light" : "default"}
        value={String(month)}
        onChange={(v) => onMonthChange(Number(v))}
        options={monthOptions}
        maxVisibleOptions={6}
        minPanelWidth={132}
        ariaLabel="Month"
      />
      <Select
        compact
        variant={light ? "light" : "default"}
        value={String(year)}
        onChange={(v) => onYearChange(Number(v))}
        options={yearOptions}
        maxVisibleOptions={6}
        minPanelWidth={88}
        ariaLabel="Year"
      />
    </div>
  );
}
