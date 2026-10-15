import Link from 'next/link';
import { ArrowLeft, Mail, MapPin, Phone } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site';
import { BRAND_TAGLINE, COMMUNITY_STATS, WHATSAPP_COMMUNITY_PATH } from '@/lib/brand';
import { CONTACT_DETAILS, FOOTER_COLUMNS, LEGAL_LINKS, SOCIAL_LINKS, type NavLink } from '@/lib/nav';
import { Logo } from '@/components/ui/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { SocialIcon } from '@/components/ui/SocialIcon';

function FooterLink({ link }: { link: NavLink }) {
  const cls = 'inline-flex min-h-8 items-center text-[0.9375rem] text-white/65 transition-colors hover:text-white';
  return link.external ? (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {link.label}
    </a>
  ) : (
    <Link href={link.href} className={cls}>
      {link.label}
    </Link>
  );
}

/** Site footer: community band, link columns from lib/nav.ts, legal bar. */
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer data-floating-cta="hide" className="mt-20 bg-ink-950 text-white print:hidden">
      {/* Community band */}
      <div className="relative isolate overflow-hidden border-b border-white/10">
        <span aria-hidden="true" className="bg-blueprint-dark mask-fade-b absolute inset-0 -z-10" />
        <span aria-hidden="true" className="absolute -top-40 start-1/4 -z-10 size-[28rem] rounded-full bg-primary-600/25 blur-3xl" />
        <div className="container-page grid items-center gap-10 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-16">
          <div>
            <p className="eyebrow !text-primary-300">הקהילה של בונים בית</p>
            <h2 className="mt-3 text-headline text-white">בונים בית? אתם לא לבד.</h2>
            <p className="mt-4 max-w-lg text-body-lg text-white/70">
              משפחות בונות ומשפצות מכל הארץ משתפות ניסיון, ממליצות על בעלי מקצוע ועונות אחת לשנייה בקבוצות האזוריות.
            </p>
            <ButtonLink href={WHATSAPP_COMMUNITY_PATH} size="lg" className="mt-7" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
              הצטרפו לקהילה, בחינם
            </ButtonLink>
          </div>
          <ul className="grid grid-cols-2 gap-3" aria-label="הקהילה במספרים">
            {COMMUNITY_STATS.map((s) => {
              const external = s.href.startsWith('http');
              const inner = (
                <>
                  <span className="flex items-center gap-2 text-sm text-white/60">
                    <SocialIcon id={s.id} className="size-4 text-primary-300" />
                    {s.network}
                  </span>
                  <span className="num mt-3 block text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{s.value}</span>
                  <span className="mt-1 block text-sm text-white/60">{s.label}</span>
                </>
              );
              const cls =
                'block h-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.08]';
              return (
                <li key={s.id}>
                  {external ? (
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className={cls}>
                      {inner}
                    </a>
                  ) : (
                    <Link href={s.href} className={cls}>
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Brand + link columns */}
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-12 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:py-14">
        <div className="col-span-2 lg:col-span-1">
          <Link href="/" aria-label="בונים בית: לדף הבית" className="inline-flex text-white">
            <Logo accent className="h-9" />
          </Link>
          <p className="mt-4 max-w-xs text-[0.9375rem] leading-relaxed text-white/60">
            {BRAND_TAGLINE}. מדריכים, סרטונים, בעלי מקצוע וכלים לכל שלב בבנייה, מהמגרש ועד המפתח.
          </p>
          <ul className="mt-6 space-y-2.5 text-[0.9375rem] text-white/70">
            <li>
              <a href={`tel:${CONTACT_DETAILS.phone.replace(/-/g, '')}`} className="inline-flex items-center gap-2.5 hover:text-white">
                <Phone aria-hidden="true" className="size-4 text-primary-300" />
                <span className="num">{CONTACT_DETAILS.phone}</span>
              </a>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex items-center gap-2.5 hover:text-white">
                <Mail aria-hidden="true" className="size-4 text-primary-300" />
                {CONTACT_EMAIL}
              </a>
            </li>
            <li className="inline-flex items-center gap-2.5">
              <MapPin aria-hidden="true" className="size-4 text-primary-300" />
              {CONTACT_DETAILS.address}
            </li>
          </ul>
          <ul className="mt-6 flex items-center gap-2" aria-label="בונים בית ברשתות">
            {SOCIAL_LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={l.label}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-white/10 text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                >
                  <SocialIcon id={l.id} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3 text-sm font-bold text-white">{col.title}</h2>
            <ul className="flex flex-col gap-1">
              {col.links.map((l) => (
                <li key={l.href}>
                  <FooterLink link={l} />
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-3 py-6 text-sm text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <span className="num">{year}</span> בונים בית. כל הזכויות שמורות.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-white">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
