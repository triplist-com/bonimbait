'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Bookmark, FileText, MessageCircleQuestion, Trash2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { VideoThumb } from '@/components/ui/VideoThumb';
import { useToast } from '@/components/ui/Toast';
import { SAVED_KIND_LABELS } from '@/lib/hub/saved';
import type { HubSavedItemView, SavedKind } from '@/lib/hub/types';
import { useHubActions } from './HubActions';
import { HubSection } from './parts';

type Filter = 'all' | 'video' | 'post' | 'answer';

const FILTERS: Array<[Filter, string]> = [
  ['all', 'הכול'],
  ['video', 'סרטונים'],
  ['post', 'מאמרים'],
  ['answer', 'תשובות'],
];

function matches(kind: SavedKind, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'video') return kind === 'video' || kind === 'video_page';
  return kind === filter;
}

/** Saved videos, articles and answers (pros live in "אנשי המקצוע שלי"). */
export function SavedPanel({ saved, localNotice }: { saved: HubSavedItemView[]; localNotice?: boolean }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const items = useMemo(() => saved.filter((s) => !removed.has(`${s.kind}:${s.ref}`)), [saved, removed]);
  const visible = items.filter((s) => matches(s.kind, filter));
  const shown = showAll ? visible : visible.slice(0, 6);

  function remove(item: HubSavedItemView) {
    const key = `${item.kind}:${item.ref}`;
    setRemoved((s) => new Set(s).add(key));
    startTransition(async () => {
      const res = await actions.removeSaved(item.kind, item.ref);
      if (!res.ok) {
        setRemoved((s) => {
          const next = new Set(s);
          next.delete(key);
          return next;
        });
        toast({ title: res.message ?? 'לא הצלחנו להסיר. נסו שוב.', tone: 'error' });
      }
    });
  }

  return (
    <HubSection id="saved" icon={<Bookmark />} title="שמורים" subtitle={items.length ? `${items.length} פריטים` : undefined}>
      {items.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<Bookmark />}
          title="שמרו את מה שחשוב לכם"
          description="לחצו על ״שמירה״ בכל סרטון, מאמר או תשובה, והם יחכו לכם כאן. כך בונים ספרייה אישית לשלב שלכם."
          actions={
            <>
              <ButtonLink href="/videos/" variant="outline" size="sm" prefetch={false}>
                לסרטונים
              </ButtonLink>
              <ButtonLink href="/blog/" variant="ghost" size="sm" prefetch={false}>
                למדריכים
              </ButtonLink>
            </>
          }
        />
      ) : (
        <>
          <div role="group" aria-label="סינון שמורים" className="mb-3 flex flex-wrap gap-1.5">
            {FILTERS.map(([id, label]) => (
              <Chip key={id} size="sm" selected={filter === id} onClick={() => setFilter(id)}>
                {label}
              </Chip>
            ))}
          </div>
          <ul className="space-y-2">
            {shown.map((item) => (
              <li key={`${item.kind}:${item.ref}`} className="flex items-center gap-3 rounded-2xl border border-ink-100 p-2">
                {item.thumbnail ? (
                  <VideoThumb src={item.thumbnail} size="sm" className="w-20 shrink-0" rounded="rounded-xl" sizes="80px" />
                ) : (
                  <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-sand-100 text-sand-800">
                    {item.kind === 'answer' ? <MessageCircleQuestion className="size-5" /> : <FileText className="size-5" />}
                  </span>
                )}
                <Link href={item.href} prefetch={false} className="min-w-0 flex-1 hover:text-primary-700">
                  <span className="block text-caption font-semibold text-primary-700">{SAVED_KIND_LABELS[item.kind]}</span>
                  <span className="line-clamp-2 text-body-sm font-semibold leading-snug text-ink-900">{item.title}</span>
                </Link>
                <IconButton label={`הסרה מהשמורים: ${item.title}`} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => remove(item)} />
              </li>
            ))}
          </ul>
          {visible.length > 6 && (
            <button type="button" className="mt-2 text-body-sm font-semibold text-primary-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'פחות' : `לכל ${visible.length} השמורים`}
            </button>
          )}
          {localNotice && <p className="mt-3 text-caption text-ink-500">השמורים נשמרים במכשיר הזה. התחברו כדי לשמור אותם לתמיד.</p>}
        </>
      )}
    </HubSection>
  );
}
