import Link from 'next/link';
import SearchBar from '@/components/SearchBar';

export default function NotFound() {
  return (
    <div className="container-page py-16 text-center">
      <div className="max-w-md mx-auto">
        {/* 404 illustration */}
        <div className="w-24 h-24 mx-auto mb-6 bg-primary-50 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          הדף לא נמצא
        </h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          הדף שחיפשתם אינו קיים או שהכתובת שגויה.
          <br />
          נסו לחפש את מה שאתם מחפשים:
        </p>

        <div className="max-w-sm mx-auto mb-8">
          <SearchBar />
        </div>

        <Link
          href="/"
          className="inline-block bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary-700 transition-colors shadow-md"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
