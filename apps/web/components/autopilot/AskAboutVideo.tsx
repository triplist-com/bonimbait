import Link from 'next/link';

/**
 * "Ask about this video": a plain GET form into /search/ (the AI answer runs
 * there, grounded in this video and the rest of the library) plus the
 * questions the summariser found this video answers. Works without JS.
 */
export default function AskAboutVideo({ questions }: { questions: string[] }) {
  const example = questions[0] ?? 'כמה זה עולה?';
  return (
    <section aria-labelledby="ask-video" className="mt-10 rounded-2xl border border-primary-100 bg-primary-50/50 p-5 sm:p-6">
      <h2 id="ask-video" className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
        שאלו על הסרטון
      </h2>
      <p className="mt-1 text-sm text-gray-600">קבלו תשובה מבוססת על הסרטון הזה ועל מאות סרטונים ומאמרים נוספים של בונים בית.</p>
      <form action="/search/" method="get" role="search" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="ask-video-q" className="sr-only">
          השאלה שלכם
        </label>
        <input
          id="ask-video-q"
          name="q"
          type="search"
          required
          minLength={2}
          maxLength={200}
          placeholder={`למשל: ${example}`}
          className="min-w-0 flex-1 rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
        <button
          type="submit"
          className="rounded-xl bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 focus-visible:ring-offset-2"
        >
          שאלו
        </button>
      </form>
      {questions.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="שאלות שהסרטון עונה עליהן">
          {questions.map((q) => (
            <li key={q}>
              <Link
                href={`/search/?q=${encodeURIComponent(q)}`}
                className="inline-flex items-center rounded-full border border-primary-200 bg-white px-3.5 py-1.5 text-sm text-primary-700 transition-colors hover:border-primary hover:bg-primary-50"
              >
                {q}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
