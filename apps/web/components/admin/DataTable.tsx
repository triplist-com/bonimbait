import type { ReactNode } from 'react';

export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Tailwind classes for the cell (width, alignment, hiding on tablet). */
  className?: string;
};

/**
 * Admin list table. Server-renderable; rows scroll horizontally on narrow
 * screens instead of breaking the layout.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty = 'אין פריטים להצגה.',
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  caption?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-gray-600">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`px-3 py-2.5 text-start font-medium ${col.className ?? ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-gray-500">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70">
                {columns.map((col) => (
                  <td key={col.key} className={`px-3 py-2.5 align-middle text-gray-800 ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
