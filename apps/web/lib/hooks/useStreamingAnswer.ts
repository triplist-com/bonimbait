'use client';

import { useState, useCallback, useRef } from 'react';
import { streamAnswer, getAnswer, getPregeneratedAnswer } from '@/lib/api';
import type { AnswerCitation, AnswerSource, ProsCta } from '@/lib/types';

interface StreamingAnswerState {
  answer: string;
  sources: AnswerCitation[];
  pros: ProsCta | null;
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
    pros: null,
    confidence: null,
    isStreaming: false,
    error: null,
    isCostRelated: false,
  });
  const controllerRef = useRef<AbortController | null>(null);
  // Bumped on every start(); a lookup that resolves after a newer start() must
  // not open its own stream (it would interleave chunks into the new answer).
  const requestIdRef = useRef(0);

  const start = useCallback((query: string) => {
    // Cancel any in-flight stream
    controllerRef.current?.abort();
    const requestId = ++requestIdRef.current;

    const isCostRelated = checkCostRelated(query);

    setState({
      answer: '',
      sources: [],
      pros: null,
      confidence: null,
      isStreaming: true,
      error: null,
      isCostRelated,
    });

    // Try pre-generated answer first for instant response
    getPregeneratedAnswer(query)
      .then((pregenerated) => {
        if (requestId !== requestIdRef.current) return;
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
            pros: null,
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
          (sources, confidence, pros) => {
            setState((prev) => ({
              ...prev,
              sources,
              pros,
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
                  pros: null,
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
        if (requestId !== requestIdRef.current) return;
        // Pre-generated lookup failed — fall through to streaming
        const controller = streamAnswer(
          query,
          (text) => {
            setState((prev) => ({ ...prev, answer: prev.answer + text }));
          },
          (sources, confidence, pros) => {
            setState((prev) => ({
              ...prev,
              sources,
              pros,
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
                  pros: null,
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
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  return { ...state, start, cancel };
}
