'use client';

/**
 * The /ask/ page: "שאלו את בונים בית".
 *
 * - Empty: the big question box, example questions and recent conversations.
 * - Conversation: each turn (TurnView), a docked question box, "שיחה חדשה"
 *   and "השיחות שלי".
 * - URL: ?q= asks on load (or reopens the same question answered in the last
 *   30 minutes, so a reload costs nothing); ?thread=<id> reopens a
 *   conversation (the /search/ preview hands over this way); ?video= / ?post=
 *   focus the first question on that video or article. The latest question
 *   stays in ?q=, so the address is always shareable.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { History, MessageSquarePlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { chipClasses } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/lib/cn';
import { EXAMPLE_QUESTIONS } from '@/lib/home/questions';
import { whenLabel } from '@/lib/advisor/format';
import { listThreads, loadThread, type StoredThread } from '@/lib/advisor/client/storage';
import { useAdvisor } from '@/lib/advisor/client/useAdvisor';
import type { AdvisorFocus, AdvisorOrigin } from '@/lib/advisor/types';
import Composer, { type ComposerHandle } from './Composer';
import ThreadsSheet from './ThreadsSheet';
import TurnView, { type PlayingMoment } from './TurnView';

const REOPEN_WINDOW_MS = 30 * 60 * 1000;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

export interface AdvisorExperienceProps {
  advisorLabel: string;
  /** "282 סרטונים, 714 מאמרים" for the first screen. */
  libraryLine: string;
  /** "שמרו בבית שלי" under answers (the server passes isEnabled('hub')). */
  canSave?: boolean;
}

