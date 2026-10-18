import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { rankAnswerPros, type ProRow } from '@/lib/advisor/pros-rank';
import { getPublicDb } from '@/lib/content/db';
import type { DbClient } from '@/lib/db/client';
import { listPublishedBusinesses } from '@/lib/db/businesses';
import { businessHref } from '@/lib/directory/format';
import { listingHref } from '@/lib/directory/listing';
import { checkAiBudget, recordAiUsage } from '@/lib/guard/aiBudget';
import { usageFromAnthropic } from '@/lib/guard/aiPricing';
import { loadPartnerBadges } from '@/lib/revenue/badges';
import type { ProsCta } from '@/lib/types';

/**
 * "Matching pros" CTA under an AI answer: pick the directory specialty the
 * question is about, then the best few published businesses in it, ordered by
 * the revenue squad's rankPros() (region fit, reputation, partner tier;
 * lib/advisor/pros-rank.ts).
 */

const CLASSIFIER_MODEL = 'claude-haiku-4-5';
const SPECIALTY_TTL_MS = 10 * 60 * 1000;
const MAX_PROS = 3;
/** Pros of the specialty ranked before the top 3 are picked (the biggest specialty has ~30). */
const CANDIDATE_POOL = 60;

interface SpecialtyOption {
  id: string;
  slug: string;
  name: string;
}

let specialtyCache: { at: number; rows: SpecialtyOption[] } | null = null;

/** Specialties that have at least one published business (cached per instance). */
async function listActiveSpecialties(): Promise<SpecialtyOption[]> {
  if (specialtyCache && Date.now() - specialtyCache.at < SPECIALTY_TTL_MS) return specialtyCache.rows;
  const db = getPublicDb();
  if (!db) return [];
  const [specialties, links, published] = await Promise.all([
    db.from('specialties').select('id, slug, name').order('sort_order'),
    db.from('business_specialties').select('business_id, specialty_id'),
    db.from('businesses').select('id').eq('status', 'published'),
  ]);
  if (specialties.error || links.error || published.error) {
    throw new Error(specialties.error?.message ?? links.error?.message ?? published.error?.message);
  }
  const publishedIds = new Set((published.data ?? []).map((b) => b.id));
  const active = new Set(
    (links.data ?? []).filter((l) => publishedIds.has(l.business_id)).map((l) => l.specialty_id),
  );
  const rows = (specialties.data ?? []).filter((s) => active.has(s.id));
  specialtyCache = { at: Date.now(), rows };
  return rows;
}

// Tuned on Haiku 4.5 with ~15 sample questions. Numbered options instead of
// slugs, a topic-first field and temperature 0 made the pick stable; a prompt
// that dwelt on when to answer "none" made Haiku answer it far too often.
const SYSTEM_PROMPT = `A person building a private home in Israel asked a question. Pick the professional from the numbered list who could help them with it: the one they would hire, buy from or consult about the question's topic.
Examples: choosing an architect -> architects; windows -> aluminium contractors; plaster -> plaster contractors; skeleton cost -> skeleton contractors; mortgage -> mortgage advisor.
Cost and price questions count too: pick whoever does or sells that work. When both a contractor and a consultant fit, prefer the contractor unless the question asks for advice, planning or testing.
Reply 0 only if the question is about something no listed professional handles, such as overall timelines or the general order of stages.
First write the question's main topic in a few English words in "topic", then give the number.`;

const ClassifierOutput = z.object({
  topic: z.string(),
  specialty: z.number().int().describe('number from the list, or 0 for none'),
});

