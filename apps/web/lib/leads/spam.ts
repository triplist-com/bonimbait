/**
 * Lightweight spam protection for public lead forms (instead of reCAPTCHA):
 *   1. Honeypot field (HONEYPOT_FIELD): bots fill it, people never see it.
 *   2. Per-IP rate limit: RATE_LIMIT_MAX leads per RATE_LIMIT_WINDOW_MIN,
 *      counted in the DB on a salted IP hash (works across serverless
 *      instances), with an in-memory pre-check per instance.
 *   3. Optional Cloudflare Turnstile: enforced only when TURNSTILE_SECRET_KEY
 *      is set (the widget renders when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set).
 */
import { createHash } from 'node:crypto';

export const RATE_LIMIT_MAX = Number(process.env.LEAD_RATE_LIMIT_MAX || 5);
export const RATE_LIMIT_WINDOW_MIN = Number(process.env.LEAD_RATE_LIMIT_WINDOW_MIN || 10);

export function isHoneypotTripped(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Salted SHA-256 of the client IP; the raw IP is never stored. */
export function hashIp(ip: string | null | undefined, salt = process.env.LEAD_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'bonimbait'): string | null {
  if (!ip) return null;
  return createHash('sha256').update(`${salt}:${ip.trim()}`).digest('hex').slice(0, 32);
}

/** First address in x-forwarded-for, else x-real-ip. */
export function clientIpFromHeaders(h: { get(name: string): string | null }): string | null {
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim() || null;
  return h.get('x-real-ip')?.trim() || null;
}

// In-memory sliding window (per server instance): cheap first line of defence.
const memory = new Map<string, number[]>();

export function memoryRateLimited(key: string, now = Date.now()): boolean {
  const windowMs = RATE_LIMIT_WINDOW_MIN * 60_000;
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= RATE_LIMIT_MAX) {
    memory.set(key, hits);
    return true;
  }
  hits.push(now);
  memory.set(key, hits);
  if (memory.size > 5000) memory.clear(); // bound memory on long-lived instances
  return false;
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** Verify a Turnstile token. Returns true when Turnstile is not configured. */
export async function verifyTurnstile(token: unknown, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
