import Link from 'next/link';

/** WhatsApp community CTA (links to the Leads workstream's join page). */
export default function CommunityCTA({ compact = false }: { compact?: boolean }) {
  return (
    <section
      aria-label="הצטרפות לקהילה"
      className={`rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white ${
        compact ? 'p-6' : 'p-8 sm:p-12'
      }`}
    >
      <div className="grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-md" aria-hidden="true">
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.03c-.24.68-1.42 1.3-1.95 1.35-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.93-4.66-4.11-.13-.18-1.1-1.47-1.1-2.8 0-1.33.7-1.98.95-2.25.24-.27.53-.34.71-.34l.51.01c.16.01.38-.06.6.46.23.54.77 1.87.84 2.01.07.13.11.29.02.47-.09.18-.13.29-.27.45-.13.16-.28.35-.4.47-.13.13-.27.28-.12.54.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.43.11.58-.07.16-.18.67-.78.85-1.05.18-.27.36-.22.6-.13.25.09 1.57.74 1.84.88.27.13.45.2.51.31.07.11.07.65-.17 1.33z" />
          </svg>
        </div>
        <div>
          <h2 className={`${compact ? 'text-lg' : 'text-2xl sm:text-3xl'} font-bold text-gray-900 mb-2`}>
            בונים בית? אתם לא לבד
          </h2>
          <p className="text-gray-600 leading-relaxed max-w-2xl">
            הצטרפו לקהילה של עשרות אלפי משפחות בונות ומשפצות: קבוצות WhatsApp אזוריות, המלצות על בעלי מקצוע ותשובות מאנשים שכבר עברו את זה.
          </p>
        </div>
        <Link
          href="/הצטרפו-לקבוצות-הווטסאפ/"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 text-white font-semibold px-6 py-3 shadow-md hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          הצטרפו לקבוצת WhatsApp באזורכם
        </Link>
      </div>
    </section>
  );
}
