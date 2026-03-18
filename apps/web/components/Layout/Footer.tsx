import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-16">
      <div className="container-page py-10">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-8 items-start">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"
                  />
                </svg>
              </div>
              <span className="font-bold text-primary text-lg">בונים בית</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              מאגר ידע מקיף לבנייה פרטית בישראל.
              <br />
              סרטונים, מדריכים ותשובות מבוססות AI.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 text-sm">ניווט</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/" className="text-sm text-gray-500 hover:text-primary transition-colors">
                דף הבית
              </Link>
              <Link href="/videos" className="text-sm text-gray-500 hover:text-primary transition-colors">
                סרטונים
              </Link>
              <Link href="/categories" className="text-sm text-gray-500 hover:text-primary transition-colors">
                קטגוריות
              </Link>
              <Link href="/search" className="text-sm text-gray-500 hover:text-primary transition-colors">
                חיפוש
              </Link>
            </nav>
          </div>

          {/* Info */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-3 text-sm">מידע</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/about" className="text-sm text-gray-500 hover:text-primary transition-colors">
                אודות
              </Link>
              <Link href="/contact" className="text-sm text-gray-500 hover:text-primary transition-colors">
                צור קשר
              </Link>
              <Link href="/privacy" className="text-sm text-gray-500 hover:text-primary transition-colors">
                מדיניות פרטיות
              </Link>
              <Link href="/terms" className="text-sm text-gray-500 hover:text-primary transition-colors">
                תנאי שימוש
              </Link>
            </nav>
          </div>

          {/* AI Badge + Copyright */}
          <div className="flex flex-col items-start sm:items-end gap-4">
            <div className="flex items-center gap-1.5 bg-primary-50 text-primary text-xs font-semibold px-3 py-1.5 rounded-full">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
              Powered by AI
            </div>
            <span className="text-xs text-gray-400">
              כל הזכויות שמורות &copy; {new Date().getFullYear()} בונים בית
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
