'use client';

import { useState, useCallback, useRef } from 'react';
import { streamAnswer, getAnswer } from '@/lib/api';
import type { AnswerSource } from '@/lib/types';

type AgentStep = 'searching' | 'found' | 'composing' | 'done' | null;

interface StreamingAnswerState {
  answer: string;
  sources: AnswerSource[];
  confidence: 'high' | 'medium' | 'low' | null;
  isStreaming: boolean;
  error: string | null;
  step: AgentStep;
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
    step: null,
    isCostRelated: false,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const firstChunkRef = useRef(false);

  const start = useCallback((query: string) => {
    // Cancel any in-flight stream
    controllerRef.current?.abort();
    firstChunkRef.current = false;

    const isCostRelated = checkCostRelated(query);

    setState({
      answer: '',
      sources: [],
      confidence: null,
      isStreaming: true,
      error: null,
      step: 'searching',
      isCostRelated,
    });

    // Fake step progression while waiting for first chunk
    const stepTimer1 = setTimeout(() => {
      setState((prev) => {
        if (prev.step === 'searching') return { ...prev, step: 'found' };
        return prev;
      });
    }, 1500);

    const stepTimer2 = setTimeout(() => {
      setState((prev) => {
        if (prev.step === 'found') return { ...prev, step: 'composing' };
        return prev;
      });
    }, 3000);

    const controller = streamAnswer(
      query,
      (text) => {
        if (!firstChunkRef.current) {
          firstChunkRef.current = true;
          // Jump to composing step on first chunk
          setState((prev) => ({ ...prev, step: 'composing', answer: text }));
        } else {
          setState((prev) => ({ ...prev, answer: prev.answer + text }));
        }
      },
      (sources, confidence) => {
        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        setState((prev) => ({
          ...prev,
          sources,
          confidence,
          isStreaming: false,
          step: 'done',
        }));
      },
      (err) => {
        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        // Fallback to non-streaming
        setState((prev) => ({ ...prev, step: 'composing' }));
        getAnswer(query)
          .then((data) => {
            setState({
              answer: data.answer,
              sources: data.sources,
              confidence: data.confidence,
              isStreaming: false,
              error: null,
              step: 'done',
              isCostRelated,
            });
          })
          .catch(() => {
            setState((prev) => ({
              ...prev,
              error: 'שגיאה בקבלת תשובה. אנא נסו שוב.',
              isStreaming: false,
              step: null,
              isCostRelated,
            }));
          });
      },
    );

    controllerRef.current = controller;
  }, []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState((prev) => ({ ...prev, isStreaming: false, step: null }));
  }, []);

  return { ...state, start, cancel };
}
