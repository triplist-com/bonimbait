/**
 * Viewable-impression rules for sponsored partner slots (browser only).
 *
 * A slot counts as SEEN when all of these hold:
 *   1. at least 50% of it is inside the viewport (IntersectionObserver),
 *   2. continuously for at least 1 second, with the tab visible,
 *   3. and the visitor was active (pointer, key, wheel, scroll, touch, input)
 *      within the last 60 seconds. An idle visitor's slot waits for the next
 *      activity and then counts at once if it is still in view.
 * Each slot is counted once per visitor per 30 minutes: claimImpression()
 * here (localStorage), and again on the server in POST /api/track.
 *
 * <ViewableImpression/> (components/analytics) wires this to track().
 * Without IntersectionObserver nothing is counted (never over-count).
 */

export const VIEWABILITY = {
  threshold: 0.5,
  dwellMs: 1000,
  activityWindowMs: 60_000,
  dedupeMs: 30 * 60_000,
} as const;

// ---------------------------------------------------------------------------
// Visitor activity (one listener set per page, shared by all slots)
// ---------------------------------------------------------------------------

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart', 'input'] as const;
let lastActivity: number | null = null;
let listening = false;
let lastNotified = 0;
const subscribers = new Set<() => void>();

/** Record visitor activity now (also used by tests). */
export function noteActivity(now = Date.now()): void {
  lastActivity = now;
  // pointermove fires constantly: wake waiting slots at most every 250ms.
  if (now - lastNotified < 250) return;
  lastNotified = now;
  subscribers.forEach((fn) => fn());
}

export function isVisitorActive(now = Date.now(), windowMs: number = VIEWABILITY.activityWindowMs): boolean {
  return lastActivity !== null && now - lastActivity <= windowMs;
}

function ensureActivityListeners(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const onActivity = () => noteActivity();
  for (const type of ACTIVITY_EVENTS) {
    window.addEventListener(type, onActivity, { passive: true, capture: true });
  }
}

/** Test helper: forget activity and subscribers. */
export function resetViewabilityState(): void {
  lastActivity = null;
  lastNotified = 0;
  subscribers.clear();
}

// ---------------------------------------------------------------------------
// One slot
// ---------------------------------------------------------------------------

export type ViewabilityOptions = {
  onViewable: (visibleMs: number) => void;
  threshold?: number;
  dwellMs?: number;
  activityWindowMs?: number;
};

/** Watch one element; calls onViewable at most once. Returns a cleanup function. */
export function watchViewability(el: Element, opts: ViewabilityOptions): () => void {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return () => undefined;
  const threshold = opts.threshold ?? VIEWABILITY.threshold;
  const dwellMs = opts.dwellMs ?? VIEWABILITY.dwellMs;
  const activityWindowMs = opts.activityWindowMs ?? VIEWABILITY.activityWindowMs;

  ensureActivityListeners();
  let inView = false;
  let visibleSince: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const tabVisible = () => document.visibilityState !== 'hidden';
  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const check = () => {
    if (done || visibleSince === null || !tabVisible()) return;
    const now = Date.now();
    const shown = now - visibleSince;
    if (shown < dwellMs) {
      clearTimer();
      timer = setTimeout(check, dwellMs - shown);
      return;
    }
    if (!isVisitorActive(now, activityWindowMs)) return; // wait for activity
    done = true;
    stop();
    opts.onViewable(shown);
  };

  const start = () => {
    if (visibleSince === null) visibleSince = Date.now();
    check();
  };
  const pause = () => {
    visibleSince = null;
    clearTimer();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        inView = entry.isIntersecting && entry.intersectionRatio >= threshold;
      }
      if (inView && tabVisible()) start();
      else pause();
    },
    { threshold: [0, threshold, 1] },
  );
  observer.observe(el);

  const onVisibility = () => {
    if (!tabVisible()) pause();
    else if (inView) start();
  };
  document.addEventListener('visibilitychange', onVisibility);
  subscribers.add(check);

  function stop() {
    clearTimer();
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    subscribers.delete(check);
  }
  return () => {
    done = true;
    stop();
  };
}

// ---------------------------------------------------------------------------
// Dedupe: one impression per slot per visitor per 30 minutes
// ---------------------------------------------------------------------------

const STORE_KEY = 'bb_imp';
const memorySeen = new Map<string, number>();

function readSeen(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
  } catch {
    return Object.fromEntries(memorySeen);
  }
}

/**
 * True (and remembered) if `slot` hasn't been counted in the last 30 minutes
 * on this browser; false if it has.
 */
export function claimImpression(slot: string, now = Date.now(), dedupeMs: number = VIEWABILITY.dedupeMs): boolean {
  const seen = readSeen();
  const last = seen[slot];
  if (typeof last === 'number' && now - last < dedupeMs) return false;
  const next: Record<string, number> = {};
  for (const [k, t] of Object.entries(seen)) if (typeof t === 'number' && now - t < dedupeMs) next[k] = t;
  next[slot] = now;
  memorySeen.set(slot, now);
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the in-memory copy still dedupes this page view.
  }
  return true;
}

/** Test helper. */
export function resetImpressionClaims(): void {
  memorySeen.clear();
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
