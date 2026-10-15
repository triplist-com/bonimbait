import 'server-only';

/**
 * Shareable answers. Nothing is stored when an answer streams: the `done`
 * event carries the answer and an HMAC of it. Only when the visitor taps
 * "share" does the browser send both back (POST /api/advisor/share), and the
 * server stores the snapshot if the signature matches. So a snapshot at
 * /ask/a/<id>/ always shows an answer the advisor really gave, never text a
 * visitor typed in, and visitors who don't share leave nothing behind.
 *
 * Secret: ADVISOR_SHARE_SECRET, else the service-role key (server-only).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { AdvisorSharePayload } from './types';

const CONTEXT = 'bonimbait-advisor-share-v1';
const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
/** Share ids: 16 characters from a 57-symbol alphabet without look-alikes (~93 bits), unguessable. */
export const SHARE_ID_RE = /^[A-HJ-NP-Za-km-z2-9]{16}$/;

function secret(): string | null {
  return process.env.ADVISOR_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || null;
}

/** JSON with object keys sorted at every level, so client round-trips verify. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function hmac(payload: AdvisorSharePayload, key: string): string {
  return createHmac('sha256', key).update(`${CONTEXT}\n${stableStringify(payload)}`).digest('base64url');
}

/** Signature for a finished answer, or null when no secret is configured. */
export function signShare(payload: AdvisorSharePayload): string | null {
  const key = secret();
  return key ? hmac(payload, key) : null;
}

export function verifyShare(payload: AdvisorSharePayload, signature: string): boolean {
  const key = secret();
  if (!key || typeof signature !== 'string' || signature.length > 128) return false;
  const expected = Buffer.from(hmac(payload, key));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A fresh share id (the browser makes its own the same way, see lib/advisor/client/share.ts). */
export function newShareId(): string {
  const bytes = randomBytes(16);
  let id = '';
  for (let i = 0; i < 16; i++) id += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return id;
}
