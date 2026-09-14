"use client";

import { EditableLabel } from "./EditableLabel";

type Column<T> = { key: keyof T & string; label: string; placeholder?: string };

export function EditableTable<T extends Record<string, any>>({
  columns,
  rows,
  onChange,
  emptyRow,
  addLabel = "Add row",
  onHeaderChange,
}: {
  columns: Column<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  emptyRow: () => T;
  addLabel?: string;
  /** When set, each column header becomes pencil-editable and edits are
   *  reported back by column key (the header text flows into preview + PDF). */
  onHeaderChange?: (key: string, label: string) => void;
}) {
  const updateCell = (idx: number, key: keyof T & string, value: string) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const addRow = () => onChange([...rows, emptyRow()]);

  return (
    <div>
      {rows.length > 0 && (
        <table className="editable-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  {onHeaderChange ? (
                    <EditableLabel
                      value={c.label}
                      onChange={(v) => onHeaderChange(c.key, v)}
                      fallback={c.key}
                      ariaLabel="Edit column title"
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <textarea
                      value={row[c.key] ?? ""}
                      placeholder={c.placeholder}
                      onChange={(e) => updateCell(idx, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--danger)" }}
                    onClick={() => removeRow(idx)}
                    aria-label="Remove row"
                  >
                    <i className="bi bi-trash-fill" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow} style={{ marginTop: rows.length ? 8 : 0 }}>
        <i className="bi bi-plus-lg" /> {addLabel}
      </button>
    </div>
  );
}
