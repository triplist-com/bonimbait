'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';

const navItems = [
  { label: 'ראשי', href: '/' },
  { label: 'סרטונים', href: '/videos' },
  { label: 'קטגוריות', href: '/categories' },
  { label: 'אודות', href: '/about' },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 60);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  const showCompactSearch = isScrolled && pathname === '/';

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-white/80 backdrop-blur-lg shadow-sm border-b border-gray-100/50'
            : 'bg-white border-b border-gray-100'
        }`}
      >
        <div className="container-page">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 flex-shrink-0">
              <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
                <svg
                  className="w-5 h-5 text-white"
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
              <span className="text-xl font-bold text-primary">בונים בית</span>
            </Link>

            {/* Compact search in header on scroll */}
            {showCompactSearch && (
              <div className="hidden md:block flex-1 max-w-md mx-4 animate-fade-in">
                <SearchBar size="default" />
              </div>
            )}

            {/* Desktop Navigation */}
            <nav className="hidden sm:flex items-center gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'text-primary'
                      : 'text-gray-600 hover:text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Mobile menu button */}
            <button
              className="sm:hidden p-2 text-gray-600 hover:text-primary transition-colors rounded-lg hover:bg-gray-50"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label={isMenuOpen ? 'סגור תפריט' : 'פתח תפריט'}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMenuOpen ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile slide-in drawer */}
      {isMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm sm:hidden animate-fade-in"
            onClick={() => setIsMenuOpen(false)}
          />
          {/* Drawer */}
          <div id="mobile-menu" className="fixed top-16 right-0 bottom-0 z-50 w-72 bg-white shadow-xl sm:hidden animate-slide-down">
            <nav className="flex flex-col p-6 gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`py-3 px-4 rounded-lg text-base font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-primary-50 text-primary'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <SearchBar />
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
