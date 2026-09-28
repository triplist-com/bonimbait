import { CALENDLY_URL } from '@/lib/content/navigation';

/**
 * PLACEHOLDER for the Leads workstream's `components/leads/ConsultationCTA`.
 *
 * Orchestrator: at merge, replace every import of this component with
 * `@/components/leads/ConsultationCTA` (same slot: posts, video pages, the
 * homepage) and delete this file. It only links to NEXT_PUBLIC_CALENDLY_URL.
 */
export default function ConsultationCTAPlaceholder({
  variant = 'card',
  source = 'content',
}: {
  variant?: 'card' | 'banner';
  /** Where the CTA is shown (UTM content), e.g. "post", "home". */
  source?: string;
}) {
  const href = `${CALENDLY_URL}${CALENDLY_URL.includes('?') ? '&' : '?'}utm_source=website&utm_medium=${encodeURIComponent(source)}&utm_campaign=consultation`;

  if (variant === 'banner') {
    return (
      <section
        aria-label="פגישת ייעוץ"
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary to-primary-500 text-white p-8 sm:p-12"
      >
        <div className="absolute -top-16 -start-16 w-56 h-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-20 -end-10 w-64 h-64 rounded-full bg-secondary/20" aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-secondary-200 font-semibold mb-2">בונים בית או משפצים?</p>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">איך בונים בית בלי חריגות בתקציב?</h2>
            <p className="text-primary-100 text-lg max-w-xl">
              קבעו פגישת ייעוץ תקציב בניה ללא עלות עם צוות בונים בית, ונעבור יחד על התכנון, העלויות והשלבים הבאים.
            </p>
          </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white text-primary-700 font-bold px-7 py-3.5 shadow-lg hover:bg-secondary-50 transition-colors"
          >
            לתיאום פגישת ייעוץ ללא עלות
          </a>
        </div>
      </section>
    );
  }

  return (
    <aside
      aria-label="פגישת ייעוץ"
      className="rounded-2xl border border-secondary-200 bg-gradient-to-br from-secondary-50 to-white p-6 sm:p-8"
    >
      <h2 className="text-xl font-bold text-gray-900 mb-2">רוצים לבנות בלי חריגות בתקציב?</h2>
      <p className="text-gray-600 mb-5 leading-relaxed">
        פגישת ייעוץ תקציב בניה ראשונית ללא עלות: נבדוק את התכנון, התקציב והצעות המחיר שלכם, ונצביע על המקומות שבהם אפשר לחסוך.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl bg-primary text-white font-semibold px-6 py-3 shadow-md hover:bg-primary-700 transition-colors"
      >
        קביעת פגישת ייעוץ חינם
      </a>
    </aside>
  );
}
