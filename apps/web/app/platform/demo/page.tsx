import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_VIEWS, demoViewHref, type DemoView } from '@/lib/demo/views';

export const metadata: Metadata = { title: { absolute: 'הדגמות · בונים בית פלטפורמה' } };

function ViewCard({ view }: { view: DemoView }) {
  const ready = view.status === 'ready';
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600" dir="ltr">
          {view.pillar}
        </span>
        {ready ? (
          <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700">זמין</span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">בקרוב</span>
        )}
      </div>
      <h2 className="mt-4 text-lg font-bold text-gray-900">{view.title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-gray-600">{view.description}</p>
      {ready && (
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary-700">
          לצפייה בהדגמה <span aria-hidden="true">←</span>
        </span>
      )}
    </>
  );
  const base = 'flex h-full flex-col rounded-2xl border p-5 transition';
  return ready ? (
    <Link
      href={demoViewHref(view)}
      className={`${base} border-gray-200 bg-white shadow-card hover:border-primary-300 hover:shadow-card-hover focus-visible:border-primary-400`}
    >
      {body}
    </Link>
  ) : (
    <div className={`${base} border-dashed border-gray-200 bg-gray-50`}>{body}</div>
  );
}

/** Index of the registered demo views (lib/demo/views.ts). */
export default function DemoIndexPage() {
  const ready = DEMO_VIEWS.filter((v) => v.status === 'ready').length;
  return (
    <div className="container-page py-10 sm:py-14">
      <h1 className="text-3xl font-bold text-gray-900">הדגמות</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600">
        כל מסך בפלטפורמה, עם נתונים לדוגמה בלבד: בלי כניסה למערכת ובלי מידע אמיתי של בונים או לקוחות. אפשר להציג מכל מחשב או נייד.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        {ready} מתוך {DEMO_VIEWS.length} הדגמות זמינות
      </p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_VIEWS.map((view) => (
          <li key={view.slug}>
            <ViewCard view={view} />
          </li>
        ))}
      </ul>
    </div>
  );
}
