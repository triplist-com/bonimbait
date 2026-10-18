'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Phone, Trash2, UsersRound } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { LEAD_TYPE_LABELS } from '@/lib/leads/constants';
import { dayMonthLabel } from '@/lib/hub/format';
import type { HubContactView, HubProView } from '@/lib/hub/types';
import type { LeadType } from '@/lib/db/types';
import { useHubActions } from './HubActions';
import { HubSection } from './parts';

/** "אנשי המקצוע שלי": the shortlist and the contact history (leads the member sent). */
export function ProsPanel({ shortlist, contacts }: { shortlist: HubProView[]; contacts: HubContactView[] }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const pros = shortlist.filter((p) => !removed.has(p.id));

  function remove(pro: HubProView) {
    setRemoved((s) => new Set(s).add(pro.id));
    startTransition(async () => {
      const res = await actions.removeSaved('business', pro.id);
      if (!res.ok) {
        setRemoved((s) => {
          const next = new Set(s);
          next.delete(pro.id);
          return next;
        });
        toast({ title: res.message ?? 'לא הצלחנו להסיר. נסו שוב.', tone: 'error' });
      }
    });
  }

  return (
    <HubSection
      id="pros"
      icon={<UsersRound />}
      title="אנשי המקצוע שלי"
      subtitle={pros.length ? `${pros.length} ברשימה הקצרה` : 'הרשימה הקצרה שלכם לפני הצעות מחיר'}
    >
      {pros.length === 0 ? (
        <EmptyState
          className="py-8"
          icon={<UsersRound />}
          title="בנו רשימה קצרה"
          description="שלושה בעלי מקצוע לכל תחום, זה המספר שמאפשר להשוות הצעות באמת. לחצו ״לרשימה הקצרה״ בעמוד של בעל מקצוע."
          actions={
            <ButtonLink href="/recommended/" variant="outline" size="sm" prefetch={false}>
              לנבחרת המומלצים
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-2">
          {pros.map((pro) => (
            <li key={pro.id} className="flex items-center gap-3 rounded-2xl border border-ink-100 p-3">
              <Avatar name={pro.name} src={pro.logoUrl} size="md" shape="rounded" fit="contain" />
              <div className="min-w-0 flex-1">
                {pro.slug ? (
                  <Link href={`/business/${pro.slug}/`} prefetch={false} className="block truncate text-body-sm font-bold text-ink-900 hover:text-primary-700">
                    {pro.name}
                  </Link>
                ) : (
                  <p className="truncate text-body-sm font-bold text-ink-900">{pro.name}</p>
                )}
                <p className="truncate text-caption text-ink-600">
                  {pro.specialty}
                  {pro.ratingPercent != null && pro.reviewCount > 0 && (
                    <>
                      {pro.specialty ? ' · ' : ''}
                      <span className="num">{Math.round(pro.ratingPercent)}%</span> מ-<span className="num">{pro.reviewCount}</span> חוות דעת
                    </>
                  )}
                </p>
              </div>
              <IconButton label={`הסרה מהרשימה: ${pro.name}`} icon={<Trash2 />} size="sm" variant="ghost" onClick={() => remove(pro)} />
            </li>
          ))}
        </ul>
      )}

      {contacts.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-title-sm text-ink-900">
            <Phone aria-hidden="true" className="size-4 text-primary-600" />
            פניות ששלחתם
          </h3>
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100">
            {contacts.map((c, i) => (
              <li key={`${c.ref ?? i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 p-3 text-body-sm">
                <span className="min-w-0 text-ink-900">
                  {c.businessName && c.businessSlug ? (
                    <Link href={`/business/${c.businessSlug}/`} prefetch={false} className="font-semibold hover:text-primary-700">
                      {c.businessName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{LEAD_TYPE_LABELS[c.type as LeadType] ?? 'פנייה'}</span>
                  )}
                  {c.businessName && <span className="text-ink-600"> · {LEAD_TYPE_LABELS[c.type as LeadType] ?? 'פנייה'}</span>}
                </span>
                <span className="text-caption text-ink-500">
                  {dayMonthLabel(c.createdAt.slice(0, 10))}
                  {c.ref && (
                    <>
                      {' '}
                      · <span className="num font-mono">{c.ref}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </HubSection>
  );
}
