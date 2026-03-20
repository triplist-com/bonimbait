'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import WizardResult from './WizardResult';

// -- Types --

interface WizardOption {
  value: string;
  label: string;
}

interface WizardQuestion {
  id: string;
  label: string;
  type: 'single_select' | 'multi_select';
  options: WizardOption[];
}

interface BreakdownItem {
  phase: string;
  label: string;
  min: number;
  max: number;
  percentage: number;
}

interface Source {
  video_id: string;
  title: string;
  timestamp: number;
}

interface WizardResultData {
  total_min: number;
  total_max: number;
  breakdown: BreakdownItem[];
  sources?: Source[];
}

interface WizardClientProps {
  /** When true, renders in compact modal mode */
  modal?: boolean;
  /** Search query for prefill extraction */
  searchQuery?: string;
}

export default function WizardClient({ modal = false, searchQuery }: WizardClientProps) {
  const searchParams = useSearchParams();

  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [result, setResult] = useState<WizardResultData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch questions on mount
  useEffect(() => {
    async function fetchQuestions() {
      try {
        const res = await fetch('/api/wizard/questions');
        if (!res.ok) throw new Error('Failed to fetch questions');
        const data = await res.json();
        setQuestions(data.questions || data);
        setIsLoading(false);
      } catch {
        setError('לא הצלחנו לטעון את השאלון. נסו שוב.');
        setIsLoading(false);
      }
    }
    fetchQuestions();
  }, []);

  // Apply URL prefill params once questions are loaded
  useEffect(() => {
    if (questions.length === 0) return;

    const prefilled: Record<string, string | string[]> = {};

    // Read prefill_ URL params
    const entries = Array.from(searchParams.entries());
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      if (key.startsWith('prefill_')) {
        const questionId = key.replace('prefill_', '');
        const question = questions.find((q) => q.id === questionId);
        if (question) {
          if (question.type === 'multi_select') {
            prefilled[questionId] = value.split(',');
          } else {
            prefilled[questionId] = value;
          }
        }
      }
    }

    if (Object.keys(prefilled).length > 0) {
      setAnswers((prev) => ({ ...prev, ...prefilled }));
    }
  }, [questions, searchParams]);

  // Fetch prefill from search query
  useEffect(() => {
    if (!searchQuery || questions.length === 0) return;

    async function fetchPrefill() {
      try {
        const res = await fetch(
          `/api/wizard/prefill?q=${encodeURIComponent(searchQuery!)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === 'object') {
          setAnswers((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Prefill is optional, silently fail
      }
    }
    fetchPrefill();
  }, [searchQuery, questions]);

  const handleSelect = useCallback(
    (questionId: string, value: string, type: string) => {
      setAnswers((prev) => {
        if (type === 'multi_select') {
          const current = (prev[questionId] as string[]) || [];
          const updated = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          return { ...prev, [questionId]: updated };
        }
        return { ...prev, [questionId]: value };
      });

      // Auto-advance for single select after a brief delay
      if (type === 'single_select') {
        setTimeout(() => {
          if (currentStep < questions.length - 1) {
            setCurrentStep((s) => s + 1);
          }
        }, 250);
      }
    },
    [currentStep, questions.length],
  );

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleNext = useCallback(() => {
    if (currentStep < questions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, questions.length]);

  const handleSubmit = useCallback(async () => {
    setIsCalculating(true);
    setError(null);
    try {
      const res = await fetch('/api/wizard/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error('Calculation failed');
      const data = await res.json();
      setResult(data);

      // Update URL with result params (non-modal mode)
      if (!modal && typeof window !== 'undefined') {
        const params = new URLSearchParams();
        Object.entries(answers).forEach(([k, v]) => {
          params.set(k, Array.isArray(v) ? v.join(',') : v);
        });
        window.history.replaceState(null, '', `/calculator?${params.toString()}`);
      }
    } catch {
      setError('שגיאה בחישוב. נסו שוב.');
    } finally {
      setIsCalculating(false);
    }
  }, [answers, modal]);

  const handleRestart = useCallback(() => {
    setResult(null);
    setCurrentStep(0);
    setAnswers({});
    if (!modal && typeof window !== 'undefined') {
      window.history.replaceState(null, '', '/calculator');
    }
  }, [modal]);

  const isLastStep = currentStep === questions.length - 1;
  const currentQuestion = questions[currentStep];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const hasAnswer = currentAnswer !== undefined && (
    Array.isArray(currentAnswer) ? currentAnswer.length > 0 : currentAnswer !== ''
  );

  // Loading state
  if (isLoading) {
    return (
      <div className={modal ? 'p-6' : ''}>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">טוען שאלון...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && questions.length === 0) {
    return (
      <div className={modal ? 'p-6' : ''}>
        <div className="text-center py-16">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-primary hover:text-primary-700 font-medium text-sm"
          >
            נסו שוב
          </button>
        </div>
      </div>
    );
  }

  // Result view
  if (result) {
    return (
      <div className={modal ? 'p-4 sm:p-6' : ''}>
        <WizardResult result={result} onRestart={handleRestart} />
      </div>
    );
  }

  // Wizard steps
  return (
    <div className={modal ? 'p-4 sm:p-6' : ''}>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-2xs text-gray-400">
            שלב {currentStep + 1} מתוך {questions.length}
          </span>
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="text-2xs text-primary hover:text-primary-700 font-medium flex items-center gap-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15l-3-3m0 0l3-3m-3 3h12" />
              </svg>
              חזרה
            </button>
          )}
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-primary rounded-full h-1.5 transition-all duration-500 ease-out"
            style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      {currentQuestion && (
        <div className="min-h-[300px] flex flex-col">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-6">
            {currentQuestion.label}
          </h3>

          {/* Options grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {currentQuestion.options.map((option) => {
              const isSelected = currentQuestion.type === 'multi_select'
                ? ((currentAnswer as string[]) || []).includes(option.value)
                : currentAnswer === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => handleSelect(currentQuestion.id, option.value, currentQuestion.type)}
                  className={`
                    flex items-center justify-center text-center px-4 py-4 rounded-xl border-2
                    font-medium text-sm transition-all duration-200
                    min-h-[60px]
                    ${isSelected
                      ? 'bg-primary border-primary text-white shadow-md scale-[1.02]'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-primary hover:scale-[1.02] hover:shadow-sm'
                    }
                  `}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* Error message */}
          {error && (
            <div className="mt-4 text-sm text-red-600 text-center">{error}</div>
          )}

          {/* Navigation buttons */}
          <div className="mt-auto pt-8 flex justify-between items-center">
            <div>
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  הקודם
                </button>
              )}
            </div>
            <div>
              {currentQuestion.type === 'multi_select' && !isLastStep && (
                <button
                  onClick={handleNext}
                  disabled={!hasAnswer}
                  className={`text-sm font-bold px-6 py-2.5 rounded-xl transition-colors ${
                    hasAnswer
                      ? 'bg-primary hover:bg-primary-700 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  הבא
                </button>
              )}
              {isLastStep && (
                <button
                  onClick={handleSubmit}
                  disabled={!hasAnswer || isCalculating}
                  className={`text-sm font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 ${
                    hasAnswer && !isCalculating
                      ? 'bg-primary hover:bg-primary-700 text-white'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isCalculating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      מחשב...
                    </>
                  ) : (
                    'חשב עלות'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
