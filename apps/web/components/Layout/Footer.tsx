import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/site';
import { COMMUNITY_STATS, CONTACT_DETAILS, FOOTER_COLUMNS, SOCIAL_LINKS, type NavLink } from '@/lib/content/navigation';

function FooterLink({ link }: { link: NavLink }) {
  const cls = 'text-sm text-gray-400 hover:text-white transition-colors';
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

export default function Footer() {
  return (
    <footer className="bg-gray-950 text-gray-300 mt-16">
      {/* Community stats strip (live footer) */}
      <div className="border-b border-white/10">
        <div className="container-page py-8">
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {COMMUNITY_STATS.map((s) => {
              const external = s.href.startsWith('http');
              const inner = (
                <>
                  <span className="block text-xs uppercase tracking-wider text-gray-500">{s.network}</span>
                  <span dir="ltr" className="block text-2xl font-bold text-white mt-1">{s.value}</span>
                  <span className="block text-sm text-gray-400">{s.label}</span>
                </>
              );
              const cls = 'block rounded-2xl bg-white/5 hover:bg-white/10 transition-colors p-4 text-center';
              return (
                <li key={s.network}>
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

      <div className="container-page py-12">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-8">
          {/* Brand block */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <span className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"
                  />
                </svg>
              </span>
              <span className="font-bold text-white text-xl">בונים בית</span>
            </Link>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
              מרכז הידע לבניית בית: מדריכים, בעלי מקצוע וכלים לכל שלב במסע, מהמגרש ועד קבלת המפתח.
            </p>
            <ul className="mt-5 space-y-1.5 text-sm text-gray-400">
              <li>
                <a href={`tel:${CONTACT_DETAILS.phone.replace(/-/g, '')}`} className="hover:text-white" dir="ltr">
                  {CONTACT_DETAILS.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>{CONTACT_DETAILS.address}</li>
            </ul>
            <Link
              href="/הצטרפו-לקבוצות-הווטסאפ/"
              className="mt-5 inline-flex items-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 transition-colors"
            >
              הצטרפו לקהילה
            </Link>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="font-semibold text-white mb-3 text-sm">{col.title}</h2>
              <ul className="flex flex-col gap-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <FooterLink link={l} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-gray-500">
            {new Date().getFullYear()} © כל הזכויות שמורות לבונים בית
          </span>
          <ul className="flex flex-wrap items-center gap-4">
            {SOCIAL_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-white transition-colors">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
