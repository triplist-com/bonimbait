import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { cn } from '@/lib/cn';
import { durationLabel, episodeNumber, formatDuration, formatNumber, toFiveStars } from '@/lib/format';
import { nextTrapIndex, rovingIndex } from '@/lib/a11y/focus';
import { scrollDirection, shouldShowFloatingAction } from '@/lib/ui/floating-action';
import { progressPercent, stepState } from '@/components/ui/Steps';
import { highlightTitle } from '@/components/ui/SectionHeader';
import { buttonClasses, Button } from '@/components/ui/Button';
import { initials } from '@/components/ui/Avatar';
import { RatingStars } from '@/components/ui/RatingStars';

describe('cn', () => {
  it('joins truthy classes from strings, arrays and objects', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
    expect(cn(['a', ['b', false]], { c: true, d: false }, 0)).toBe('a b c 0');
  });
});

describe('format', () => {
  it('formats durations', () => {
    expect(formatDuration(543)).toBe('9:03');
    expect(formatDuration('3725')).toBe('1:02:05');
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration('abc')).toBeNull();
  });

  it('spells durations for screen readers', () => {
    expect(durationLabel(543)).toBe('9 דקות ו-3 שניות');
    expect(durationLabel(60)).toBe('דקה');
    expect(durationLabel(3725)).toBe('שעה ו-2 דקות');
    expect(durationLabel(-5)).toBeNull();
  });

  it('normalises ratings to half stars', () => {
    expect(toFiveStars(10, 10)).toBe(5);
    expect(toFiveStars(9.6, 10)).toBe(5);
    expect(toFiveStars(7.3, 10)).toBe(3.5);
    expect(toFiveStars(4.2)).toBe(4);
    expect(toFiveStars(12, 10)).toBe(5);
    expect(toFiveStars(null)).toBe(0);
  });

  it('formats numbers and parses podcast episodes', () => {
    expect(formatNumber(10000)).toBe('10,000');
    expect(episodeNumber('פודקאסט פרק 112 – קבלנות מפתח')).toBe('112');
    expect(episodeNumber('סיור גמרים')).toBeNull();
  });
});

describe('focus helpers', () => {
  it('wraps a Tab trap at both ends', () => {
    expect(nextTrapIndex(-1, 3, false)).toBe(0);
    expect(nextTrapIndex(-1, 3, true)).toBe(2);
    expect(nextTrapIndex(2, 3, false)).toBe(0);
    expect(nextTrapIndex(0, 3, true)).toBe(2);
    expect(nextTrapIndex(1, 3, false)).toBe(2);
    expect(nextTrapIndex(0, 0, false)).toBe(-1);
  });

  it('moves roving focus with the reading direction', () => {
    expect(rovingIndex('ArrowLeft', 0, 3, 'rtl')).toBe(1);
    expect(rovingIndex('ArrowRight', 0, 3, 'rtl')).toBe(2);
    expect(rovingIndex('ArrowRight', 0, 3, 'ltr')).toBe(1);
    expect(rovingIndex('Home', 2, 3)).toBe(0);
    expect(rovingIndex('End', 0, 3)).toBe(2);
    expect(rovingIndex('Enter', 0, 3)).toBeNull();
  });
});

describe('floating action visibility (quick return)', () => {
  const base = { scrollY: 900, viewportHeight: 844, blockersInView: 0, direction: 'up' as const };
  it('stays hidden over the hero', () => {
    expect(shouldShowFloatingAction({ ...base, scrollY: 100 })).toBe(false);
    expect(shouldShowFloatingAction({ ...base, scrollY: 600 })).toBe(true);
  });
  it('shows only on scroll up: hidden while reading down and at rest', () => {
    expect(shouldShowFloatingAction({ ...base, direction: 'down' })).toBe(false);
    expect(shouldShowFloatingAction({ ...base, direction: 'rest' })).toBe(false);
    expect(shouldShowFloatingAction({ ...base, direction: 'up' })).toBe(true);
  });
  it('hides over CTA zones and the footer', () => {
    expect(shouldShowFloatingAction({ ...base, blockersInView: 1 })).toBe(false);
  });
  it('stays while its own sheet is open', () => {
    expect(shouldShowFloatingAction({ ...base, scrollY: 0, blockersInView: 2, direction: 'rest', menuOpen: true })).toBe(true);
  });
  it('ignores scroll jitter', () => {
    expect(scrollDirection(100, 104)).toBeNull();
    expect(scrollDirection(100, 130)).toBe('down');
    expect(scrollDirection(130, 100)).toBe('up');
  });
});

describe('steps and progress', () => {
  it('derives step state', () => {
    expect([0, 1, 2].map((i) => stepState(i, 1))).toEqual(['complete', 'current', 'upcoming']);
  });
  it('clamps progress', () => {
    expect(progressPercent(3, 8)).toBe(38);
    expect(progressPercent(12, 10)).toBe(100);
    expect(progressPercent(-1)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });
});

describe('ui primitives (server render)', () => {
  it('highlights a word of a section title', () => {
    const html = renderToStaticMarkup(createElement('h2', null, highlightTitle('נבחרת המומלצים', 'נבחרת')));
    expect(html).toBe('<h2><span class="text-primary-600">נבחרת</span> המומלצים</h2>');
    expect(highlightTitle('כותרת', 'אין')).toBe('כותרת');
  });

  it('renders buttons with variants, loading state and asChild links', () => {
    expect(buttonClasses({ variant: 'secondary', size: 'sm' })).toContain('bg-ink-900');
    const loading = renderToStaticMarkup(createElement(Button, { loading: true }, 'שולחים'));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('disabled=""');
    expect(loading).toContain('type="button"');
    const asChild = renderToStaticMarkup(createElement(Button, { asChild: true, variant: 'outline' }, createElement('a', { href: '/calculator/' }, 'למחשבון')));
    expect(asChild).toMatch(/^<a href="\/calculator\/" class="[^"]*border-ink-200[^"]*">למחשבון<\/a>$/);
  });

  it('labels star ratings for screen readers', () => {
    const html = renderToStaticMarkup(createElement(RatingStars, { value: 9, scale: 10, count: 12 }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="דירוג 4.5 מתוך 5, 12 חוות דעת"');
  });

  it('makes initials from the first two words', () => {
    expect(initials('תומר חן ריחאנה')).toBe('תח');
    expect(initials('  שני ')).toBe('ש');
  });
});
