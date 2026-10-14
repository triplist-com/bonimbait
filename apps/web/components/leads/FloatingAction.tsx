'use client';

/**
 * The site's single floating action: one round button at the bottom end
 * corner that opens a small sheet (consultation, WhatsApp, ask, call).
 * It hides over the hero, over CTA bands that already offer the same actions
 * and over the footer, so it never covers the content that matters
 * (see lib/ui/floating-action.ts).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarCheck, MessageCircleMore, Phone, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Drawer } from '@/components/ui/Dialog';
import { AI_ENTRY, aiHref, CONTACT_DETAILS } from '@/lib/nav';
import { FLOATING_CTA_HIDE_SELECTOR, scrollDirection, shouldShowFloatingAction, type ScrollDirection } from '@/lib/ui/floating-action';

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.31l-.34-.2-3.56.93.95-3.47-.22-.36A9.4 9.4 0 0 1 2.63 12C2.63 6.8 6.86 2.58 12.06 2.58c2.52 0 4.88.98 6.66 2.76a9.35 9.35 0 0 1 2.76 6.67c0 5.2-4.23 9.43-9.43 9.43m8.02-17.45A11.27 11.27 0 0 0 12.05.72C5.8.72.72 5.8.72 12.04c0 2 .52 3.94 1.51 5.66L.62 23.28l5.71-1.5a11.3 11.3 0 0 0 5.72 1.46h.01c6.24 0 11.32-5.08 11.33-11.32a11.26 11.26 0 0 0-3.32-8.01" />
    </svg>
  );
}

function Row({
  icon,
  title,
  text,
  onClick,
  href,
  external,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: string;
  text: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  tone?: 'brand' | 'whatsapp' | 'neutral';
}) {
  const cls =
    'group flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-start transition-colors hover:border-ink-200 hover:bg-ink-50';
  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-12 shrink-0 items-center justify-center rounded-xl [&_svg]:size-6',
          tone === 'brand' && 'bg-primary-600 text-white',
          tone === 'whatsapp' && 'bg-whatsapp text-ink-950',
          tone === 'neutral' && 'bg-ink-100 text-ink-800',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem] font-bold text-ink-900">{title}</span>
        <span className="block text-sm text-ink-500">{text}</span>
      </span>
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0 text-ink-400 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180" />
    </>
  );
  if (href?.startsWith('/')) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

export default function FloatingAction({
  onConsult,
  whatsappUrl,
  className,
}: {
  /** Opens the consultation modal (owned by ConsultationCTA). */
  onConsult: () => void;
  whatsappUrl: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const blockers = useRef(new Set<Element>());

  useEffect(() => {
    let lastY = window.scrollY;
    let direction: ScrollDirection = 'idle';
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const update = () =>
      setVisible(
        shouldShowFloatingAction({
          scrollY: window.scrollY,
          viewportHeight: window.innerHeight,
          blockersInView: blockers.current.size,
          direction,
        }),
      );
    const onScroll = () => {
      const next = scrollDirection(lastY, window.scrollY);
      if (next !== 'idle') {
        direction = next;
        lastY = window.scrollY;
      }
      update();
      // Back in view shortly after the visitor stops scrolling.
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        direction = 'idle';
        lastY = window.scrollY;
        update();
      }, 700);
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) blockers.current.add(e.target);
          else blockers.current.delete(e.target);
        }
        update();
      },
      { rootMargin: '0px 0px -40px 0px' },
    );
    const observeAll = () => document.querySelectorAll(FLOATING_CTA_HIDE_SELECTOR).forEach((el) => io.observe(el));
    observeAll();
    // Pages stream in: pick up blockers added after hydration.
    const mo = new MutationObserver(observeAll);
    mo.observe(document.body, { childList: true, subtree: true });
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      clearTimeout(idleTimer);
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  }, []);

  const shown = visible || open;

  return (
    <>
      <div
        className={cn(
          'fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] end-3 z-40 print:hidden sm:bottom-6 sm:end-6',
          'transition-[opacity,transform] duration-300 ease-out',
          shown ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-3 scale-90 opacity-0',
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="ייעוץ ללא עלות או הודעה ב-WhatsApp"
          aria-hidden={shown ? undefined : true}
          tabIndex={shown ? 0 : -1}
          className="group relative inline-flex size-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-brand ring-[3px] ring-white transition-transform hover:scale-105 sm:size-14 sm:ring-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
        >
          <MessageCircleMore aria-hidden="true" className="relative size-[1.375rem] sm:size-6" />
        </button>
      </div>

      <Drawer open={open} onClose={() => setOpen(false)} title="איך נוכל לעזור?" description="בחרו את הדרך הנוחה לכם. אנחנו כאן.">
        <div className="flex flex-col gap-3">
          <Row
            tone="brand"
            icon={<CalendarCheck />}
            title="פגישת ייעוץ תקציב, ללא עלות"
            text="נבין יחד איפה אתם עומדים ואיך לשמור על התקציב"
            onClick={() => {
              setOpen(false);
              onConsult();
            }}
          />
          {whatsappUrl && (
            <Row tone="whatsapp" icon={<WhatsAppGlyph />} title="שלחו הודעה ב-WhatsApp" text="נחזור אליכם בהקדם" href={whatsappUrl} external />
          )}
          <Row icon={<Sparkles />} title={AI_ENTRY.label} text="תשובה מהשטח תוך שניות" href={aiHref()} />
          <Row icon={<Phone />} title="התקשרו אלינו" text={CONTACT_DETAILS.phone} href={`tel:${CONTACT_DETAILS.phone.replace(/-/g, '')}`} />
        </div>
      </Drawer>
    </>
  );
}