async function classifySpecialty(
  query: string,
  options: SpecialtyOption[],
  isDemo: boolean,
): Promise<SpecialtyOption | null> {
  const list = options.map((o, i) => `${i + 1}. ${o.name}`).join('\n');
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const response = await client.messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 256,
    temperature: 0,
    output_config: { format: zodOutputFormat(ClassifierOutput) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Specialties:\n${list}\n\nQuestion: ${query}` }],
  });
  await recordAiUsage({ route: 'pros_classifier', model: CLASSIFIER_MODEL, usage: usageFromAnthropic(response.usage), isDemo });
  if (response.stop_reason === 'refusal') return null;
  const picked = response.parsed_output?.specialty ?? 0;
  return options[picked - 1] ?? null;
}

/** A region by slug (cached with the specialties' TTL). */
const regionCache = new Map<string, { at: number; row: { id: string; slug: string; name: string } | null }>();
async function findRegion(slug: string): Promise<{ id: string; slug: string; name: string } | null> {
  const hit = regionCache.get(slug);
  if (hit && Date.now() - hit.at < SPECIALTY_TTL_MS) return hit.row;
  const db = getPublicDb();
  if (!db) return null;
  const { data } = await db.from('regions').select('id, slug, name').eq('slug', slug).eq('is_nationwide', false).maybeSingle();
  regionCache.set(slug, { at: Date.now(), row: data ?? null });
  return data ?? null;
}

/** regions.id of the "whole country" regions (cached with the specialties' TTL). */
let nationwideCache: { at: number; ids: Set<string> } | null = null;
async function nationwideRegionIds(db: DbClient): Promise<Set<string>> {
  if (nationwideCache && Date.now() - nationwideCache.at < SPECIALTY_TTL_MS) return nationwideCache.ids;
  const { data, error } = await db.from('regions').select('id').eq('is_nationwide', true);
  if (error) throw new Error(error.message);
  nationwideCache = { at: Date.now(), ids: new Set((data ?? []).map((r) => r.id)) };
  return nationwideCache.ids;
}

/**
 * What rankPros() weighs that the listing lacks: served regions, review stats
 * and partner tiers. A failed lookup ranks without it (the directory order
 * still holds), never fails the CTA.
 */
async function rankingFacts(db: DbClient, ids: string[]) {
  const [regions, stats, badges, nationwide] = await Promise.all([
    db.from('business_regions').select('business_id, region_id').in('business_id', ids),
    db.from('business_review_stats').select('business_id, review_count, rating_percent').in('business_id', ids),
    loadPartnerBadges(db),
    nationwideRegionIds(db).catch(() => new Set<string>()),
  ]);
  if (regions.error || stats.error) console.error('[pros] ranking facts partly unavailable:', regions.error?.message ?? stats.error?.message);
  const regionsByBusiness = new Map<string, string[]>();
  for (const r of regions.data ?? []) regionsByBusiness.set(r.business_id, [...(regionsByBusiness.get(r.business_id) ?? []), r.region_id]);
  const statsByBusiness = new Map(
    (stats.data ?? []).map((s) => [
      s.business_id,
      { ratingPercent: s.rating_percent == null ? null : Number(s.rating_percent), reviewCount: Number(s.review_count) || 0 },
    ]),
  );
  return { regionsByBusiness, statsByBusiness, badges, nationwide };
}

/**
 * Specialty + up to three published pros for the question, or null when no
 * specialty fits. With `regionSlug` (the visitor's region, from their project
 * file) the candidates are the pros who work there, nationwide ones included,
 * or everyone when the region has none. rankPros() then orders them: region
 * fit, reputation, the owner's pick, then the partner-tier boost. Never
 * throws: the CTA is optional, the answer is not.
 */
export async function matchPros(query: string, opts: { isDemo?: boolean; regionSlug?: string } = {}): Promise<ProsCta | null> {
  try {
    const db = getPublicDb();
    if (!db || !process.env.ANTHROPIC_API_KEY) return null;
    // Over the daily AI budget (or AI switched off): skip the optional CTA.
    if (!(await checkAiBudget()).ok) return null;
    const options = await listActiveSpecialties();
    if (options.length === 0) return null;
    const specialty = await classifySpecialty(query, options, Boolean(opts.isDemo));
    if (!specialty) return null;

    const region = opts.regionSlug ? await findRegion(opts.regionSlug) : null;
    let { items } = region
      ? await listPublishedBusinesses(db, { specialtyId: specialty.id, regionId: region.id, pageSize: CANDIDATE_POOL })
      : await listPublishedBusinesses(db, { specialtyId: specialty.id, pageSize: CANDIDATE_POOL });
    const inRegion = Boolean(region) && items.length > 0;
    if (region && items.length === 0) ({ items } = await listPublishedBusinesses(db, { specialtyId: specialty.id, pageSize: CANDIDATE_POOL }));
    if (items.length === 0) return null;

    const facts = await rankingFacts(db, items.map((b) => b.id));
    const ranked = rankAnswerPros({
      rows: items as ProRow[],
      ...facts,
      nationwideRegionIds: facts.nationwide,
      regionId: inRegion && region ? region.id : null,
      limit: MAX_PROS,
    });
    return {
      region: inRegion && region ? { slug: region.slug, name: region.name } : null,
      specialty: {
        slug: specialty.slug,
        name: specialty.name,
        href: listingHref(inRegion && region ? { specialty: specialty.slug, region: region.slug } : { specialty: specialty.slug }),
      },
      pros: ranked.map((b) => ({
        slug: b.slug,
        name: b.name,
        tagline: b.tagline,
        city: b.city,
        logo_url: b.logo_url,
        href: businessHref(b.slug),
        badge: b.badge,
      })),
    };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`pros classifier failed (${err.status}):`, err.message);
    } else {
      console.error('pros match failed:', err);
    }
    return null;
  }
}
