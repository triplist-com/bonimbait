'use client';

import Link from 'next/link';

interface BreakdownItem {
  phase: string;
  label: string;
  min: number;
  max: number;
  percentage: number;
}

interface Source {
  video_id: string;
  title: string;
  timestamp: number;
}

interface WizardResultData {
  total_min: number;
  total_max: number;
  breakdown: BreakdownItem[];
  sources?: Source[];
}

interface WizardResultProps {
  result: WizardResultData;
  onRestart: () => void;
}

/** Format NIS amount with LTR mark for correct RTL rendering */
function formatNIS(amount: number): string {
  return `\u200E${amount.toLocaleString('he-IL')} \u20AA`;
}

/** Format a min-max range */
function formatRange(min: number, max: number): string {
  return `${formatNIS(min)} - ${formatNIS(max)}`;
}

export default function WizardResult({ result, onRestart }: WizardResultProps) {
  const calendlyUrl = process.env.NEXT_PUBLIC_CALENDLY_URL || '#';
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '';
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}`
    : 'https://wa.me/';

  const maxPhaseValue = Math.max(...result.breakdown.map((b) => b.max));

  return (
    <div className="animate-slide-up">
      {/* Hero total */}
      <div className="text-center mb-8">
        <p className="text-sm text-gray-500 mb-2">עלות בנייה משוערת</p>
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-2" dir="ltr">
          {formatRange(result.total_min, result.total_max)}
        </h2>
        <p className="text-sm text-gray-400">סה&quot;כ עלות בנייה כוללת</p>
      </div>

      {/* Breakdown table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="p-4 sm:p-6">
          <h3 className="font-bold text-gray-900 mb-4">פירוט עלויות לפי שלבי בנייה</h3>
          <div className="space-y-4">
            {result.breakdown.map((item) => (
              <div key={item.phase}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span className="text-sm text-gray-500" dir="ltr">
                    {formatRange(item.min, item.max)}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary rounded-full h-2.5 transition-all duration-700 ease-out"
                    style={{ width: `${(item.max / maxPhaseValue) * 100}%` }}
                  />
                </div>
                <p className="text-2xs text-gray-400 mt-1">
                  {item.percentage}% מסך העלות
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
        <div className="flex gap-2">
          <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-yellow-800">
            הערכה בלבד, מבוססת על ניתוח סרטונים ונתוני שוק. לא מהווה הצעת מחיר.
          </p>
        </div>
      </div>

      {/* Upsell CTA */}
      <div className="bg-gradient-to-br from-primary-50 via-white to-primary-50 rounded-2xl border border-primary-100 p-6 sm:p-8 text-center mb-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          רוצה הערכה מדויקת לפי התוכניות שלך?
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          נשמח לעזור לך עם תמחור מותאם אישית
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={calendlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            קבעו שיחת ייעוץ
          </a>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            שלחו הודעה בוואטסאפ
          </a>
        </div>
      </div>

      {/* Sources */}
      {result.sources && result.sources.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-3">מבוסס על:</h3>
          <div className="flex flex-wrap gap-2">
            {result.sources.map((source) => (
              <Link
                key={`${source.video_id}-${source.timestamp}`}
                href={`/video/${source.video_id}?t=${source.timestamp}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {source.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Restart button */}
      <div className="text-center">
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary-700 font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          חזור ושנה פרמטרים
        </button>
      </div>
    </div>
  );
}
