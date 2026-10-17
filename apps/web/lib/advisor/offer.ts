/**
 * The sponsored partner offer under an answer: what the answer is about, for
 * the revenue squad's offer matching (lib/revenue/offers.ts matchOffers via
 * getContextualOffers). Pure and client-safe.
 *
 * The topic is free text that topicsForContext() classifies: the specialty the
 * pros classifier picked (the most precise signal: "קבלני אלומיניום" means
 * windows) plus the question the search ran on. A campaign that targets a
 * stage or a region only matches when the builder's file knows it.
 */
import type { OfferContext } from '@/lib/revenue/types';

export const ANSWER_OFFER_SLOT = 'answer';

export function answerOfferContext(input: {
  /** The standalone query retrieval ran on (the follow-up rewritten), else the question. */
  query: string;
  /** specialties.slug the pros classifier picked, when it picked one. */
  specialtySlug?: string | null;
  regionSlug?: string;
  stage?: string;
}): OfferContext & { placement: 'answer' } {
  const topic = [input.specialtySlug?.replace(/-/g, ' '), input.query]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
  return {
    topic: topic || null,
    stage: input.stage ?? null,
    region: input.regionSlug ?? null,
    placement: 'answer',
  };
}
