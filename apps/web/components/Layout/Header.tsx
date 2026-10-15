'use client';

/**
 * Site header, rendered from lib/nav.ts.
 *
 * Fixed (not sticky) with a same-height spacer, so condensing on scroll never
 * shifts the page (no CLS). Desktop: a dark utility bar (community + account
 * area) that slides away on scroll, then the main bar with the primary nav,
 * the ask field and the consultation CTA. Mobile: logo, an "ask" button that
 * opens a bottom sheet, and a menu button that opens the navigation sheet.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Menu, MessageCircle, Phone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AI_ENTRY, PRIMARY_NAV, SECONDARY_NAV, isNavItemActive, CONTACT_DETAILS } from '@/lib/nav';
import { COMMUNITY_STATS, WHATSAPP_COMMUNITY_PATH } from '@/lib/brand';
import { LogoLink } from '@/components/ui/Logo';
import { Sheet, Drawer } from '@/components/ui/Dialog';
import { ChipLink } from '@/components/ui/Chip';
import AskForm from '@/components/ask/AskForm';
import ConsultationCTA, { WhatsAppChatButton } from '@/components/leads/ConsultationCTA';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import { aiHref } from '@/lib/nav';
import AccountLinks from './AccountLinks';
import { NavIcon } from './NavIcon';

const whatsappStat = COMMUNITY_STATS.find((s) => s.id === 'whatsapp');

export default function Header() {
  const pathname = usePathname();
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close overlays on navigation.
  useEffect(() => {
    setMenuOpen(false);
    setAskOpen(false);
  }, [pathname]);

  const onAiPage = pathname ? pathname.startsWith(AI_ENTRY.href.replace(/\/$/, '')) : false;

  return (
    <>
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-transform duration-300 ease-out print:hidden',
          condensed && 'lg:-translate-y-9',
        )}
      >
        {/* Utility bar (desktop) */}
        <div className="hidden h-9 bg-ink-950 text-[0.8125rem] text-white/75 lg:block">
          <div className="container-wide flex h-full items-center justify-between gap-6">
            <p className="flex items-center gap-2">
              <MessageCircle aria-hidden="true" className="size-3.5 text-primary-400" />
              <span>
                {whatsappStat ? (
                  <>
                    <span className="num font-semibold text-white">{whatsappStat.value}</span> חברי קהילה בקבוצות WhatsApp אזוריות.
                  </>
                ) : (
                  'קבוצות WhatsApp אזוריות של בונים ומשפצים.'
                )}
              </span>
              <Link href={WHATSAPP_COMMUNITY_PATH} className="inline-flex items-center gap-1 font-semibold text-white hover:text-primary-300">
                הצטרפו בחינם
                <ArrowLeft aria-hidden="true" className="size-3.5 ltr:rotate-180" />
              </Link>
            </p>
            <div className="flex items-center gap-4">
              <a href={`tel:${CONTACT_DETAILS.phone.replace(/-/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone aria-hidden="true" className="size-3.5" />
                <span className="num">{CONTACT_DETAILS.phone}</span>
              </a>
              <span aria-hidden="true" className="h-3 w-px bg-white/20" />
              <AccountLinks variant="bar" />
            </div>
          </div>
        </div>

        {/* Main bar */}
        <div
          className={cn(
            'border-b transition-[height,background-color,box-shadow,border-color] duration-300 ease-out',
            condensed
              ? 'h-14 border-ink-100 bg-white/90 shadow-[0_8px_24px_-16px_rgb(35_31_32/0.35)] backdrop-blur-xl lg:h-16'
              : 'h-16 border-ink-100/70 bg-white lg:h-[4.5rem]',
          )}
        >
          <div className="container-wide flex h-full items-center gap-3 lg:gap-5">
            <LogoLink className={cn('origin-right transition-transform duration-300', condensed && 'scale-[0.92]')} />

            <nav aria-label="ניווט ראשי" className="ms-2 hidden xl:block">
              <ul className="flex items-center gap-0.5">
                {PRIMARY_NAV.map((item) => {
                  const active = isNavItemActive(pathname, item);
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative inline-flex h-10 items-center whitespace-nowrap rounded-lg px-2.5 text-[0.9375rem] font-semibold transition-colors min-[1400px]:px-3',
                          active ? 'text-ink-900' : 'text-ink-600 hover:bg-ink-100/70 hover:text-ink-900',
                          active && 'after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary-600',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              {!onAiPage && (
                <div className="hidden w-[17rem] lg:block xl:w-[14.5rem] min-[1400px]:w-[17rem]">
                  <AskForm size="md" placeholder={`${AI_ENTRY.label}…`} label={AI_ENTRY.label} />
                </div>
              )}

              <div className="hidden lg:block xl:hidden min-[1400px]:block">
                <ConsultationCTA source="header" label="ייעוץ ללא עלות" size="md" />
              </div>

              {/* Mobile: ask + menu */}
              {!onAiPage && (
                <button
                  type="button"
                  onClick={() => setAskOpen(true)}
                  aria-haspopup="dialog"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-ink-800 lg:hidden"
                >
                  <Sparkles aria-hidden="true" className="size-4 text-primary-400" />
                  {AI_ENTRY.shortLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                aria-label="פתיחת התפריט"
                className="inline-flex size-11 items-center justify-center rounded-xl text-ink-800 transition-colors hover:bg-ink-100 xl:hidden"
              >
                <Menu aria-hidden="true" className="size-6" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Reserves the expanded header height (fixed header, no layout shift). */}
      <div aria-hidden="true" className="h-16 lg:h-[6.75rem] print:hidden" />

      {/* Mobile navigation */}
      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="תפריט" hideTitle side="end" bodyClassName="!px-0 !pt-0">
        <div className="px-5 pb-2">
          <LogoLink />
        </div>
        <div className="px-5 py-4">
          <AskForm size="lg" label={AI_ENTRY.label} onSubmitted={() => setMenuOpen(false)} />
        </div>
        <nav aria-label="ניווט ראשי" className="px-3">
          <ul className="flex flex-col">
            {PRIMARY_NAV.map((item) => {
              const active = isNavItemActive(pathname, item);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[4rem] items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors',
                      active ? 'bg-primary-50' : 'hover:bg-ink-50 active:bg-ink-100',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
                        active ? 'bg-primary-600 text-white' : 'bg-ink-100 text-ink-800',
                      )}
                    >
                      <NavIcon name={item.icon} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.0625rem] font-bold text-ink-900">{item.label}</span>
                      {item.description && <span className="block truncate text-sm text-ink-500">{item.description}</span>}
                    </span>
                    <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-ink-400 ltr:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mx-5 my-4 border-t border-ink-100" />
        <nav aria-label="ניווט משני" className="px-5">
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
            {SECONDARY_NAV.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex min-h-12 items-center gap-2.5 rounded-xl px-2 text-[0.9375rem] font-medium text-ink-700 hover:bg-ink-50 hover:text-ink-900"
                >
                  <NavIcon name={item.icon} className="size-4 text-ink-400" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-5 space-y-3 px-5 pb-8">
          <AccountLinks variant="drawer" />
          <ConsultationCTA source="header-menu" label="פגישת ייעוץ תקציב ללא עלות" size="lg" fullWidth />
          <WhatsAppChatButton className="w-full" />
          <a
            href={`tel:${CONTACT_DETAILS.phone.replace(/-/g, '')}`}
            className="flex min-h-12 items-center justify-center gap-2 text-sm font-medium text-ink-600"
          >
            <Phone aria-hidden="true" className="size-4" />
            <span className="num">{CONTACT_DETAILS.phone}</span>
          </a>
        </div>
      </Sheet>

      {/* Mobile ask sheet */}
      <Drawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title={AI_ENTRY.label}
        description="תשובה מהשטח, מתוך הסרטונים, הפודקאסטים והמדריכים של בונים בית."
      >
        <AskForm size="lg" autoFocus label={AI_ENTRY.label} onSubmitted={() => setAskOpen(false)} />
        <p className="mb-3 mt-6 text-sm font-semibold text-ink-500">שאלות שבונים שואלים:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.slice(0, 6).map((q) => (
            <ChipLink key={q.text} href={aiHref(q.text)} size="sm">
              {q.text}
            </ChipLink>
          ))}
        </div>
      </Drawer>
    </>
  );
}
