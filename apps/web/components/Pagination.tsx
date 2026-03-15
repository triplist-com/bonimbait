'use client';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Build visible page numbers
  const pages: (number | 'ellipsis')[] = [];
  const delta = 2;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <nav className="flex items-center justify-center gap-2 py-8" aria-label="pagination">
      {/* Next (RTL: right arrow goes to previous) */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-2 rounded-lg border border-gray-200 hover:bg-primary-50 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="עמוד קודם"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {pages.map((page, i) =>
        page === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`min-w-[2.5rem] h-10 rounded-lg text-sm font-medium transition-colors ${
              page === currentPage
                ? 'bg-primary text-white shadow-md'
                : 'border border-gray-200 text-gray-700 hover:bg-primary-50 hover:border-primary hover:text-primary'
            }`}
          >
            {page}
          </button>
        ),
      )}

      {/* Previous (RTL: left arrow goes to next) */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-2 rounded-lg border border-gray-200 hover:bg-primary-50 hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label="עמוד הבא"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </nav>
  );
}
