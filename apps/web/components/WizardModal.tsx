'use client';

import { useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import WizardClient from '@/app/calculator/WizardClient';

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery?: string;
}

export default function WizardModal({ isOpen, onClose, searchQuery }: WizardModalProps) {
  const router = useRouter();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="מחשבון עלויות בנייה"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal content */}
      {/* Mobile: bottom sheet (rounded top, slides up, near full screen) */}
      {/* Desktop: centered dialog */}
      <div
        className="
          relative z-10 bg-white w-full
          sm:max-w-2xl sm:mx-4 sm:rounded-2xl
          rounded-t-2xl
          max-h-[90vh] sm:max-h-[85vh]
          overflow-y-auto
          animate-slide-up
          shadow-xl
        "
      >
        {/* Header bar */}
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 rounded-t-2xl">
          <h2 className="font-bold text-gray-900 text-sm sm:text-base">
            מחשבון עלויות בנייה
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            aria-label="סגור"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mobile drag indicator */}
        <div className="sm:hidden flex justify-center pt-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Wizard content */}
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">טוען שאלון...</p>
            </div>
          }
        >
          <WizardClient modal searchQuery={searchQuery} />
        </Suspense>
      </div>
    </div>
  );
}
