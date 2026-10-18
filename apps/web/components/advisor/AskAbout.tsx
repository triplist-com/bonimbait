import { MessageCircleQuestion } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { ChipLink } from '@/components/ui/Chip';
import { cn } from '@/lib/cn';

/**
 * "שאלו על הסרטון" / "שאלו על המאמר": a plain GET form into the advisor
 * (/ask/?q=…&video=<id> or &post=<slug>), so it works without JavaScript.
 * The advisor answers from this video or article first (its summary and more
 * of its passages), then from the rest of the library. Server-safe.
 */
export interface AskAboutProps {
  kind: 'video' | 'post';
  /** YouTube id or post slug. */
  id: string;
  /** Questions this video or article answers (chips). */
  questions?: string[];
  className?: string;
}

const DEFAULT_QUESTIONS: Record<AskAboutProps['kind'], string[]> = {
  video: ['מה הנקודות הכי חשובות בסרטון?', 'מה כדאי לבדוק בשטח לפי הסרטון?'],
  post: ['מה הנקודות הכי חשובות במאמר?', 'מה זה אומר על התקציב שלנו?'],
};

export function askAboutHref(kind: AskAboutProps['kind'], id: string, question: string): string {
  return `/ask/?q=${encodeURIComponent(question)}&${kind}=${encodeURIComponent(id)}`;
}

export default function AskAbout({ kind, id, questions, className }: AskAboutProps) {
  const chips = (questions && questions.length > 0 ? questions : DEFAULT_QUESTIONS[kind]).slice(0, 3);
  const what = kind === 'video' ? 'הסרטון' : 'המאמר';
  const inputId = `ask-about-${kind}`;
  return (
    <section aria-labelledby={`${inputId}-title`} data-floating-cta="hide" className={cn('rounded-3xl border border-primary-100 bg-primary-50/50 p-5 sm:p-6', className)}>
      <h2 id={`${inputId}-title`} className="flex items-center gap-2 text-title text-ink-900">
        <MessageCircleQuestion aria-hidden="true" className="size-5 text-primary-600" />
        שאלו על {what}
      </h2>
      <p className="mt-1 text-body-sm text-ink-600">תשובה מהשטח שמתחילה מ{what} הזה וממשיכה לכל הסרטונים והמאמרים של בונים בית.</p>
      <form action="/ask/" method="get" role="search" className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name={kind} value={id} />
        <label htmlFor={inputId} className="sr-only">
          השאלה שלכם על {what}
        </label>
        <input
          id={inputId}
          name="q"
          type="search"
          required
          minLength={2}
          maxLength={300}
          enterKeyHint="search"
          placeholder={`למשל: ${chips[0]}`}
          className="h-12 min-w-0 rounded-xl border border-ink-200 bg-white px-4 text-body text-ink-900 shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-ink-400 focus:border-primary-600 focus:ring-4 focus:ring-primary-600/15 sm:flex-1"
        />
        <button type="submit" className={buttonClasses({ size: 'lg' })}>
          שאלו
        </button>
      </form>
      {chips.length > 0 && (
        <ul aria-label={`שאלות על ${what}`} className="mt-4 flex flex-wrap gap-2">
          {chips.map((q) => (
            <li key={q}>
              <ChipLink href={askAboutHref(kind, id, q)} size="sm" prefetch={false}>
                {q}
              </ChipLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
