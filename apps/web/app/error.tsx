'use client';

import { useEffect } from 'react';
import { captureException } from '@/lib/monitoring';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="container-page py-16 text-center">
      <div className="max-w-md mx-auto">
        {/* Error icon */}
        <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-full flex items-center justify-center">
          <svg
            className="w-10 h-10 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          משהו השתבש
        </h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          אירעה שגיאה בלתי צפויה. אנחנו מצטערים על אי הנוחות.
          <br />
          אנא נסו שוב או חזרו לדף הבית.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="bg-primary text-white px-6 py-2.5 rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-md"
          >
            נסו שוב
          </button>
          <a
            href="/"
            className="text-primary hover:text-primary-700 font-medium transition-colors"
          >
            חזרה לדף הבית
          </a>
        </div>
      </div>
    </div>
  );
}
