import 'server-only';

/**
 * Booking tokens: the browser that created a consultation lead may later mark
 * THAT lead booked (Calendly's event_scheduled), and no other. The token is
 * an HMAC of the lead id, handed back when the lead is created.
 *
 * Secret: REVENUE_TOKEN_SECRET, else the service-role key (the same fallback
 * LEAD_IP_SALT uses). Never sent to the browser.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const value = process.env.REVENUE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!value && process.env.NODE_ENV === 'production') throw new Error('REVENUE_TOKEN_SECRET is not set');
  return value || 'bonimbait-revenue-dev-secret';
}

export function bookingToken(leadId: string, key: string = secret()): string {
  return createHmac('sha256', key).update(`consult-booked|${leadId}`).digest('base64url').slice(0, 32);
}

export function verifyBookingToken(leadId: string, token: unknown, key: string = secret()): boolean {
  if (typeof token !== 'string' || token.length !== 32) return false;
  const expected = Buffer.from(bookingToken(leadId, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
