import 'server-only';

import { isPlatformDbConfigured, platformAdminDb, withTimeout } from '@/lib/platform/db';
import type { PlatformEventInsert } from '@/lib/platform/types';

const INSERT_TIMEOUT_MS = 2000;

/**
 * Store analytics rows with the service role. Never throws (analytics must not
 * break a request); returns how many rows were stored.
 */
export async function insertPlatformEvents(rows: PlatformEventInsert[]): Promise<number> {
  if (rows.length === 0 || !isPlatformDbConfigured()) return 0;
  try {
    const { error } = await withTimeout(
      platformAdminDb().from('platform_events').insert(rows),
      INSERT_TIMEOUT_MS,
      'platform_events insert',
    );
    if (error) {
      console.error(`[analytics] insert failed: ${error.message}`);
      return 0;
    }
    return rows.length;
  } catch (err) {
    console.error(`[analytics] insert failed: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
