/**
 * The Command Center on demo data: the same builders as real data, fed by the
 * deterministic fixture (lib/demo/fixtures/command.ts). Used by
 * /platform/demo/command/ and by the admin's "הצג נתוני הדגמה" toggle.
 * No DB, no auth, no paid calls. Fixture leads are fictional, so rows don't
 * link to /admin/leads/.
 */
import { loadDemoFixture } from '@/lib/demo/fixtures/define';
import { commandDemo, commandDemoInputs } from '@/lib/demo/fixtures/command';
import { buildLeadsAnalytics, type LeadsAnalytics } from './analytics';
import { buildCommandCenter } from './build';
import type { CommandCenterData, CommandInputs, PeriodDays } from './types';

export function demoInputs(periodDays: PeriodDays): CommandInputs {
  return commandDemoInputs(loadDemoFixture(commandDemo), periodDays);
}

export function demoCommandCenter(periodDays: PeriodDays): CommandCenterData {
  return buildCommandCenter(demoInputs(periodDays), { isDemo: true, leadHref: () => null });
}

export function demoLeadsAnalytics(periodDays: PeriodDays): LeadsAnalytics {
  const inputs = demoInputs(periodDays);
  return buildLeadsAnalytics({
    now: inputs.now,
    periodDays,
    leads: inputs.leads,
    expectedValues: inputs.expectedValues,
    regionNames: inputs.regionNames,
    partnerNames: Object.fromEntries(inputs.partners.map((p) => [p.id, p.name])),
  });
}

export function demoInsights(): NonNullable<CommandInputs['insights']> {
  return demoInputs(30).insights!;
}