function focusFrom(params: URLSearchParams): AdvisorFocus | undefined {
  const video = params.get('video');
  if (video && YOUTUBE_ID.test(video)) return { kind: 'video', id: video };
  const post = params.get('post');
  if (post && post.length <= 200) return { kind: 'post', id: post };
  return undefined;
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

export default function AdvisorExperience({ advisorLabel, libraryLine, canSave = false }: AdvisorExperienceProps) {
  const params = useSearchParams();
  const advisor = useAdvisor();
  const { turns, busy, ask, stop, newThread, openThread, patchTurn, sharePayload, threadId } = advisor;
  const [playing, setPlaying] = useState<PlayingMoment | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [recent, setRecent] = useState<StoredThread[]>([]);
  const dock = useRef<ComposerHandle>(null);
  const started = useRef(false);

  // First load: ?thread= reopens, ?q= asks (or reopens a fresh identical answer).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setRecent(listThreads().slice(0, 4));
    const threadParam = params.get('thread');
    if (threadParam) {
      const t = loadThread(threadParam);
      if (t) {
        openThread(t);
        return;
      }
    }
    const q = params.get('q')?.replace(/\s+/g, ' ').trim();
    if (!q) return;
    const latest = listThreads()[0];
    const last = latest?.turns[latest.turns.length - 1];
    if (latest && last && last.question === q && Date.now() - Date.parse(latest.updatedAt) < REOPEN_WINDOW_MS) {
      openThread(latest);
      return;
    }
    const focus = focusFrom(params);
    const from = params.get('from');
    const origin: AdvisorOrigin = from === 'search' ? 'search' : focus ? focus.kind : 'url';
    void ask(q, { origin, focus });
    // Run once, on the first render's parameters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the latest question in the address (shareable, bookmarkable).
  const lastQuestion = turns[turns.length - 1]?.question;
  useEffect(() => {
    const url = new URL(window.location.href);
    const next = lastQuestion ? `?q=${encodeURIComponent(lastQuestion)}` : '';
    if (url.search !== next) {
      url.search = next;
      window.history.replaceState(window.history.state, '', url.toString());
    }
  }, [lastQuestion]);

  // Bring a new question to the top of the screen.
  const lastId = turns[turns.length - 1]?.id;
  const prevCount = useRef(0);
  useEffect(() => {
    if (!lastId) return;
    if (turns.length > prevCount.current && prevCount.current > 0) {
      document.getElementById(`turn-${lastId}`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
    prevCount.current = turns.length;
  }, [lastId, turns.length]);

  const submit = useCallback(
    (q: string, origin: AdvisorOrigin = 'typed') => {
      setPlaying(null);
      void ask(q, { origin });
    },
    [ask],
  );

  const startOver = useCallback(() => {
    setPlaying(null);
    newThread();
    setRecent(listThreads().slice(0, 4));
    window.scrollTo({ top: 0 });
  }, [newThread]);

  const reopen = useCallback(
    (t: StoredThread) => {
      setPlaying(null);
      openThread(t);
    },
    [openThread],
  );

  if (turns.length === 0) {
    return (
      <>
        <section aria-labelledby="ask-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="absolute inset-0 -z-10">
            <div className="bg-blueprint mask-fade-b absolute inset-x-0 top-0 h-[28rem]" />
            <div className="absolute -top-40 end-[-15%] size-[34rem] rounded-full bg-primary-200/35 blur-3xl" />
          </div>
          <div className="container-page max-w-3xl pb-16 pt-10 sm:pb-24 sm:pt-16">
            <p className="eyebrow">
              <Sparkles aria-hidden="true" className="size-4" />
              תשובה מהשטח
            </p>
            <h1 id="ask-title" className="mt-3 text-display text-ink-900">
              {advisorLabel}
            </h1>
            <p className="mt-4 max-w-2xl text-body-lg text-ink-600">
              שאלה אחת, ותקבלו תשובה מתוך {libraryLine} של בונים בית, עם הרגע המדויק בסרטון שבו זה נאמר.
            </p>
            <Composer variant="hero" onSubmit={(q) => submit(q, 'typed')} className="mt-8" label={advisorLabel} />
            <div className="mt-6">
              <p className="text-sm font-medium text-ink-500">שאלות שבונים שואלים אותנו:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <li key={q.text}>
                    <button type="button" className={chipClasses({ className: 'h-auto min-h-10 whitespace-normal py-2 text-start' })} onClick={() => submit(q.text, 'chip')}>
                      {q.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {recent.length > 0 && (
              <div className="mt-10">
                <h2 className="text-title-sm text-ink-900">השיחות האחרונות שלכם</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => reopen(t)}
                        className="flex w-full flex-col items-start gap-0.5 rounded-2xl border border-ink-100 bg-white px-4 py-3 text-start shadow-xs transition-colors hover:border-primary-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                      >
                        <span className="line-clamp-1 text-sm font-semibold text-ink-900">{t.title}</span>
                        <span className="text-caption text-ink-500">{whenLabel(t.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
        <ThreadsSheet open={threadsOpen} onClose={() => setThreadsOpen(false)} onOpen={reopen} />
      </>
    );
  }

  return (
    <>
      <div className="container-page max-w-[52rem] pb-44 pt-6 sm:pt-10">
        <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
          <h1 className="eyebrow">
            <Sparkles aria-hidden="true" className="size-4" />
            {advisorLabel}
          </h1>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <IconButton label="השיחות שלי" icon={<History />} size="sm" className="sm:hidden" onClick={() => setThreadsOpen(true)} />
            <IconButton label="שיחה חדשה" icon={<MessageSquarePlus />} size="sm" variant="outline" className="sm:hidden" onClick={startOver} />
            <Button variant="ghost" size="sm" iconStart={<History />} className="hidden sm:inline-flex" onClick={() => setThreadsOpen(true)}>
              השיחות שלי
            </Button>
            <Button variant="outline" size="sm" iconStart={<MessageSquarePlus />} className="hidden sm:inline-flex" onClick={startOver}>
              שיחה חדשה
            </Button>
          </div>
        </div>

        <div className="space-y-16">
          {turns.map((turn, i) => (
            <div key={turn.id} id={`turn-${turn.id}`} className={cn('scroll-mt-24', i > 0 && 'border-t border-ink-100 pt-12')}>
              <TurnView
                turn={turn}
                index={i + 1}
                conversationId={threadId}
                playing={playing}
                onPlay={setPlaying}
                onFollowup={(q) => submit(q, 'followup')}
                onRetry={i === turns.length - 1 ? () => submit(turn.question, turn.origin) : undefined}
                onFeedback={(v) => patchTurn(turn.id, { feedback: v })}
                onShareId={(id) => patchTurn(turn.id, { shareId: id })}
                sharePayload={turn.signature ? sharePayload(turn) : null}
                canSave={canSave}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-paper/90 pt-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="container-page max-w-[52rem]">
          <Composer ref={dock} variant="dock" placeholder="שאלו שאלת המשך…" busy={busy} onStop={stop} onSubmit={(q) => submit(q, 'typed')} label="שאלת המשך" />
        </div>
      </div>

      <ThreadsSheet open={threadsOpen} onClose={() => setThreadsOpen(false)} currentId={threadId} onOpen={reopen} />
    </>
  );
}
