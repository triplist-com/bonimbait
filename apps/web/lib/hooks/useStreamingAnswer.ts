'use client';

import { useState, useCallback, useRef } from 'react';
import { streamAnswer, getAnswer, getPregeneratedAnswer } from '@/lib/api';
import type { AnswerSource } from '@/lib/types';

interface StreamingAnswerState {
  answer: string;
  sources: AnswerSource[];
  confidence: 'high' | 'medium' | 'low' | null;
  isStreaming: boolean;
  error: string | null;
  isCostRelated: boolean;
}

// Hebrew keywords that indicate cost-related queries
const COST_KEYWORDS = [
  'עלות', 'עולה', 'מחיר', 'עלויות', 'מחירים', 'כמה עולה',
  'תקציב', 'כסף', 'שקל', 'ש"ח', 'שקלים', 'יקר', 'זול',
  'הצעת מחיר', 'עלות בנייה', 'עלות בניה', 'מחירון',
  'לבנות בית', 'עלות יסוד', 'עלות שלד', 'עלות גמר',
];

function checkCostRelated(query: string): boolean {
  const q = query.toLowerCase();
  return COST_KEYWORDS.some((kw) => q.includes(kw));
}

export function useStreamingAnswer() {
  const [state, setState] = useState<StreamingAnswerState>({
    answer: '',
    sources: [],
    confidence: null,
    isStreaming: false,
    error: null,
    isCostRelated: false,
  });
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback((query: string) => {
    // Cancel any in-flight stream
    controllerRef.current?.abort();

    const isCostRelated = checkCostRelated(query);

    setState({
      answer: '',
      sources: [],
      confidence: null,
      isStreaming: true,
      error: null,
      isCostRelated,
    });

    // Try pre-generated answer first for instant response
    getPregeneratedAnswer(query)
      .then((pregenerated) => {
        if (pregenerated) {
          // Instant match — no streaming needed
          const sources: AnswerSource[] = (pregenerated.sources || []).map((s) => ({
            video_id: s.video_id || '',
            youtube_id: s.youtube_id || '',
            title: s.title || '',
            timestamp: s.timestamp || 0,
          }));
          const confidence =
            pregenerated.confidence >= 0.7
              ? 'high' as const
              : pregenerated.confidence >= 0.4
                ? 'medium' as const
                : 'low' as const;
          setState({
            answer: pregenerated.answer,
            sources,
            confidence,
            isStreaming: false,
            error: null,
            isCostRelated,
          });
          return;
        }

        // No pre-generated match — fall through to streaming
        const controller = streamAnswer(
          query,
          (text) => {
            setState((prev) => ({ ...prev, answer: prev.answer + text }));
          },
          (sources, confidence) => {
            setState((prev) => ({
              ...prev,
              sources,
              confidence,
              isStreaming: false,
            }));
          },
          () => {
            // Fallback to non-streaming
            getAnswer(query)
              .then((data) => {
                setState({
                  answer: data.answer,
                  sources: data.sources,
                  confidence: data.confidence,
                  isStreaming: false,
                  error: null,
                  isCostRelated,
                });
              })
              .catch(() => {
                setState((prev) => ({
                  ...prev,
                  error: 'שגיאה בקבלת תשובה. אנא נסו שוב.',
                  isStreaming: false,
                  isCostRelated,
                }));
              });
          },
        );

        controllerRef.current = controller;
      })
      .catch(() => {
        // Pre-generated lookup failed — fall through to streaming
        const controller = streamAnswer(
          query,
          (text) => {
            setState((prev) => ({ ...prev, answer: prev.answer + text }));
          },
          (sources, confidence) => {
            setState((prev) => ({
              ...prev,
              sources,
              confidence,
              isStreaming: false,
            }));
          },
          () => {
            getAnswer(query)
              .then((data) => {
                setState({
                  answer: data.answer,
                  sources: data.sources,
                  confidence: data.confidence,
                  isStreaming: false,
                  error: null,
                  isCostRelated,
                });
              })
              .catch(() => {
                setState((prev) => ({
                  ...prev,
                  error: 'שגיאה בקבלת תשובה. אנא נסו שוב.',
                  isStreaming: false,
                  isCostRelated,
                }));
              });
          },
        );

        controllerRef.current = controller;
      });
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  return { ...state, start, cancel };
}
