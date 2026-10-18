// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKLIST_KEY,
  DRAFT_KEY,
  SAVED_KEY,
  SHORTLIST_KEY,
  clearLocalHub,
  hasLocalHubData,
  normalizeLocalSaved,
  onHubStorageChange,
  readAdvisorQuestionCount,
  readChecklist,
  readDraft,
  readLocalHub,
  readPlanner,
  readShortlist,
  toggleLocalSaved,
  writeChecklist,
  writeDraft,
} from '@/lib/hub/local';

const PRO = '11111111-1111-4111-8111-111111111111';

// Node 25 ships an experimental global localStorage (methods missing without
// --localstorage-file) that shadows happy-dom's: use a plain in-memory Storage.
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => Array.from(data.keys())[i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  const store = memoryStorage();
  Object.defineProperty(window, 'localStorage', { value: store, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true });
});

describe('bb.hub.draft', () => {
  it('stores exactly the onboarding fields', () => {
    writeDraft({ stage: 'permit', regionSlug: 'sharon', sizeM2: 220, budgetRangeNis: [2_400_000, 2_800_000], targetMoveIn: '2027-09' });
    expect(JSON.parse(window.localStorage.getItem(DRAFT_KEY)!)).toEqual({
      stage: 'permit',
      regionSlug: 'sharon',
      sizeM2: 220,
      budgetRangeNis: [2_400_000, 2_800_000],
      targetMoveIn: '2027-09',
    });
    expect(readDraft().stage).toBe('permit');
  });

  it('survives junk in storage', () => {
    window.localStorage.setItem(DRAFT_KEY, '{not json');
    expect(readDraft()).toEqual({});
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ stage: 'nope', sizeM2: 220 }));
    expect(readDraft()).toEqual({ sizeM2: 220 });
  });

  it('removes the key when the draft is empty', () => {
    writeDraft({ stage: 'frame' });
    writeDraft({});
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe('saved items and bb.shortlist', () => {
  it('keeps bb.shortlist (business ids) in sync with saved pros', () => {
    toggleLocalSaved({ kind: 'business', ref: PRO, title: 'סטודיו לוי', meta: { slug: 'studio-levi' } }, true);
    expect(JSON.parse(window.localStorage.getItem(SHORTLIST_KEY)!)).toEqual([PRO]);
    expect(readShortlist()).toEqual([PRO]);
    toggleLocalSaved({ kind: 'business', ref: PRO, title: 'סטודיו לוי' }, false);
    expect(window.localStorage.getItem(SHORTLIST_KEY)).toBeNull();
  });

  it('saves content newest first without duplicates', () => {
    toggleLocalSaved({ kind: 'video', ref: 'gUrvdx_xZjM', title: 'טריילר' }, true);
    toggleLocalSaved({ kind: 'post', ref: 'bill-of-quantities', title: 'כתב כמויות' }, true);
    const items = toggleLocalSaved({ kind: 'video', ref: 'gUrvdx_xZjM', title: 'טריילר' }, true);
    expect(items.map((i) => i.ref)).toEqual(['gUrvdx_xZjM', 'bill-of-quantities']);
    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY)!).v).toBe(1);
  });

  it('drops malformed saved entries', () => {
    expect(
      normalizeLocalSaved({
        items: [
          { kind: 'video', ref: 'ok', title: 'x', at: '2026-10-01T00:00:00Z' },
          { kind: 'business', ref: 'not-a-uuid' },
          { kind: 'spam', ref: 'x' },
          { kind: 'video', ref: 'ok' },
          null,
        ],
      }).map((i) => `${i.kind}:${i.ref}`),
    ).toEqual(['video:ok']);
    expect(normalizeLocalSaved('nope')).toEqual([]);
  });
});

describe('checklist and the whole local hub', () => {
  it('keeps only known checklist ids', () => {
    writeChecklist(['permit.fees', 'permit.fees', 'made.up']);
    expect(readChecklist()).toEqual(['permit.fees']);
    expect(JSON.parse(window.localStorage.getItem(CHECKLIST_KEY)!)).toEqual({ v: 1, done: ['permit.fees'] });
  });

  it('knows when there is something to import, and clears it all', () => {
    expect(hasLocalHubData()).toBe(false);
    writeDraft({ stage: 'frame' });
    writeChecklist(['frame.rebar']);
    toggleLocalSaved({ kind: 'business', ref: PRO, title: 'x' }, true);
    expect(hasLocalHubData()).toBe(true);
    expect(readLocalHub()).toMatchObject({ draft: { stage: 'frame' }, shortlist: [PRO], checklist: ['frame.rebar'] });
    clearLocalHub();
    expect(hasLocalHubData()).toBe(false);
    for (const key of [DRAFT_KEY, SAVED_KEY, SHORTLIST_KEY, CHECKLIST_KEY]) expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('notifies same-tab listeners on change', () => {
    const cb = vi.fn();
    const off = onHubStorageChange(cb);
    writeDraft({ stage: 'frame' });
    expect(cb).toHaveBeenCalled();
    off();
    cb.mockClear();
    writeDraft({ stage: 'planning' });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('other squads\' snapshots (read-only)', () => {
  it('reads bb.planner.last and bb.advisor.recent defensively', () => {
    expect(readPlanner()).toBeNull();
    window.localStorage.setItem('bb.planner.last', JSON.stringify({ totalMin: 2_500_000, totalMax: 2_900_000, at: '2026-10-01T00:00:00Z', inputs: {} }));
    expect(readPlanner()?.totalMax).toBe(2_900_000);
    window.localStorage.setItem('bb.advisor.recent', JSON.stringify([{ q: 'כמה עולה שלד?', at: '2026-10-01' }, { nope: 1 }]));
    expect(readAdvisorQuestionCount()).toBe(1);
  });
});
