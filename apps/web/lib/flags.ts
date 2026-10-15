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
  /**
   * Hosted migrations (supabase/migrations/) the feature reads or writes: apply
   * them before the flag is on in production (docs/platform/INTEGRATION.md).
   */
  migrations?: readonly string[];
};

/** The foundation tables every pillar records into (events, guards, lead refs). */
const FOUNDATION = [
  '20261014102000_foundation_platform_events',
  '20261014102100_foundation_guards',
  '20261014102200_foundation_lead_ref',
] as const;

/**
 * Launch defaults (integration, 2026-10-15): every pillar is ON in this build;
 * FLAG_<NAME>=false switches one off without a code change.
 */
export const FLAGS = {
  // Foundation: ops switches.
  analytics: {
    default: true,
    owner: 'foundation',
    description: 'First-party analytics: POST /api/track stores events and trackServer() writes.',
    migrations: ['20261014102000_foundation_platform_events'],
  },
  aiAnswers: {
    default: true,
    owner: 'foundation',
    description: 'AI answers and the pros classifier. Off = kill switch: answers degrade to sources only.',
    migrations: ['20261014102100_foundation_guards'],
  },
  // The pillars.
  advisor: {
    default: true,
    owner: 'advisor',
    description:
      'P1 "שאלו את בונים בית": /ask/ (multi-turn, exact moments, follow-ups, threads). Off = /ask/ hands the question to /search/; shared answers (/ask/a/<id>/) stay up.',
    migrations: [...FOUNDATION, '20261014120000_advisor_threads'],
  },
  hub: {
    default: true,
    owner: 'hub',
    description: 'P2 "הבית שלי": onboarding, the dashboard, save and shortlist buttons. Off = /my-home/ redirects to /account/.',
    migrations: [...FOUNDATION, '20261014121000_hub_core', '20261014121100_hub_storage', '20261014121200_hub_aggregates'],
  },
  revenue: {
    default: true,
    owner: 'revenue',
    description:
      'P3: sponsored partner slots and answer offers, tier badges and ordering, quote requests, portal stats, the consult queue, routing, partner screens and reports. Lead scoring and the booking sheet are always on.',
    migrations: [
      ...FOUNDATION,
      '20261014122000_revenue_leads',
      '20261014122100_revenue_partners',
      '20261014122200_revenue_routing',
      '20261014122300_revenue_metrics',
      '20261014130500_integration_regional_askers',
    ],
  },
  commandCenter: {
    default: true,
    owner: 'command',
    description: 'P4 "חדר הבקרה" at /admin/ (tiles, hot leads, unanswered questions, insights, digest). Off = the previous dashboard.',
    migrations: [...FOUNDATION, '20261014121200_hub_aggregates', '20261014122000_revenue_leads', '20261014123000_command_center'],
  },
  budgetPlanner: {
    default: true,
    owner: 'growth',
    description:
      'P6: the planner report\'s "שלחו לי את הדוח" lead capture (budget_report leads). The planner itself and its price book are always on.',
    migrations: ['20261014124000_growth_planner_price_book', '20261014124100_growth_budget_report_lead'],
  },
  autopilot: {
    default: true,
    owner: 'autopilot',
    description:
      'P5 content autopilot: the daily YouTube watch (cron) and its admin entry. Off = the cron skips; published videos stay in search and answers.',
    migrations: ['20261014103000_autopilot_knowledge_store'],
  },
  // Out of scope by decision (PROGRAM.md §3.1 P6 "Won't"): no pages behind it.
  programmaticSeo: { default: false, owner: 'growth', description: 'P6 specialty x region landing pages. Won\'t for this program: nothing reads it.' },
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
