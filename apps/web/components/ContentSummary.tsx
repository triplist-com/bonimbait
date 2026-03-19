'use client';

import Link from 'next/link';
import type { KeyPoint, CostItem, AnswerSource } from '@/lib/types';
import { formatTimestamp } from '@/lib/types';

interface ContentSummaryProps {
  /** AI-generated summary text */
  summary?: string;
  /** Key points / takeaways */
  keyPoints?: KeyPoint[];
  /** Cost data items */
  costs?: CostItem[];
  /** Tips list */
  tips?: string[];
  /** Warnings list */
  warnings?: string[];
  /** Source video citations (for search answers) */
  sources?: AnswerSource[];
  /** Visual variant: full for video/category pages, compact for search */
  variant?: 'full' | 'compact';
  /** Callback when a timestamp is clicked (for video page seeking) */
  onTimestampClick?: (seconds: number) => void;
}

// ---------------------------------------------------------------------------
// Price formatting
// ---------------------------------------------------------------------------

function formatPrice(price: string | number): string {
  if (typeof price === 'string') {
    const cleaned = price.replace(/\s*ש"ח\s*$/g, '').trim();
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-').map((p) => p.trim());
      const nums = parts.map((p) => {
        const num = Number(p.replace(/,/g, ''));
        return { num, formatted: isNaN(num) ? p : num.toLocaleString('he-IL') };
      });
      nums.sort((a, b) => (a.num || 0) - (b.num || 0));
      return `\u200E${nums.map((n) => n.formatted).join(' - ')} ₪`;
    }
    const num = Number(cleaned.replace(/,/g, ''));
    if (!isNaN(num)) return `\u200E${num.toLocaleString('he-IL')} ₪`;
    return price;
  }
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  title,
  color = 'text-gray-900',
}: {
  icon: React.ReactNode;
  title: string;
  color?: string;
}) {
  return (
    <h3 className={`text-base font-bold ${color} mb-3 flex items-center gap-2`}>
      {icon}
      {title}
    </h3>
  );
}

function SummarySection({ text, compact }: { text: string; compact: boolean }) {
  return (
    <div className={`${compact ? 'mb-4' : 'bg-gradient-to-br from-blue-50/60 to-indigo-50/40 border border-blue-100/80 rounded-xl p-5 mb-5'}`}>
      {!compact && (
        <SectionHeader
          icon={
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          }
          title="סיכום"
          color="text-blue-900"
        />
      )}
      <p className={`text-gray-700 leading-relaxed ${compact ? 'text-sm' : 'text-sm'} whitespace-pre-line`}>
        {text}
      </p>
    </div>
  );
}

