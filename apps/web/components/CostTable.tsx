import type { CostItem } from '@/lib/types';

interface CostTableProps {
  items: CostItem[];
}

function formatNIS(amount: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function CostTable({ items }: CostTableProps) {
  if (!items || items.length === 0) return null;

  return (
    <div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-right py-3 px-4 font-semibold text-gray-900">פריט</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">מחיר</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">יחידה</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-900">הקשר</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-gray-100 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                }`}
              >
                <td className="py-3 px-4 text-gray-900 font-medium">{item.item}</td>
                <td className="py-3 px-4 text-primary font-semibold">
                  {formatNIS(item.price)}
                </td>
                <td className="py-3 px-4 text-gray-600">{item.unit}</td>
                <td className="py-3 px-4 text-gray-500 text-xs">{item.context || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="bg-white border border-gray-100 rounded-xl p-4 shadow-card"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="font-medium text-gray-900">{item.item}</span>
              <span className="text-primary font-bold text-lg">{formatNIS(item.price)}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>יחידה: {item.unit}</span>
              {item.context && <span>{item.context}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
