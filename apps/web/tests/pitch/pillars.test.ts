import { describe, expect, it } from 'vitest';
import { DEMO_VIEWS } from '@/lib/demo/views';
import type { FlagName } from '@/lib/flags';
import { DEFAULT_ADVISOR_NAME } from '@/lib/nav';
import {
  INTERNAL_DEMO_SLUGS,
  PILLARS,
  advisorNameIsDefault,
  demoHref,
  resolvePillars,
  type RegistryView,
} from '@/lib/pitch/pillars';

const view = (slug: string, pillar: string, status: 'ready' | 'planned' = 'ready'): RegistryView => ({
  slug,
  pillar,
  title: `view ${slug}`,
  status,
});
const flagsOff = () => false;
const flagsOn = () => true;
const byId = (pillars: ReturnType<typeof resolvePillars>, id: string) => pillars.find((p) => p.id === id)!;

describe('PILLARS', () => {
  it('follows the demo order P1 → P6 → P2 → P4 → P3 → P7 → P5 → F', () => {
    expect(PILLARS.map((p) => p.id)).toEqual(['P1', 'P6', 'P2', 'P4', 'P3', 'P7', 'P5', 'F']);
  });

  it('gives every pillar a name, a value line and a demo moment', () => {
    for (const p of PILLARS) {
      expect(p.name.length, p.id).toBeGreaterThan(2);
      expect(p.valueLine.length, p.id).toBeGreaterThan(20);
      expect(p.wow.length, p.id).toBeGreaterThan(20);
    }
  });

  it('never claims a demo slug twice', () => {
    const slugs = PILLARS.flatMap((p) => p.demoSlugs);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('shows the advisor-name suggestion only while the default name is in use', () => {
    expect(advisorNameIsDefault(DEFAULT_ADVISOR_NAME)).toBe(true);
    expect(advisorNameIsDefault('שאלו את תומר')).toBe(false);
  });
});

describe('resolvePillars: registry-driven demo links', () => {
  it('hides "פתחו הדגמה" while a view is planned', () => {
    const pillars = resolvePillars([view('advisor', 'P1', 'planned')], flagsOff);
    expect(byId(pillars, 'P1').demos).toEqual([]);
  });

  it('shows a view once it is ready, at /platform/demo/<slug>/', () => {
    const pillars = resolvePillars([view('advisor', 'P1')], flagsOff);
    expect(byId(pillars, 'P1').demos).toEqual([{ slug: 'advisor', title: 'view advisor', href: '/platform/demo/advisor/' }]);
    expect(demoHref('hub')).toBe('/platform/demo/hub/');
  });

  it('orders a pillar\'s views by preference, not by registry order', () => {
    const pillars = resolvePillars([view('pro', 'P3'), view('revenue', 'P3'), view('partner', 'P3')], flagsOff);
    expect(byId(pillars, 'P3').demos.map((d) => d.slug)).toEqual(['partner', 'revenue', 'pro']);
  });

  it('routes the consult queue to the project-file pillar (P2), wherever the registry files it', () => {
    const pillars = resolvePillars([view('consult-queue', 'P3'), view('hub', 'P2')], flagsOff);
    expect(byId(pillars, 'P2').demos.map((d) => d.slug)).toEqual(['hub', 'consult-queue']);
    expect(byId(pillars, 'P3').demos).toEqual([]);
  });

  it('picks up an unclaimed ready view by its registry pillar', () => {
    const pillars = resolvePillars([view('command-gaps', 'P4'), view('command', 'P4')], flagsOff);
    expect(byId(pillars, 'P4').demos.map((d) => d.slug)).toEqual(['command', 'command-gaps']);
  });

  it('never shows internal tooling views (the demo-data kit) on a pillar', () => {
    expect(INTERNAL_DEMO_SLUGS.has('foundation')).toBe(true);
    const pillars = resolvePillars([view('foundation', 'F')], flagsOff);
    expect(byId(pillars, 'F').demos).toEqual([]);
  });

  it('degrades to "soon" when a pillar has no ready view and no live link', () => {
    const pillars = resolvePillars([], flagsOff);
    expect(byId(pillars, 'P7').status).toBe('soon');
    expect(byId(pillars, 'P2').status).toBe('soon'); // its site link waits for the hub flag
    expect(byId(pillars, 'P1').status).toBe('live'); // the live site already answers
    expect(byId(pillars, 'F').status).toBe('live'); // in-page section
  });

  it('shows flagged site links only while their flag is on', () => {
    const off = resolvePillars([], flagsOff);
    const on = resolvePillars([], flagsOn);
    expect(byId(off, 'P4').links).toEqual([]);
    expect(byId(on, 'P4').links.map((l) => l.href)).toEqual(['/admin/command/']);
    const onlyHub = resolvePillars([], (f: FlagName) => f === 'hub');
    expect(byId(onlyHub, 'P2').links).toHaveLength(1);
    expect(byId(onlyHub, 'P4').links).toEqual([]);
  });

  it('works against the real registry: only ready, non-internal views are linked', () => {
    const pillars = resolvePillars(DEMO_VIEWS, flagsOff);
    const linked = pillars.flatMap((p) => p.demos.map((d) => d.slug));
    for (const slug of linked) {
      const entry = DEMO_VIEWS.find((v) => v.slug === slug);
      expect(entry?.status, slug).toBe('ready');
      expect(INTERNAL_DEMO_SLUGS.has(slug), slug).toBe(false);
    }
  });
});
