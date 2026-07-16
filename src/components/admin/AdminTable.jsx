import React from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { LoadingState, EmptyState } from "./AdminStates";

/**
 * columns: [{ key, label, sortable, align, render(row) }]
 * sort: { sortBy, sortDir }
 */
export default function AdminTable({
  columns,
  rows,
  sort,
  onSort,
  onRowClick,
  loading,
  emptyMessage = "No records found.",
  rowKey = (r) => r.id,
}) {
  if (loading) return <LoadingState />;
  if (!rows || rows.length === 0) return <EmptyState message={emptyMessage} />;

  const handleSort = (col) => {
    if (!col.sortable || !onSort) return;
    const nextDir =
      sort?.sortBy === col.key && sort?.sortDir === "desc" ? "asc" : "desc";
    onSort(col.key, nextDir);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col)}
                className={`whitespace-nowrap px-4 py-3 font-semibold ${
                  col.align === "right" ? "text-right" : ""
                } ${col.sortable ? "cursor-pointer select-none hover:text-brand-navy" : ""}`}
              >
                <span
                  className={`inline-flex items-center gap-1 ${
                    col.align === "right" ? "flex-row-reverse" : ""
                  }`}
                >
                  {col.label}
                  {col.sortable &&
                    (sort?.sortBy === col.key ? (
                      sort.sortDir === "desc" ? (
                        <ArrowDown size={13} />
                      ) : (
                        <ArrowUp size={13} />
                      )
                    ) : (
                      <ChevronsUpDown size={13} className="text-slate-300" />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-slate-100 transition ${
                onRowClick ? "cursor-pointer hover:bg-brand-bg" : ""
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3 text-slate-700 ${
                    col.align === "right" ? "text-right" : ""
                  }`}
                >
                  {col.render ? col.render(row) : row[col.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
