import type { StatusInfo, Tone } from '@/lib/admin/labels';

const TONES: Record<Tone, string> = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  blue: 'bg-primary-50 text-primary-700 ring-primary-100',
  green: 'bg-success-50 text-success-700 ring-success-100',
  amber: 'bg-warning-50 text-warning-800 ring-warning-100',
  red: 'bg-danger-50 text-danger-700 ring-danger-100',
  purple: 'bg-info-50 text-info-700 ring-info-100',
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
