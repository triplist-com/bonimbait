'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';
import AccountLinks from './AccountLinks';
import ConsultationCTA from '@/components/leads/ConsultationCTA';
import { HEADER_NAV, SECONDARY_NAV, isActivePath } from '@/lib/content/navigation';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 flex-shrink-0" aria-label="בונים בית - דף הבית">
      <span className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-sm">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"
          />
        </svg>
      </span>
      <span className="text-xl font-bold text-primary">בונים בית</span>
    </Link>
  );
}

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 60);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the drawer on navigation.
  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  // Lock page scroll and support Escape while the drawer is open.
  useEffect(() => {
    if (!isMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMenuOpen]);

  const onSearchPage = pathname?.startsWith('/search');
  const showCompactSearch = isScrolled && pathname === '/';

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled ? 'bg-white/85 backdrop-blur-lg shadow-sm border-b border-gray-100/50' : 'bg-white border-b border-gray-100'
        }`}
      >
        <div className="container-page">
          <div className="flex items-center justify-between h-16 gap-3">
            <Logo />

            {showCompactSearch ? (
              <div className="hidden lg:block flex-1 max-w-md mx-4 animate-fade-in">
                <SearchBar size="default" />
              </div>
            ) : (
              <nav className="hidden lg:flex items-center gap-5 xl:gap-6" aria-label="ניווט ראשי">
                {HEADER_NAV.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`text-sm font-medium whitespace-nowrap transition-colors ${
                        active ? 'text-primary' : 'text-gray-600 hover:text-primary'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
              {/* AI search entry: always visible */}
              {!onSearchPage && (
                <Link
                  href="/search/"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-50 text-primary px-3 py-2 text-sm font-semibold hover:bg-primary-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="hidden sm:inline">שאלו את בונים בית</span>
                  <span className="sm:hidden">חיפוש</span>
                </Link>
              )}

              <div className="hidden xl:block">
                <ConsultationCTA source="header" label="פגישת ייעוץ ללא עלות" className="!px-3.5 !py-2 !text-sm !rounded-lg whitespace-nowrap" />
              </div>

              <div className="hidden lg:block">
                <AccountLinks />
              </div>

              <button
                className="lg:hidden p-2 text-gray-600 hover:text-primary transition-colors rounded-lg hover:bg-gray-50"
                onClick={() => setIsMenuOpen((v) => !v)}
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
        </div>
      </header>

      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-fade-in" onClick={() => setIsMenuOpen(false)} />
          <div
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="תפריט"
            className="fixed top-16 start-0 bottom-0 z-50 w-80 max-w-[85vw] bg-white shadow-xl lg:hidden animate-slide-down overflow-y-auto"
          >
            <div className="p-5 border-b border-gray-100">
              <SearchBar />
            </div>
            <nav className="flex flex-col p-4 gap-1" aria-label="ניווט ראשי">
              {HEADER_NAV.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`py-3 px-4 rounded-lg text-base font-semibold transition-colors ${
                      active ? 'bg-primary-50 text-primary' : 'text-gray-800 hover:bg-gray-50'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <nav className="flex flex-col px-4 pb-4 gap-0.5 border-t border-gray-100 pt-3" aria-label="ניווט משני">
              {SECONDARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`py-2.5 px-4 rounded-lg text-sm transition-colors ${
                    isActivePath(pathname, item.href) ? 'text-primary font-medium' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="px-5 pb-6 space-y-3">
              <ConsultationCTA source="header-menu" className="w-full !text-sm" />
              <AccountLinks variant="drawer" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
