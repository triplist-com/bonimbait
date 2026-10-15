import { ArrowLeft, CalendarCheck, Coins, FolderOpen, LogIn } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { StageTrack } from './StageTrack';

const VALUE = [
  {
    icon: CalendarCheck,
    title: 'מה עושים השבוע',
    text: 'שלושה צעדים ברורים לשלב שלכם, עם הסרטון והמדריך שמסבירים כל אחד מהם.',
  },
  {
    icon: Coins,
    title: 'תקציב מול הערכה',
    text: 'הערכה ראשונית לבית שלכם, ואז כל הצעת מחיר וכל תשלום מול התכנון.',
  },
  {
    icon: FolderOpen,
    title: 'תיק פרויקט אחד',
    text: 'מסמכים, משימות ואנשי מקצוע במקום אחד, ותיק מוכן לפגישת הייעוץ.',
  },
];

/**
 * The welcome screen of "הבית שלי": before onboarding (anonymous visitors
 * with no draft, members without a project). Server-safe.
 */
export function HubIntro({ signedIn, savedCount = 0 }: { signedIn: boolean; savedCount?: number }) {
  return (
    <div className="relative isolate overflow-hidden bg-sand-50">
      <div aria-hidden="true" className="bg-blueprint mask-fade-b absolute inset-0 -z-10" />
      <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">הבית שלי · חינם</p>
          <h1 className="mt-3 text-display text-ink-900">המפה האישית שלכם, מהמגרש ועד המפתח</h1>
          <p className="mt-4 max-w-xl text-body-lg text-ink-700">
            חמש שאלות קצרות, ותקבלו מפת דרך לפי השלב שלכם: מה עושים השבוע, כמה זה צפוי לעלות ומה בודקים לפני כל שלב.
          </p>
          {savedCount > 0 && (
            <p className="mt-3 text-body-sm font-semibold text-primary-700">
              כבר שמרתם <span className="num">{savedCount}</span> פריטים. השלימו את המיפוי כדי לראות אותם לפי השלבים.
            </p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/my-home/start/" size="xl" iconEnd={<ArrowLeft className="ltr:rotate-180" />} prefetch={false}>
              בואו נתחיל: 60 שניות
            </ButtonLink>
            {!signedIn && (
              <ButtonLink href="/login/?next=/my-home/" variant="ghost" size="lg" iconStart={<LogIn />} prefetch={false}>
                כבר רשומים? התחברו
              </ButtonLink>
            )}
          </div>
          <p className="mt-3 text-caption text-ink-600">בלי הרשמה כדי להתחיל. נשמור את המפה כשתרצו.</p>
        </div>
        <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-lift sm:p-6">
          <p className="text-caption font-semibold text-ink-600">שבעת השלבים של בונים בית</p>
          <StageTrack current={null} className="mt-3" />
          <ul className="mt-6 space-y-4">
            {VALUE.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="block text-title-sm text-ink-900">{title}</span>
                  <span className="block text-body-sm text-ink-600">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
