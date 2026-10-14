/**
 * When the site-wide floating action (consultation / WhatsApp / ask) shows.
 *
 * It must never sit over content the visitor is reading ("quick return"):
 * - hidden over the hero, until the visitor scrolls past most of the first screen;
 * - hidden whenever an element marked `data-floating-cta="hide"` is on screen
 *   (CTA bands that already offer the same actions, forms, the footer);
 * - hidden while reading (scrolling down) and once the page is at rest;
 * - shown when the visitor scrolls up (looking for something to do), and it
 *   lingers for LINGER_MS after the last scroll before fading out.
 * Pure, so it is unit-tested.
 */

/** Elements with this attribute hide the floating action while visible. */
export const FLOATING_CTA_HIDE_SELECTOR = '[data-floating-cta="hide"]';

/** 'rest' = no scroll for LINGER_MS. */
export type ScrollDirection = 'up' | 'down' | 'rest';

export interface FloatingActionState {
  scrollY: number;
  viewportHeight: number;
  /** Number of `data-floating-cta="hide"` elements intersecting the viewport. */
  blockersInView: number;
  direction: ScrollDirection;
  /** Its own sheet is open: keep it shown. */
  menuOpen?: boolean;
}

/** Share of the first viewport to scroll past before it may appear. */
export const FLOATING_ACTION_SCROLL_RATIO = 0.6;

/** Pixels of movement that count as a scroll direction (ignores jitter). */
export const SCROLL_DIRECTION_THRESHOLD = 6;

/** How long it stays after the last upward scroll. */
export const LINGER_MS = 3500;

export function shouldShowFloatingAction({ scrollY, viewportHeight, blockersInView, direction, menuOpen }: FloatingActionState): boolean {
  if (menuOpen) return true;
  if (blockersInView > 0) return false;
  if (direction !== 'up') return false;
  if (!Number.isFinite(scrollY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;
  return scrollY > viewportHeight * FLOATING_ACTION_SCROLL_RATIO;
}

/** Direction from two scroll positions, or null inside the jitter dead zone. */
export function scrollDirection(previousY: number, currentY: number, threshold = SCROLL_DIRECTION_THRESHOLD): 'up' | 'down' | null {
  const delta = currentY - previousY;
  if (delta > threshold) return 'down';
  if (delta < -threshold) return 'up';
  return null;
}
