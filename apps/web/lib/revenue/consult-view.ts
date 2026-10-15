/**
 * What the consult queue renders for one lead: a plain-JSON view built from a
 * leads row, so the same components show real leads in /admin and fixtures
 * in /platform/demo/consult-queue/.
 */
import { attributionLabelHe } from '@/lib/analytics/attribution';
import type { Json, LeadStatus } from '@/lib/db/types';
import { sanitizeProjectFile, isEmptyProjectFile } from '@/lib/project-file/sanitize';
import { scoreProjectFile } from '@/lib/project-file/score';
import type { ProjectFile, ProjectScore, ScoreBand, ScoreReason } from '@/lib/project-file/types';
import { consultStageOf, type ConsultStage } from './consult-workflow';

export type ConsultLeadView = {
  id: string;
  ref: string;
  minutesAgo: number;
  name: string;
  phone: string | null;
  email: string | null;
  stage: ConsultStage;
  status: LeadStatus;
  bookedAt: string | null;
  /** 'calendly' | 'phone' | null */
  bookingMethod: string | null;
  score: ProjectScore | null;
  file: ProjectFile;
  source: {
    /** Where the CTA sat (ConsultationCTA source). */
    cta: string | null;
    /** The page the lead was sent from. */
    page: string | null;
    /** "לחיצה על שותף: ... · 12 דק׳ לפני הפנייה" */
    attribution: string;
    /** The routing rule that decided where it went. */
    routing: string | null;
  };
  shortlist: Array<{ id: string; name: string; href: string | null }>;
  notes: string | null;
};

/** The leads columns the queue reads. */
export const CONSULT_COLUMNS =
  'id, ref, created_at, type, status, full_name, phone, email, payload, attribution, booked_at, score, source_url, notes';

export type ConsultLeadRow = {
  id: string;
  ref: string;
  created_at: string;
  status: LeadStatus;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  payload: Json;
  attribution: Json | null;
  booked_at: string | null;
  score: number | null;
  source_url: string | null;
  notes: string | null;
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const BANDS = new Set<ScoreBand>(['hot', 'warm', 'cool']);
const GROUPS = new Set(['budget', 'stage', 'completeness', 'intent']);

/** A stored payload.project_score, validated; null when missing or malformed. */
export function parseStoredScore(value: unknown): ProjectScore | null {
  const s = obj(value);
  if (typeof s.score !== 'number' || s.score < 0 || s.score > 100 || !BANDS.has(s.band as ScoreBand)) return null;
  const reasons: ScoreReason[] = (Array.isArray(s.reasons) ? s.reasons : [])
    .map(obj)
    .filter((r) => typeof r.label === 'string' && typeof r.points === 'number' && GROUPS.has(String(r.group)))
    .map((r) => ({ code: String(r.code ?? ''), group: r.group as ScoreReason['group'], label: String(r.label), points: Number(r.points) }));
  const missing = (Array.isArray(s.missing) ? s.missing : []).filter((m): m is string => typeof m === 'string');
  return { version: 1, score: Math.round(s.score), band: s.band as ScoreBand, reasons, missing };
}

export type ConsultViewContext = {
  now: Date;
  /** Shortlisted business names, by id. */
  businesses?: Map<string, { name: string; slug: string }>;
};

export function consultLeadView(row: ConsultLeadRow, ctx: ConsultViewContext): ConsultLeadView {
  const payload = obj(row.payload);
  const file = sanitizeProjectFile(payload.project_file);
  // Older or hand-made leads: score the file on the fly (no visit signal).
  const score = parseStoredScore(payload.project_score) ?? (isEmptyProjectFile(file) ? null : scoreProjectFile(file));
  const routing = obj(payload.routing);
  const booking = obj(payload.booking);
  return {
    id: row.id,
    ref: row.ref,
    minutesAgo: Math.max(0, Math.round((ctx.now.getTime() - Date.parse(row.created_at)) / 60_000)),
    name: row.full_name?.trim() || row.email || row.phone || 'ללא שם',
    phone: row.phone,
    email: row.email,
    stage: consultStageOf(row),
    status: row.status,
    bookedAt: row.booked_at,
    bookingMethod: typeof booking.method === 'string' ? booking.method : row.booked_at ? 'calendly' : null,
    score: score && row.score !== null && row.score !== score.score ? { ...score, score: row.score } : score,
    file,
    source: {
      cta: typeof payload.cta_source === 'string' ? payload.cta_source : null,
      page: row.source_url,
      attribution: attributionLabelHe(row.attribution),
      routing: typeof routing.rule_name === 'string' ? routing.rule_name : null,
    },
    shortlist: (file.shortlistBusinessIds ?? []).map((id) => {
      const b = ctx.businesses?.get(id);
      return { id, name: b?.name ?? 'בעל מקצוע', href: b ? `/business/${b.slug}/` : null };
    }),
    notes: row.notes,
  };
}
