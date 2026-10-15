/**
 * Env-driven feature flags with defaults, for dark launches.
 *
 *   import { isEnabled } from '@/lib/flags';
 *   if (!isEnabled('hub')) notFound();
 *
 * Each flag reads FLAG_<NAME> (camelCase -> UPPER_SNAKE: `budgetPlanner` ->
 * FLAG_BUDGET_PLANNER). Accepted values: true/1/on/yes and false/0/off/no;
 * anything else (or unset) falls back to the default below.
 *
 * Flags are evaluated on the SERVER (env vars are read at runtime). Client
 * Components get the boolean as a prop from their Server Component parent.
 * Demo views (/platform/demo/*) render features from fixtures, so they don't
 * need a flag turned on.
 *
 * To add a flag: add one entry here. See docs/platform/FOUNDATION.md#flags.
 */

export type FlagDef = {
  /** Value when FLAG_<NAME> is unset or unparsable. */
  default: boolean;
  /** Owning squad, for whoever flips it in Vercel. */
  owner: string;
  description: string;
};

export const FLAGS = {
  // Foundation: ops switches, on by default.
  analytics: {
    default: true,
    owner: 'foundation',
    description: 'First-party analytics: POST /api/track stores events and trackServer() writes.',
  },
  aiAnswers: {
    default: true,
    owner: 'foundation',
    description: 'AI answers and the pros classifier. Off = kill switch: answers degrade to sources only.',
  },
  // Wave B dark launches, off until the owning squad ships.
  advisor: { default: false, owner: 'advisor', description: 'P1 multi-turn AI advisor on every page.' },
  hub: { default: false, owner: 'hub', description: 'P2 "הבית שלי" builder workspace.' },
  revenue: { default: false, owner: 'revenue', description: 'P3 lead scoring/routing and the pro portal stats.' },
  commandCenter: { default: false, owner: 'command', description: 'P4 owner command center in /admin.' },
  budgetPlanner: { default: false, owner: 'growth', description: 'P6 budget planner lead magnet.' },
  programmaticSeo: { default: false, owner: 'growth', description: 'P6 specialty x region landing pages.' },
  autopilot: { default: false, owner: 'autopilot', description: 'P5 content autopilot ingest.' },
} as const satisfies Record<string, FlagDef>;

export type FlagName = keyof typeof FLAGS;

type Env = Record<string, string | undefined>;

/** `budgetPlanner` -> `FLAG_BUDGET_PLANNER`. */
export function flagEnvName(name: string): string {
  return `FLAG_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
}

/** Parse an env value; undefined when it isn't a recognisable boolean. */
export function parseFlagValue(raw: string | undefined | null): boolean | undefined {
  if (raw == null) return undefined;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  return undefined;
}

export function isEnabled(name: FlagName, env: Env = process.env): boolean {
  return parseFlagValue(env[flagEnvName(name)]) ?? FLAGS[name].default;
}

/** Every flag's current value (e.g. to pass a snapshot down to a client tree). */
export function allFlags(env: Env = process.env): Record<FlagName, boolean> {
  return Object.fromEntries(
    (Object.keys(FLAGS) as FlagName[]).map((name) => [name, isEnabled(name, env)]),
  ) as Record<FlagName, boolean>;
}
