'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AnswerCitation, ProsCta } from '@/lib/types';
import { formatTimestamp } from '@/lib/types';
import WizardModal from '@/components/WizardModal';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import BusinessLogo from '@/components/directory/BusinessLogo';

interface AiAnswerProps {
  answer: string;
  sources?: AnswerCitation[];
  pros?: ProsCta | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  isStreaming?: boolean;
  error?: string | null;
  isCostRelated?: boolean;
  searchQuery?: string;
}

const confidenceConfig = {
  high: { label: 'ביטחון גבוה', color: 'bg-green-100 text-green-700' },
  medium: { label: 'ביטחון בינוני', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'ביטחון נמוך', color: 'bg-red-100 text-red-700' },
};

export default function AiAnswer({
  answer,
  sources,
  pros,
  confidence,
  isStreaming,
  error,
  isCostRelated,
  searchQuery,
}: AiAnswerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const isLong = answer.length > 600;

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-700 text-sm">
        {error}
      </div>
    );
  }

  if (!answer && !isStreaming) return null;

  return (
    <div
      className={`gradient-border rounded-2xl transition-opacity duration-500 ease-out ${
        answer ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="bg-gradient-to-br from-primary-50/80 to-white rounded-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-bold px-3 py-1.5 rounded-full">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                />
              </svg>
              <span>תשובה מבוססת AI</span>
            </div>

            {confidence && !isStreaming && (
              <span
                className={`text-2xs font-medium px-2 py-1 rounded-full ${confidenceConfig[confidence].color}`}
              >
                {confidenceConfig[confidence].label}
              </span>
            )}
          </div>

          {isLong && !isStreaming && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs text-primary hover:text-primary-700 font-medium"
            >
              {isExpanded ? 'הצג פחות' : 'הצג עוד'}
            </button>
          )}
        </div>

        {/* Answer text */}
        <div
          className={`text-gray-700 leading-relaxed text-sm whitespace-pre-line ${
            !isExpanded && isLong ? 'max-h-40 overflow-hidden relative' : ''
          }`}
        >
          {answer}
          {isStreaming && answer && (
            <span className="inline-flex gap-1 ms-1 align-middle">
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot"
                style={{ animationDelay: '160ms' }}
              />
              <span
                className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse-dot"
                style={{ animationDelay: '320ms' }}
              />
            </span>
          )}
          {!isExpanded && isLong && (
            <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-white to-transparent" />
          )}
        </div>

        {/* Sources */}
        {sources && sources.length > 0 && !isStreaming && (
          <div className="mt-4 pt-4 border-t border-primary-100">
            <p className="text-xs font-medium text-gray-500 mb-2">
              מבוסס על:
            </p>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) =>
                source.kind === 'post' ? (
                  <Link
                    key={`post-${source.slug}`}
                    href={source.url}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="sr-only">מאמר:</span>
                    {source.title}
                  </Link>
                ) : (
                  <Link
                    key={`${source.video_id}-${source.timestamp}`}
                    href={`/video/${source.video_id}/?t=${source.timestamp}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="sr-only">סרטון:</span>
                    {source.title}
                    {source.timestamp > 0 && (
                      <span className="text-primary/60">
                        {formatTimestamp(source.timestamp)}
                      </span>
                    )}
                  </Link>
                ),
              )}
            </div>
          </div>
        )}

        {/* Pros matched to the question's specialty */}
        {pros && pros.pros.length > 0 && !isStreaming && answer && (
          <div className="mt-4 pt-4 border-t border-primary-100">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <p className="text-sm font-bold text-gray-900">
                אנשי מקצוע מומלצים: {pros.specialty.name}
              </p>
              <Link
                href={pros.specialty.href}
                className="shrink-0 text-xs font-medium text-primary hover:text-primary-700"
              >
                לכל {pros.specialty.name}
              </Link>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {pros.pros.map((pro) => (
                <li key={pro.slug}>
                  <Link
                    href={pro.href}
                    className="flex h-full items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 transition hover:border-primary-200 hover:shadow-card"
                  >
                    <BusinessLogo name={pro.name} src={pro.logo_url} className="h-10 w-10" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900">{pro.name}</span>
                      {(pro.city || pro.tagline) && (
                        <span className="block truncate text-xs text-gray-500">{pro.city || pro.tagline}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTAs: free consultation always, cost wizard for cost questions */}
        {!isStreaming && answer && (
          <div className="mt-4 pt-4 border-t border-primary-100 flex flex-wrap items-center gap-3">
            {isCostRelated && (
              <button
                onClick={() => setIsWizardOpen(true)}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008H15.75v-.008zm0 2.25h.008v.008H15.75V13.5z" />
                </svg>
                חשב עלות לבית שלך
                <svg className="w-4 h-4 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            )}
            <ConsultationCTA
              source="ai-answer"
              label="פגישת ייעוץ ללא עלות"
            />
          </div>
        )}

        {/* Wizard Modal */}
        <WizardModal
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          searchQuery={searchQuery}
        />
      </div>
    </div>
  );
}
