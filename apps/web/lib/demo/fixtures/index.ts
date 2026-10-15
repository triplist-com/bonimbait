/**
 * The demo fixture registry: one entry per squad fixture file.
 * Add yours with one line (keep the file per squad: lib/demo/fixtures/<squad>.ts).
 */
import { foundationDemo } from './foundation';
import { hubDemo } from './hub';

export const DEMO_FIXTURES = {
  foundation: foundationDemo,
  hub: hubDemo,
} as const;

export type DemoFixtureName = keyof typeof DEMO_FIXTURES;

export { defineDemoFixture, loadDemoFixture } from './define';
export type { DemoFixture, DemoFixtureContext, DemoFixtureData, DemoSquad } from './define';
