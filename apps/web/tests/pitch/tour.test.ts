import { describe, expect, it } from 'vitest';
import type { RegistryView } from '@/lib/pitch/pillars';
import { TOUR_BEATS, TOUR_MINUTES, formatMinutes, resolveTour } from '@/lib/pitch/tour';

const ready = (...slugs: string[]): RegistryView[] => slugs.map((slug) => ({ slug, pillar: 'P1', title: slug, status: 'ready' }));
const beat = (beats: ReturnType<typeof resolveTour>, id: string) => beats.find((b) => b.id === id)!;

describe('TOUR_BEATS', () => {
  it('covers the 15 minutes with no gap or overlap', () => {
    expect(TOUR_BEATS[0].from).toBe(0);
    expect(TOUR_BEATS.at(-1)!.to).toBe(TOUR_MINUTES);
    for (let i = 1; i < TOUR_BEATS.length; i++) expect(TOUR_BEATS[i].from, TOUR_BEATS[i].id).toBe(TOUR_BEATS[i - 1].to);
    for (const b of TOUR_BEATS) expect(b.to, b.id).toBeGreaterThan(b.from);
  });

  it('follows the demo order of the pillars', () => {
    const order = TOUR_BEATS.flatMap((b) => b.pillars);
    expect(order).toEqual(['P1', 'P6', 'P2', 'P4', 'P3', 'P7', 'P5', 'F']);
  });

  it('every beat and pillar target is a page that exists, and every ready demo view has its page', async () => {
    const { existsSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { PILLARS } = await import('@/lib/pitch/pillars');
    const { DEMO_VIEWS, demoViewHref } = await import('@/lib/demo/views');
    const appDir = fileURLToPath(new URL('../../app/', import.meta.url));
    const isPage = (href: string) => {
      const path = decodeURI(href.split(/[?#]/)[0]).replace(/^\/|\/$/g, '');
      return existsSync(`${appDir}${path ? `${path}/` : ''}page.tsx`);
    };
    const hrefs = [
      ...TOUR_BEATS.flatMap((b) => b.targets.flatMap((t) => (t.kind === 'site' ? [t.href] : []))),
      ...PILLARS.flatMap((p) => p.site.map((s) => s.href)),
      ...DEMO_VIEWS.filter((v) => v.status === 'ready').map(demoViewHref),
    ];
    expect(hrefs.length).toBeGreaterThan(10);
    for (const href of hrefs) expect(isPage(href), href).toBe(true);
  });

  it('has unique ids, key lines and presenter notes for every beat', () => {
    expect(new Set(TOUR_BEATS.map((b) => b.id)).size).toBe(TOUR_BEATS.length);
    for (const b of TOUR_BEATS) {
      expect(b.lines.length, b.id).toBeGreaterThan(0);
      expect(b.notes.length, b.id).toBeGreaterThan(0);
      expect(b.targets.length, b.id).toBeGreaterThan(0);
    }
  });

  it('labels every fixture figure as sample data and never presents it as the owner\'s', () => {
    const demoFigures = TOUR_BEATS.flatMap((b) => (b.figure?.source === 'demo' ? [b.figure] : []));
    expect(demoFigures.length).toBeGreaterThan(0);
    for (const f of demoFigures) expect(f.label.length).toBeGreaterThan(0);
  });
});

describe('resolveTour', () => {
  it('opens the demo view once it is ready', () => {
    const b = beat(resolveTour(ready('advisor'), () => false), 'advisor');
    expect(b.primary).toMatchObject({ kind: 'demo', href: '/platform/demo/advisor/' });
    expect(b.secondary[0]).toMatchObject({ kind: 'site' });
  });

  it('falls back to the live site while the demo view is pending', () => {
    const b = beat(resolveTour([], () => false), 'advisor');
    expect(b.primary?.kind).toBe('site');
  });

  it('falls back to the price list for Bonim.Os until its view is ready', () => {
    const before = beat(resolveTour([], () => false), 'bonimos');
    expect(before.primary?.href).toBe('/membership-tiers/');
    const after = beat(resolveTour(ready('bonimos'), () => false), 'bonimos');
    expect(after.primary?.href).toBe('/platform/demo/bonimos/');
  });

  it('shows "soon" (no primary) when nothing is available yet', () => {
    const b = beat(resolveTour([], () => false), 'partner');
    expect(b.primary).toBeNull();
    expect(b.secondary).toEqual([]);
  });

  it('respects feature flags on site targets', () => {
    expect(beat(resolveTour([], () => false), 'command').primary).toBeNull();
    expect(beat(resolveTour([], () => true), 'command').primary).toMatchObject({ href: '/admin/', staffOnly: true });
  });

  it('links pitch anchors on the overview page', () => {
    expect(beat(resolveTour([], () => false), 'numbers').primary?.href).toBe('/platform/#roi');
  });
});

describe('formatMinutes', () => {
  it('formats fractional minutes as m:ss', () => {
    expect(formatMinutes(0)).toBe('0:00');
    expect(formatMinutes(2.5)).toBe('2:30');
    expect(formatMinutes(13.5)).toBe('13:30');
    expect(formatMinutes(15)).toBe('15:00');
  });
});
