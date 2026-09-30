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

const CLASSIFIER_MODEL = 'claude-haiku-4-5';
const SPECIALTY_TTL_MS = 10 * 60 * 1000;
const MAX_PROS = 3;

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

async function classifySpecialty(query: string, options: SpecialtyOption[]): Promise<SpecialtyOption | null> {
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
  if (response.stop_reason === 'refusal') return null;
  const picked = response.parsed_output?.specialty ?? 0;
  return options[picked - 1] ?? null;
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
    const specialty = await classifySpecialty(query, options);
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