function KeyPointsSection({
  points,
  compact,
  onTimestampClick,
}: {
  points: KeyPoint[];
  compact: boolean;
  onTimestampClick?: (seconds: number) => void;
}) {
  return (
    <div className={`${compact ? 'mb-4' : 'bg-white border border-gray-200/80 rounded-xl p-5 mb-5 shadow-sm'}`}>
      <SectionHeader
        icon={
          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          </svg>
        }
        title="נקודות עיקריות"
      />
      <ul className={`space-y-${compact ? '2' : '3'}`}>
        {points.map((kp, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`${compact ? 'w-5 h-5 text-2xs' : 'w-6 h-6 text-xs'} rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-700 leading-relaxed`}>
                {kp.text}
              </span>
              {kp.timestamp !== undefined && kp.timestamp > 0 && onTimestampClick && (
                <button
                  onClick={() => onTimestampClick(kp.timestamp!)}
                  className="ms-2 text-xs text-primary hover:underline font-medium"
                >
                  {formatTimestamp(kp.timestamp)}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CostsSection({ items, compact }: { items: CostItem[]; compact: boolean }) {
  return (
    <div className={`${compact ? 'mb-4' : 'bg-white border border-gray-200/80 rounded-xl p-5 mb-5 shadow-sm'}`}>
      <SectionHeader
        icon={
          <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="עלויות"
        color="text-emerald-900"
      />
      {/* Desktop table */}
      <div className={`${compact ? '' : 'hidden sm:block'} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">פריט</th>
              <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">מחיר</th>
              {!compact && <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">יחידה</th>}
              {!compact && <th className="text-right py-2.5 px-3 font-semibold text-gray-600 text-xs uppercase tracking-wide">הקשר</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                <td className="py-2.5 px-3 text-gray-900 font-medium text-sm">{item.item}</td>
                <td className="py-2.5 px-3 text-emerald-700 font-semibold text-sm">{formatPrice(item.price)}</td>
                {!compact && <td className="py-2.5 px-3 text-gray-500 text-sm">{item.unit}</td>}
                {!compact && <td className="py-2.5 px-3 text-gray-400 text-xs">{item.context || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards (full variant only) */}
      {!compact && (
        <div className="sm:hidden space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="bg-gray-50/50 border border-gray-100 rounded-lg p-3.5">
              <div className="flex items-start justify-between mb-1.5">
                <span className="font-medium text-gray-900 text-sm">{item.item}</span>
                <span className="text-emerald-700 font-bold text-sm">{formatPrice(item.price)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span>{item.unit}</span>
                {item.context && <span>{item.context}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TipsSection({ items, compact }: { items: string[]; compact: boolean }) {
  return (
    <div className={`${compact ? 'mb-4' : 'bg-gradient-to-br from-green-50/60 to-emerald-50/40 border border-green-200/60 rounded-xl p-5 mb-5'}`}>
      <SectionHeader
        icon={
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        title="טיפים"
        color="text-green-900"
      />
      <ul className={`space-y-${compact ? '1.5' : '2.5'}`}>
        {items.map((tip, i) => (
          <li key={i} className={`flex items-start gap-2.5 ${compact ? 'text-xs' : 'text-sm'} text-green-800`}>
            <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <span className="leading-relaxed">{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WarningsSection({ items, compact }: { items: string[]; compact: boolean }) {
  return (
    <div className={`${compact ? 'mb-4' : 'bg-gradient-to-br from-red-50/60 to-orange-50/40 border border-red-200/60 rounded-xl p-5 mb-5'}`}>
      <SectionHeader
        icon={
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        }
        title="אזהרות"
        color="text-red-900"
      />
      <ul className={`space-y-${compact ? '1.5' : '2.5'}`} role="alert">
        {items.map((warning, i) => (
          <li key={i} className={`flex items-start gap-2.5 ${compact ? 'text-xs' : 'text-sm'} text-red-800`}>
            <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008" />
            </svg>
            <span className="leading-relaxed">{warning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourcesSection({ sources }: { sources: AnswerSource[] }) {
  return (
    <div className="pt-3 mt-3 border-t border-gray-200/60">
      <p className="text-xs font-medium text-gray-400 mb-2">מבוסס על הסרטונים:</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <Link
            key={`${source.video_id}-${source.timestamp}`}
            href={`/video/${source.video_id}${source.timestamp > 0 ? `?t=${source.timestamp}` : ''}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded-md transition-colors font-medium"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="max-w-[200px] truncate">{source.title}</span>
            {source.timestamp > 0 && (
              <span className="text-primary/50">{formatTimestamp(source.timestamp)}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContentSummary({
  summary,
  keyPoints,
  costs,
  tips,
  warnings,
  sources,
  variant = 'full',
  onTimestampClick,
}: ContentSummaryProps) {
  const compact = variant === 'compact';
  const hasContent = summary || (keyPoints && keyPoints.length > 0) || (costs && costs.length > 0) || (tips && tips.length > 0) || (warnings && warnings.length > 0);

  if (!hasContent) return null;

  return (
    <div className={compact ? '' : 'space-y-0'}>
      {summary && <SummarySection text={summary} compact={compact} />}
      {keyPoints && keyPoints.length > 0 && (
        <KeyPointsSection points={keyPoints} compact={compact} onTimestampClick={onTimestampClick} />
      )}
      {costs && costs.length > 0 && (
        <CostsSection items={costs} compact={compact} />
      )}
      {tips && tips.length > 0 && (
        <TipsSection items={tips} compact={compact} />
      )}
      {warnings && warnings.length > 0 && (
        <WarningsSection items={warnings} compact={compact} />
      )}
      {sources && sources.length > 0 && (
        <SourcesSection sources={sources} />
      )}
    </div>
  );
}
