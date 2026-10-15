/**
 * The demo fixture registry: one entry per squad fixture file.
 * Add yours with one line (keep the file per squad: lib/demo/fixtures/<squad>.ts).
 */
import { commandDemo } from './command';
import { foundationDemo } from './foundation';

export const DEMO_FIXTURES = {
  foundation: foundationDemo,
  command: commandDemo,
} as const;

export type DemoFixtureName = keyof typeof DEMO_FIXTURES;

export { defineDemoFixture, loadDemoFixture } from './define';
export type { DemoFixture, DemoFixtureContext, DemoFixtureData, DemoSquad } from './define';
