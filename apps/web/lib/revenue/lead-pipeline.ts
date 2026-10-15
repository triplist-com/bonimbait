import 'server-only';

/**
 * The revenue step of submitLead() (lib/leads/submit.ts): before a lead is
 * stored, build and score its project file (builder leads) and decide where
 * it goes (every lead).
 *
 *   const revenue = await prepareRevenueLead({ db, type, parsed, clientFile, ... });
 *   Object.assign(payload, revenue.payload);          // project_file, project_score, routing
 *   await notifyLead(lead, { db, route: revenue.route });
 *
 * The leads trigger copies payload.project_score.score into leads.score.
 * Never throws: on any failure the lead is stored as before, unscored and
 * default-routed.
 */
import type { LeadAttribution } from '@/lib/analytics/attribution';
import type { DbClient } from '@/lib/db/client';
import type { Json, LeadType } from '@/lib/db/types';
import type { RouteOverride } from '@/lib/leads/notify';
import { buildProjectFile } from '@/lib/project-file/server';
import { toStageId } from '@/lib/project-file/sanitize';
import type { ProjectFileEnvelope } from '@/lib/project-file/types';
import { asRevenueDb } from './db';
import { defaultDecision, routingRecord, type RoutingDecision } from './routing';
import { resolveLeadRouting } from './routing-server';
import { specialtiesForTopics, topicCounts } from './topics';

/** Lead types that come from builders, so they carry a project file and a score. */
export const BUILDER_LEAD_TYPES: readonly LeadType[] = ['consultation', 'contact', 'business_contact', 'benefit', 'service_plan'];

export function isBuilderLead(type: LeadType): boolean {
  return BUILDER_LEAD_TYPES.includes(type);
}

export type RevenueLeadInput = {
  /** Service-role client. */
  db: DbClient;
  type: LeadType;
  parsed: { regionSlug: string | null; constructionStage: string | null };
  clientFile?: unknown;
  memberId: string | null;
  businessId: string | null;
  /** The lead payload built so far (kind, specialty_slug, ...). */
  payload: Record<string, Json>;
  attribution: LeadAttribution | null;
  visitor: { anonId: string | null; sessionId: string | null };
};

export type RevenueLeadResult = {
  /** Keys to add to leads.payload. */
  payload: Record<string, Json>;
  route: RouteOverride | null;
  envelope: ProjectFileEnvelope | null;
  decision: RoutingDecision;
};

/** The lead's trade, for routing: a quote's specialty, its business's specialties, its questions' topics. */
async function leadSpecialties(
  db: DbClient,
  businessId: string | null,
  payload: Record<string, Json>,
  envelope: ProjectFileEnvelope | null,
): Promise<string[]> {
  const out = new Set<string>();
  if (typeof payload.specialty_slug === 'string' && payload.specialty_slug) out.add(payload.specialty_slug.normalize('NFC'));
  if (businessId) {
    const { data } = await asRevenueDb(db).from('business_specialties').select('specialties(slug)').eq('business_id', businessId);
    for (const row of (data ?? []) as Array<{ specialties: { slug: string } | null }>) {
      if (row.specialties?.slug) out.add(row.specialties.slug);
    }
  }
  const topics = topicCounts((envelope?.file.questions ?? []).map((q) => q.q)).map((t) => t.key);
  for (const slug of specialtiesForTopics(topics)) out.add(slug);
  return Array.from(out);
}

export async function prepareRevenueLead(input: RevenueLeadInput): Promise<RevenueLeadResult> {
  const empty: RevenueLeadResult = { payload: {}, route: null, envelope: null, decision: defaultDecision() };
  try {
    const envelope = isBuilderLead(input.type)
      ? await buildProjectFile({
          clientFile: input.clientFile,
          memberId: input.memberId,
          formFacts: { stage: input.parsed.constructionStage, regionSlug: input.parsed.regionSlug },
          visitor: input.visitor,
          attribution: input.attribution,
        })
      : null;

    const specialtySlugs = await leadSpecialties(input.db, input.businessId, input.payload, envelope).catch(() => []);
    const { decision, route } = await resolveLeadRouting(input.db, {
      type: input.type,
      specialtySlugs,
      regionSlug: envelope?.file.regionSlug ?? input.parsed.regionSlug,
      stage: envelope?.file.stage ?? toStageId(input.parsed.constructionStage) ?? null,
      score: envelope?.score.score ?? null,
      businessId: input.businessId,
    });

    const payload: Record<string, Json> = { routing: routingRecord(decision) as unknown as Json };
    if (envelope) {
      payload.project_file = envelope.file as unknown as Json;
      payload.project_score = envelope.score as unknown as Json;
    }
    return { payload, route, envelope, decision };
  } catch (err) {
    console.error(`[revenue] lead enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
    return empty;
  }
}
