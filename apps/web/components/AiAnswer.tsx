'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { AnswerSource } from '@/lib/types';
import { formatTimestamp } from '@/lib/types';

interface AiAnswerProps {
  answer: string;
  sources?: AnswerSource[];
  confidence?: 'high' | 'medium' | 'low' | null;
  isStreaming?: boolean;
  error?: string | null;
}

const confidenceConfig = {
  high: { label: 'ביטחון גבוה', color: 'bg-green-100 text-green-700' },
  medium: { label: 'ביטחון בינוני', color: 'bg-yellow-100 text-yellow-700' },
  low: { label: 'ביטחון נמוך', color: 'bg-red-100 text-red-700' },
};

export default function AiAnswer({
  answer,
  sources,
  confidence,
  isStreaming,
  error,
}: AiAnswerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
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
    <div className="gradient-border rounded-2xl">
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
          {isStreaming && (
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
              מבוסס על הסרטונים:
            </p>
            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <Link
                  key={`${source.video_id}-${source.timestamp}`}
                  href={`/video/${source.video_id}?t=${source.timestamp}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  {source.title}
                  {source.timestamp > 0 && (
                    <span className="text-primary/60">
                      {formatTimestamp(source.timestamp)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
