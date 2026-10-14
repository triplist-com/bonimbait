// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  VIEWABILITY,
  claimImpression,
  noteActivity,
  resetImpressionClaims,
  resetViewabilityState,
  watchViewability,
} from '@/lib/analytics/viewability';
import { calendlyFunnelEvent, isCalendlyOrigin } from '@/lib/analytics/calendly';

/** A controllable IntersectionObserver. */
class FakeIO {
  static last: FakeIO | null = null;
  disconnected = false;
  private targets: Element[] = [];
  constructor(private readonly cb: IntersectionObserverCallback) {
    FakeIO.last = this;
  }
  observe(el: Element) {
    this.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  /** Report that `ratio` of the target is visible. */
  show(ratio: number) {
    if (this.disconnected) return;
    const entry = { isIntersecting: ratio > 0, intersectionRatio: ratio, target: this.targets[0] } as IntersectionObserverEntry;
    this.cb([entry], this as unknown as IntersectionObserver);
  }
}

function setTabVisible(visible: boolean) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
  document.dispatchEvent(new Event('visibilitychange'));
}

const T0 = Date.parse('2026-10-14T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  vi.stubGlobal('IntersectionObserver', FakeIO);
  resetViewabilityState();
  resetImpressionClaims();
  setTabVisible(true);
  FakeIO.last = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function watch() {
  const onViewable = vi.fn();
  const el = document.createElement('div');
  const stop = watchViewability(el, { onViewable });
  return { onViewable, stop, io: FakeIO.last! };
}

describe('viewable impression rule', () => {
  it('counts once >=50% has been in view for 1s while the visitor is active', () => {
    noteActivity();
    const { onViewable, io } = watch();
    io.show(0.6);
    vi.advanceTimersByTime(999);
    expect(onViewable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onViewable).toHaveBeenCalledTimes(1);
    expect(onViewable.mock.calls[0][0]).toBeGreaterThanOrEqual(1000);
    expect(io.disconnected).toBe(true);
    // Once only.
    io.show(1);
    vi.advanceTimersByTime(5000);
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it('ignores slots less than half visible', () => {
    noteActivity();
    const { onViewable, io } = watch();
    io.show(0.4);
    vi.advanceTimersByTime(10_000);
    expect(onViewable).not.toHaveBeenCalled();
  });

  it('needs 1 continuous second: scrolling away resets the clock', () => {
    noteActivity();
    const { onViewable, io } = watch();
    io.show(0.7);
    vi.advanceTimersByTime(800);
    io.show(0.2);
    vi.advanceTimersByTime(800);
    io.show(0.7);
    vi.advanceTimersByTime(900);
    expect(onViewable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it('an idle visitor (no input/scroll for 60s) is not counted until they act', () => {
    noteActivity(); // at T0
    vi.advanceTimersByTime(VIEWABILITY.activityWindowMs + 1000);
    const { onViewable, io } = watch();
    io.show(0.9);
    vi.advanceTimersByTime(5000);
    expect(onViewable).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('scroll'));
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it('a visitor who never interacted is not counted', () => {
    const { onViewable, io } = watch();
    io.show(1);
    vi.advanceTimersByTime(30_000);
    expect(onViewable).not.toHaveBeenCalled();
  });

  it('a hidden tab pauses the clock', () => {
    noteActivity();
    const { onViewable, io } = watch();
    io.show(0.8);
    vi.advanceTimersByTime(500);
    setTabVisible(false);
    vi.advanceTimersByTime(5000);
    expect(onViewable).not.toHaveBeenCalled();
    setTabVisible(true);
    noteActivity();
    vi.advanceTimersByTime(999);
    expect(onViewable).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onViewable).toHaveBeenCalledTimes(1);
  });

  it('cleanup stops watching', () => {
    noteActivity();
    const { onViewable, io, stop } = watch();
    io.show(0.8);
    stop();
    vi.advanceTimersByTime(5000);
    expect(onViewable).not.toHaveBeenCalled();
    expect(io.disconnected).toBe(true);
  });

  it('never counts without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    noteActivity();
    const onViewable = vi.fn();
    const stop = watchViewability(document.createElement('div'), { onViewable });
    vi.advanceTimersByTime(5000);
    expect(onViewable).not.toHaveBeenCalled();
    expect(stop).toBeTypeOf('function');
  });
});

describe('claimImpression (30-minute dedupe per slot)', () => {
  it('claims a slot once per 30 minutes, slots independently', () => {
    expect(claimImpression('answer-sidebar', T0)).toBe(true);
    expect(claimImpression('answer-sidebar', T0 + 60_000)).toBe(false);
    expect(claimImpression('hub-roadmap', T0 + 60_000)).toBe(true);
    expect(claimImpression('answer-sidebar', T0 + VIEWABILITY.dedupeMs + 1)).toBe(true);
  });
});

describe('<ViewableImpression/>', () => {
  it('emits partner_impression when viewable and partner_click on clicks inside', async () => {
    const sent: Array<{ name: string; props: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(...(JSON.parse(String(init.body)) as { events: Array<{ name: string; props: Record<string, unknown> }> }).events);
        return new Response(null, { status: 204 });
      }),
    );
    const { default: ViewableImpression } = await import('@/components/analytics/ViewableImpression');
    const { flush } = await import('@/lib/analytics/track');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        createElement(ViewableImpression, {
          slot: 'answer-sidebar',
          partnerId: 'partner-42',
          offerId: 'spring',
          children: createElement('a', { href: '#offer' }, 'להצעה'),
        }),
      );
    });

    noteActivity();
    act(() => FakeIO.last!.show(0.75));
    act(() => vi.advanceTimersByTime(1000));
    container.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flush();

    expect(sent.map((e) => e.name)).toEqual(['partner_impression', 'partner_click']);
    expect(sent[0].props).toMatchObject({ slot: 'answer-sidebar', partner_id: 'partner-42', offer_id: 'spring', visible_ms: 1000 });
    expect(sent[1].props).toEqual({ slot: 'answer-sidebar', partner_id: 'partner-42', offer_id: 'spring' });
    act(() => root.unmount());
  });
});

describe('Calendly booking steps', () => {
  it('maps embed messages from calendly.com only', () => {
    expect(calendlyFunnelEvent({ event: 'calendly.date_and_time_selected' })).toBe('consult_booking_started');
    expect(calendlyFunnelEvent({ event: 'calendly.event_scheduled', payload: {} })).toBe('consult_booked');
    expect(calendlyFunnelEvent({ event: 'calendly.profile_page_viewed' })).toBeNull();
    expect(calendlyFunnelEvent('calendly.event_scheduled')).toBeNull();
    expect(isCalendlyOrigin('https://calendly.com')).toBe(true);
    expect(isCalendlyOrigin('https://assets.calendly.com')).toBe(true);
    expect(isCalendlyOrigin('https://calendly.com.evil.example')).toBe(false);
    expect(isCalendlyOrigin('http://calendly.com')).toBe(false);
  });
});
