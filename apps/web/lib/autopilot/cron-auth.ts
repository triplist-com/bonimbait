import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Vercel Cron convention: requests carry `Authorization: Bearer ${CRON_SECRET}`
 * (Vercel adds it when the CRON_SECRET env var is set). Without a configured
 * secret every request is refused, so the endpoint is never open by accident.
 */
export function isAuthorizedCron(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const got = Buffer.from(authorization);
  return got.length === expected.length && timingSafeEqual(got, expected);
}
