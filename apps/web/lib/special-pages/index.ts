import type { SpecialPage, SpecialPageRegistry } from './types';
import { contentPages } from './content';
import { directoryPages } from './directory';
import { commercePages } from './commerce';
import { leadsPages } from './leads';

// Each workstream owns its own registry file so parallel work never conflicts here.
const registry: SpecialPageRegistry = {
  ...contentPages,
  ...directoryPages,
  ...commercePages,
  ...leadsPages,
};

/** Look up a special page by slug; accepts encoded or decoded Hebrew slugs. */
export function getSpecialPage(slug: string): SpecialPage | undefined {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Malformed encoding: fall back to the raw slug.
  }
  return registry[decoded.normalize('NFC')];
}

export type { SpecialPage, SpecialPageRegistry } from './types';
