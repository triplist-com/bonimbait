import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PHASES, PRICES, STEP_CONTENT, SUMMARY } from '@/lib/build3d/content';

const root = resolve(__dirname, '../..');
const stepsMd = readFileSync(resolve(root, '../../docs/build3d/STEPS.md'), 'utf8');
const ids = Array.from(stepsMd.matchAll(/^- `([a-z0-9-]+)`/gm), (m) => m[1]);
const videoIds = new Set<string>(
  (JSON.parse(readFileSync(resolve(root, 'data/videos.json'), 'utf8')).videos as Array<{ id: string }>).map((v) => v.id),
);

describe('build3d content', () => {
  it('parses a plausible step list', () => {
    expect(ids.length).toBeGreaterThan(80);
  });

  it('has content for every step id, and no extras', () => {
    expect(ids.filter((id) => !STEP_CONTENT[id])).toEqual([]);
    expect(Object.keys(STEP_CONTENT).filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('respects field limits', () => {
    for (const id of ids) {
      const c = STEP_CONTENT[id];
      expect(c.titleHe.length, `${id} title`).toBeGreaterThan(2);
      expect(c.titleHe.length, `${id} title`).toBeLessThanOrEqual(45);
      expect(c.descHe.length, `${id} desc`).toBeLessThanOrEqual(220);
      expect(c.descHe.length, `${id} desc`).toBeGreaterThan(40);
      expect(c.tipHe.length, `${id} tip`).toBeLessThanOrEqual(140);
      expect(c.tipHe.length, `${id} tip`).toBeGreaterThan(20);
      expect(c.crewHe.length, `${id} crew`).toBeGreaterThan(2);
      expect(c.searchQuery.length, `${id} query`).toBeGreaterThan(2);
      expect(c.durationDays, `${id} days`).toBeGreaterThan(0);
      expect(/[A-Za-z]{3,}/.test(`${c.titleHe}${c.descHe}${c.tipHe}${c.crewHe}`), `${id} english`).toBe(false);
    }
  });

  it('uses real videos with valid routes', () => {
    for (const id of ids) {
      for (const v of STEP_CONTENT[id].videos ?? []) {
        const m = /^\/video\/([\w-]+)\/$/.exec(v.href);
        expect(m, `${id} ${v.href}`).not.toBeNull();
        expect(videoIds.has(m![1]), `${id} ${v.href}`).toBe(true);
        expect(v.titleHe.length).toBeGreaterThan(2);
      }
    }
  });

  it('has 14 phases and sensible total duration', () => {
    expect(PHASES.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    const days = ids.reduce((s, id) => s + STEP_CONTENT[id].durationDays, 0);
    const months = days / 21.7;
    expect(months).toBeGreaterThanOrEqual(14);
    expect(months).toBeLessThanOrEqual(18);
    expect(SUMMARY.totalMonthsTypical).toBeGreaterThanOrEqual(14);
    expect(SUMMARY.totalMonthsTypical).toBeLessThanOrEqual(18);
  });

  it('has positive prices', () => {
    for (const [k, v] of Object.entries(PRICES)) expect(v, k).toBeGreaterThan(0);
  });
});
