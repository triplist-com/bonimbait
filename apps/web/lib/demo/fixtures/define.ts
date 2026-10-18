/**
 * Typed demo fixtures. Each squad owns lib/demo/fixtures/<squad>.ts:
 *
 *   // lib/demo/fixtures/hub.ts
 *   export const hubDemo = defineDemoFixture('hub', ({ gen }) => ({
 *     builder: gen.person(),
 *     project: { place: gen.place(), stage: gen.stage(), sizeSqm: 190 },
 *     roadmap: ...,
 *   }));
 *
 *   // app/platform/demo/hub/page.tsx (Server Component)
 *   const data = loadDemoFixture(hubDemo);   // typed: DemoFixtureData<typeof hubDemo>
 *
 * Fixtures are deterministic (seeded per squad, anchored to Israel's today)
 * and memoized per (fixture, seed, day). Keep the data plain JSON (strings,
 * numbers, booleans, arrays, objects) so it can be passed to Client Components.
 */
import { createDemoGenerator, demoToday, type DemoGenerator } from '../generator';

/** Squads that may own demo fixtures (docs/platform/PROGRAM.md §4). */
export type DemoSquad =
  | 'foundation'
  | 'design'
  | 'knowledge'
  | 'autopilot'
  | 'advisor'
  | 'hub'
  | 'revenue'
  | 'command'
  | 'growth'
  | 'pitch'
  | 'bonimos';

export type DemoFixtureContext = {
  gen: DemoGenerator;
  /** YYYY-MM-DD in Israel; time series end here. */
  today: string;
  seed: string;
};

export type DemoFixture<T> = {
  readonly squad: DemoSquad;
  readonly seed: string;
  readonly build: (ctx: DemoFixtureContext) => T;
};

export type DemoFixtureData<F> = F extends DemoFixture<infer T> ? T : never;

export function defineDemoFixture<T>(
  squad: DemoSquad,
  build: (ctx: DemoFixtureContext) => T,
  opts: { seed?: string } = {},
): DemoFixture<T> {
  return { squad, seed: opts.seed ?? `bonimbait-demo/${squad}`, build };
}

const memo = new WeakMap<DemoFixture<unknown>, Map<string, unknown>>();

/** Build (or reuse) a fixture's data. Pass `today` to pin it (tests, screenshots). */
export function loadDemoFixture<T>(fixture: DemoFixture<T>, opts: { today?: string; seed?: string } = {}): T {
  const seed = opts.seed ?? fixture.seed;
  const today = opts.today ?? demoToday();
  const key = `${seed}|${today}`;
  let cache = memo.get(fixture as DemoFixture<unknown>);
  if (!cache) {
    cache = new Map();
    memo.set(fixture as DemoFixture<unknown>, cache);
  }
  if (cache.has(key)) return cache.get(key) as T;
  const data = fixture.build({ gen: createDemoGenerator(seed, { today }), today, seed });
  if (cache.size > 16) cache.clear(); // one entry per day in practice
  cache.set(key, data);
  return data;
}
