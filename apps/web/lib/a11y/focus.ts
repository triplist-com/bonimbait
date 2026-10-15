/**
 * Focus helpers for overlays (Dialog, Sheet, Drawer, menus). Client-safe.
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

/** Visible, tabbable elements inside `root`, in DOM order. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

/**
 * Where Tab should land inside a focus trap.
 * `current` is the index of the focused element (-1 when focus is outside).
 * Returns the index to focus, wrapping at both ends.
 */
export function nextTrapIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

/** Keydown handler body for a Tab trap. Returns true when it moved focus. */
export function trapTab(event: KeyboardEvent | ReactKeyboardEvent, root: HTMLElement): boolean {
  if (event.key !== 'Tab') return false;
  const items = focusableWithin(root);
  if (items.length === 0) {
    event.preventDefault();
    root.focus();
    return true;
  }
  const active = document.activeElement as HTMLElement | null;
  const index = active ? items.indexOf(active) : -1;
  const atEdge = index === -1 || (event.shiftKey ? index === 0 : index === items.length - 1);
  if (!atEdge) return false; // let the browser move focus normally
  event.preventDefault();
  items[nextTrapIndex(index, items.length, event.shiftKey)]?.focus();
  return true;
}

/**
 * Arrow-key index for horizontal roving focus (tabs, segmented controls).
 * In RTL, ArrowLeft moves forward (towards the visual "next").
 */
export function rovingIndex(key: string, current: number, count: number, dir: 'rtl' | 'ltr' = 'rtl'): number | null {
  if (count <= 0) return null;
  const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
  const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward) return (current + 1) % count;
  if (key === back) return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
