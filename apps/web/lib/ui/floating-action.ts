/**
 * When the site-wide floating action (consultation / WhatsApp) may show.
 *
 * It must never cover content that matters:
 * - hidden over the hero, until the visitor scrolls past most of the first screen;
 * - hidden whenever an element marked `data-floating-cta="hide"` is on screen
 *   (CTA bands that already offer the same actions, forms, the footer);
 * - hidden while the visitor is scrolling down through content (it fades back
 *   in when scrolling pauses or reverses).
 * Pure, so it is unit-tested.
 */

/** Elements with this attribute hide the floating action while visible. */
export const FLOATING_CTA_HIDE_SELECTOR = '[data-floating-cta="hide"]';

export type ScrollDirection = 'up' | 'down' | 'idle';

export interface FloatingActionState {
  scrollY: number;
  viewportHeight: number;
  /** Number of `data-floating-cta="hide"` elements intersecting the viewport. */
  blockersInView: number;
  /** Current scroll motion; 'down' hides it while reading. */
  direction?: ScrollDirection;
  /** Its own menu is open: keep it shown. */
  menuOpen?: boolean;
}

/** Share of the first viewport to scroll past before it may appear. */
export const FLOATING_ACTION_SCROLL_RATIO = 0.6;

/** Pixels of movement that count as a scroll direction (ignores jitter). */
export const SCROLL_DIRECTION_THRESHOLD = 6;

export function shouldShowFloatingAction({ scrollY, viewportHeight, blockersInView, direction = 'idle', menuOpen }: FloatingActionState): boolean {
  if (menuOpen) return true;
  if (blockersInView > 0) return false;
  if (direction === 'down') return false;
  if (!Number.isFinite(scrollY) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) return false;
  return scrollY > viewportHeight * FLOATING_ACTION_SCROLL_RATIO;
}

/** Direction from two scroll positions, with a dead zone for jitter. */
export function scrollDirection(previousY: number, currentY: number, threshold = SCROLL_DIRECTION_THRESHOLD): ScrollDirection {
  const delta = currentY - previousY;
  if (delta > threshold) return 'down';
  if (delta < -threshold) return 'up';
  return 'idle';
}
