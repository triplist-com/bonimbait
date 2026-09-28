import type { Metadata } from 'next';
import type { ComponentType } from 'react';

/**
 * A root-level WordPress page (e.g. /צור-קשר/) that needs custom behaviour
 * instead of the generic `pages` table renderer in app/[slug].
 */
export interface SpecialPage {
  load: () => Promise<{ default: ComponentType }>;
  metadata?: () => Promise<Metadata> | Metadata;
}

export type SpecialPageRegistry = Record<string, SpecialPage>;
