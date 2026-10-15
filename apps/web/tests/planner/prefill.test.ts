import { describe, expect, it } from 'vitest';
import {
  inputFromHubDraft,
  inputFromText,
  isCompleteInput,
  mergeInputs,
  parseHubDraft,
  parsePlannerQuery,
  plannerQuery,
} from '@/lib/planner/prefill';
import type { PlannerInput } from '@/lib/planner/types';

const full: PlannerInput = { sizeM2: 220, floors: 2, regionSlug: 'sharon', finishLevel: 'standard', extras: ['basement', 'pool'] };

describe('bb.hub.draft -> planner answers (PROGRAM.md §6)', () => {
  it('reads the §6 fields and maps size and region', () => {
    const draft = parseHubDraft(
      JSON.stringify({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220, budgetRangeNis: [2_800_000, 2_400_000], targetMoveIn: '2027-09-01' }),
    );
    expect(draft).toEqual({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220, budgetRangeNis: [2_400_000, 2_800_000], targetMoveIn: '2027-09' });
    expect(inputFromHubDraft(draft)).toEqual({ sizeM2: 220, regionSlug: 'sharon' });
  });

  it('tolerates a wrapper and drops unknown or bad values', () => {
    expect(parseHubDraft(JSON.stringify({ version: 1, draft: { regionSlug: 'south', sizeM2: '180' } }))).toEqual({ regionSlug: 'south', sizeM2: 180 });
    expect(parseHubDraft(JSON.stringify({ stage: 'roof', regionSlug: 'mars', sizeM2: -4, budgetRangeNis: [1] }))).toBeNull();
    expect(parseHubDraft('not json')).toBeNull();
    expect(parseHubDraft(null)).toBeNull();
    expect(inputFromHubDraft(null)).toEqual({});
  });
});

describe('URL answers', () => {
  it('round-trips through the query string', () => {
    const q = plannerQuery(full);
    expect(q).toBe('m2=220&floors=2&region=sharon&finish=standard&extras=basement%2Cpool');
    expect(parsePlannerQuery(new URLSearchParams(q))).toEqual(full);
    expect(parsePlannerQuery({ m2: '220', floors: '2', region: 'sharon', finish: 'standard', extras: 'basement,pool' })).toEqual(full);
  });

  it('drops what it does not know and knows when the answers are complete', () => {
    const p = parsePlannerQuery(new URLSearchParams('m2=abc&floors=9&region=nowhere&finish=gold&extras=jacuzzi,pool'));
    expect(p).toEqual({ extras: ['pool'] });
    expect(isCompleteInput(p)).toBe(false);
    expect(isCompleteInput(parsePlannerQuery(new URLSearchParams('m2=150&floors=1&region=south&finish=basic')))).toBe(true);
  });
});

describe('answers from a question (the AI answer modal)', () => {
  it('reads size, floors, region, finish and extras when clearly said', () => {
    expect(inputFromText('כמה עולה לבנות בית של 220 מ״ר בשתי קומות בשרון עם מרתף ובריכה?')).toEqual({
      sizeM2: 220,
      floors: 2,
      regionSlug: 'sharon',
      extras: ['basement', 'pool'],
    });
    expect(inputFromText('בית יוקרה חד קומתי של 180 מטר בבאר שבע')).toEqual({ sizeM2: 180, floors: 1, regionSlug: 'south', finishLevel: 'luxury' });
  });

  it('does not mistake "מיני מרכזי" for the center region', () => {
    expect(inputFromText('כמה עולה מיזוג מיני מרכזי?')).toEqual({});
    expect(inputFromText('בית במרכז')).toEqual({ regionSlug: 'center' });
  });

  it('later sources win when merging', () => {
    expect(mergeInputs({ sizeM2: 200, regionSlug: 'center' }, { regionSlug: 'south' }, { sizeM2: undefined })).toEqual({ sizeM2: 200, regionSlug: 'south' });
  });
});
