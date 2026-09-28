import type { StatusInfo, Tone } from '@/lib/admin/labels';

const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  blue: 'bg-primary-50 text-primary-700 ring-primary-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-800 ring-amber-100',
  red: 'bg-red-50 text-red-700 ring-red-100',
  purple: 'bg-purple-50 text-purple-700 ring-purple-100',
};

/** Colored status pill. Pass a map entry from lib/admin/labels. */
export default function StatusBadge({ info, label, tone }: { info?: StatusInfo; label?: string; tone?: Tone }) {
  const text = label ?? info?.label ?? '—';
  const t = tone ?? info?.tone ?? 'gray';
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[t]}`}>
      {text}
    </span>
  );
}
