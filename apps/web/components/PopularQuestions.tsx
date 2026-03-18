import Link from 'next/link';

const questions = [
  { text: 'כמה עולה לבנות בית פרטי?', category: 'עלויות' },
  { text: 'איך בוחרים קבלן שלד?', category: 'קבלנים' },
  { text: 'מה התהליך לקבלת היתר בנייה?', category: 'תכנון' },
  { text: 'מה ההבדל בין תפסנות רגילה לתבניות?', category: 'שלד' },
  { text: 'כמה עולה ריצוף למ"ר?', category: 'גמרים' },
  { text: 'מה חשוב לבדוק לפני יציקת בטון?', category: 'שלד' },
  { text: 'איך מתכננים חשמל בבית חדש?', category: 'חשמל' },
  { text: 'מה עושים עם רצפה צפה?', category: 'גמרים' },
];

export default function PopularQuestions() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {questions.map((q) => (
        <Link
          key={q.text}
          href={`/search?q=${encodeURIComponent(q.text)}`}
          className="group bg-white border border-gray-200 rounded-xl p-4 hover:border-primary hover:shadow-sm transition-all duration-200"
        >
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-gray-400 group-hover:text-primary mt-0.5 shrink-0 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900 group-hover:text-primary transition-colors leading-relaxed">
                {q.text}
              </p>
              <span className="text-2xs text-gray-400 mt-1 block">{q.category}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
