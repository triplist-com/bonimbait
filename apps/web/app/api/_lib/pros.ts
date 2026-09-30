import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getPublicDb } from '@/lib/content/db';
import { listPublishedBusinesses } from '@/lib/db/businesses';
import { businessHref } from '@/lib/directory/format';
import { listingHref } from '@/lib/directory/listing';
import type { ProsCta } from '@/lib/types';

/**
 * "Matching pros" CTA under an AI answer: pick the directory specialty the
 * question is about, then list a few published businesses in it.
 */

const CLASSIFIER_MODEL = 'claude-opus-5-5';
const SPECIALTY_TTL_MS = 10 * 60 * 1000;
const MAX_PROS = 3;
const NONE = 'none';

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

const SYSTEM_PROMPT = `You route questions from people building a private home in Israel to a directory of professionals.
Given a Hebrew question and a list of directory specialties, choose the one specialty whose professionals the asker would most likely want to hire or consult next about this exact topic.
Answer "${NONE}" when the question is general (timelines, overall process, legal or tax questions with no matching specialty) or no specialty is a clear fit. A wrong match is worse than none.`;

async function classifySpecialty(query: string, options: SpecialtyOption[]): Promise<string | null> {
  const slugs = options.map((o) => o.slug);
  const schema = z.object({ specialty: z.enum([NONE, ...slugs] as [string, ...string[]]) });
  const list = options.map((o) => `- ${o.slug}: ${o.name}`).join('\n');

  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  const response = await client.messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Specialties:\n${list}\n\nQuestion: ${query}` }],
  });
  if (response.stop_reason === 'refusal') return null;
  const picked = response.parsed_output?.specialty;
  return picked && picked !== NONE ? picked : null;
}

/**
 * Specialty + up to three published pros for the question, or null when no
 * specialty fits. Never throws: the CTA is optional, the answer is not.
 */
export async function matchPros(query: string): Promise<ProsCta | null> {
  try {
    const db = getPublicDb();
    if (!db || !process.env.ANTHROPIC_API_KEY) return null;
    const options = await listActiveSpecialties();
    if (options.length === 0) return null;
    const slug = await classifySpecialty(query, options);
    const specialty = options.find((o) => o.slug === slug);
    if (!specialty) return null;

    const { items } = await listPublishedBusinesses(db, { specialtyId: specialty.id, pageSize: MAX_PROS });
    if (items.length === 0) return null;
    return {
      specialty: {
        slug: specialty.slug,
        name: specialty.name,
        href: listingHref({ specialty: specialty.slug }),
      },
      pros: items.map((b) => ({
        slug: b.slug,
        name: b.name,
        tagline: b.tagline,
        city: b.city,
        logo_url: b.logo_url,
        href: businessHref(b.slug),
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
