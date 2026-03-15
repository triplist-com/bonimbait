'use client';

import { useState, useCallback, useRef } from 'react';
import { streamAnswer, getAnswer } from '@/lib/api';
import type { AnswerSource } from '@/lib/types';

interface StreamingAnswerState {
  answer: string;
  sources: AnswerSource[];
  confidence: 'high' | 'medium' | 'low' | null;
  isStreaming: boolean;
  error: string | null;
}

export function useStreamingAnswer() {
  const [state, setState] = useState<StreamingAnswerState>({
    answer: '',
    sources: [],
    confidence: null,
    isStreaming: false,
    error: null,
  });
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback((query: string) => {
    // Cancel any in-flight stream
    controllerRef.current?.abort();

    setState({
      answer: '',
      sources: [],
      confidence: null,
      isStreaming: true,
      error: null,
    });

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
      (err) => {
        // Fallback to non-streaming
        setState((prev) => ({ ...prev, isStreaming: false }));
        getAnswer(query)
          .then((data) => {
            setState({
              answer: data.answer,
              sources: data.sources,
              confidence: data.confidence,
              isStreaming: false,
              error: null,
            });
          })
          .catch(() => {
            setState((prev) => ({
              ...prev,
              error: 'שגיאה בקבלת תשובה. אנא נסו שוב.',
              isStreaming: false,
            }));
          });
      },
    );

    controllerRef.current = controller;
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);

  return { ...state, start, cancel };
}
