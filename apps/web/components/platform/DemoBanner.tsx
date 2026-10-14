export const DEMO_BANNER_TEXT = 'תצוגת הדגמה · נתונים לדוגמה';

/**
 * The visible "demo, sample data" strip. app/platform/demo/layout.tsx renders
 * it above every demo view, so squads never have to remember it.
 * (Lives in components/ so Tailwind scans its classes; import it from
 * '@/lib/demo/DemoBanner'.)
 */
export default function DemoBanner({ note }: { note?: string }) {
  return (
    <div role="note" className="border-b border-primary-100 bg-primary-50 text-primary-800">
      <p className="container-page flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 py-2 text-center text-sm font-semibold">
        <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary-500" />
        <span>{DEMO_BANNER_TEXT}</span>
        {note ? <span className="font-normal text-primary-700">{note}</span> : null}
      </p>
    </div>
  );
}
