'use client';

/**
 * Saved state for the ♡ / shortlist buttons on static (ISR) pages.
 *
 *  - Signed-in members (an auth cookie): one GET /api/hub/saved/ per page
 *    load, shared by every button; saves go through a server action.
 *  - Everyone else: localStorage (lib/hub/local-saved: bb.hub.saved and
 *    bb.shortlist), imported into the account on signup or login.
 *
 * Lean on purpose: it ships with every content page that has a button.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { toggleSavedAction } from '@/app/my-home/actions';
import { hasAuthCookie } from '@/lib/auth/cookie';
import { isLocallySaved, onHubStorageChange, toggleLocalSaved } from '@/lib/hub/local-saved';
import type { SavedKind } from '@/lib/hub/types';

type MemberState = { signedIn: boolean; keys: Set<string> };

let member: MemberState | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const keyOf = (kind: SavedKind, ref: string) => `${kind}:${ref}`;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const off = onHubStorageChange(listener);
  return () => {
    listeners.delete(listener);
    off();
  };
}

function loadMember(): Promise<void> {
  if (loading) return loading;
  loading = fetch('/api/hub/saved/', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { signedIn: false, items: [] }))
    .then((data: { signedIn?: boolean; items?: Array<{ kind: SavedKind; ref: string }> }) => {
      member = { signedIn: Boolean(data.signedIn), keys: new Set((data.items ?? []).map((i) => keyOf(i.kind, i.ref))) };
    })
    .catch(() => {
      member = { signedIn: false, keys: new Set() };
    })
    .finally(emit);
  return loading;
}

function probablySignedIn(): boolean {
  return typeof document !== 'undefined' && hasAuthCookie(document.cookie);
}

export interface SavedState {
  saved: boolean;
  /** False until we know where the state lives (avoids a wrong flash). */
  ready: boolean;
}

const NOT_READY: SavedState = { saved: false, ready: false };

export function useSaved(kind: SavedKind, ref: string): SavedState {
  // The version number is the snapshot (-1 on the server and while
  // hydrating, so the first client render matches the HTML).
  const snapshot = useSyncExternalStore(subscribe, () => version, () => -1);
  useEffect(() => {
    if (probablySignedIn()) void loadMember();
  }, []);
  if (snapshot < 0) return NOT_READY;
  if (probablySignedIn() && !member) return NOT_READY;
  if (member?.signedIn) return { saved: member.keys.has(keyOf(kind, ref)), ready: true };
  return { saved: isLocallySaved(kind, ref), ready: true };
}

export interface SaveItem {
  kind: SavedKind;
  ref: string;
  title: string;
  meta?: Record<string, string>;
}

export type ToggleResult = { ok: true; where: 'account' | 'device' } | { ok: false; message: string };

/** Save or unsave, optimistic for members; falls back to this device when the session expired. */
export async function toggleSaved(item: SaveItem, next: boolean): Promise<ToggleResult> {
  if (probablySignedIn() && !member) await loadMember();
  if (member?.signedIn) {
    const key = keyOf(item.kind, item.ref);
    const before = member.keys.has(key);
    if (next) member.keys.add(key);
    else member.keys.delete(key);
    emit();
    try {
      const res = await toggleSavedAction({ ...item, saved: next });
      if (res.ok) return { ok: true, where: 'account' };
      if (res.error !== 'auth') throw new Error(res.message);
      member = { signedIn: false, keys: new Set() };
    } catch (err) {
      if (before) member?.keys.add(key);
      else member?.keys.delete(key);
      emit();
      return { ok: false, message: err instanceof Error && err.message ? err.message : 'לא הצלחנו לשמור. נסו שוב.' };
    }
  }
  toggleLocalSaved({ kind: item.kind, ref: item.ref, title: item.title, meta: item.meta }, next);
  emit();
  return { ok: true, where: 'device' };
}
