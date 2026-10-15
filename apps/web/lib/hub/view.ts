/**
 * HubViewData for an anonymous visitor, from what's in their localStorage
 * (lib/hub/local.ts) plus the public stage picks the server sends along.
 * Pure and client-safe (the same dashboard renders it in the browser).
 */
import { MEMBER_REGIONS } from '@/lib/constants/community';
import type { PriceBook } from '@/lib/planner/types';
import { initialEstimate } from './estimate';
import type { LocalSavedItem } from './local-saved';
import { savedHref, savedThumbnail } from './saved';
import { buildLocalSnapshot } from './snapshot';
import type { HubDraft, HubViewData, PlannerEstimate, StagePicksMap } from './types';

export interface LocalViewInput {
  draft: HubDraft;
  saved: LocalSavedItem[];
  shortlist: string[];
  checklist: string[];
  planner: PlannerEstimate | null;
}

/** `book`: the owner's current price book (the page loads it; the seeded book otherwise). */
export function buildLocalViewData(input: LocalViewInput, picks: StagePicksMap, today: string, book?: PriceBook): HubViewData {
  const { draft, saved, shortlist, checklist, planner } = input;
  const region = MEMBER_REGIONS.find((r) => r.slug === draft.regionSlug);
  return {
    mode: 'local',
    today,
    project: {
      id: null,
      title: 'הבית שלכם',
      stage: draft.stage ?? null,
      regionSlug: draft.regionSlug ?? null,
      regionName: region?.name ?? null,
      sizeM2: draft.sizeM2 ?? null,
      budgetRangeNis: draft.budgetRangeNis ?? null,
      targetMoveIn: draft.targetMoveIn ?? null,
      onboarded: true,
      mode: 'self',
    },
    checklistDone: checklist,
    estimate: initialEstimate(draft, planner, book),
    budgetVersion: null,
    budgetItems: [],
    saved: saved
      .filter((s) => s.kind !== 'business')
      .map((s) => ({
        kind: s.kind,
        ref: s.ref,
        title: s.title || s.ref,
        href: savedHref(s.kind, s.ref, s.meta),
        thumbnail: savedThumbnail(s.kind, s.ref, s.meta),
        savedAt: s.at,
      })),
    shortlist: saved
      .filter((s) => s.kind === 'business')
      .map((s) => ({
        id: s.ref,
        slug: s.meta?.slug ?? '',
        name: s.title || 'בעל מקצוע',
        specialty: s.meta?.specialty ?? null,
        logoUrl: null,
        ratingPercent: null,
        reviewCount: 0,
      })),
    contacts: [],
    documents: [],
    tasks: [],
    picks,
    file: buildLocalSnapshot(draft, saved, shortlist, planner),
  };
}
