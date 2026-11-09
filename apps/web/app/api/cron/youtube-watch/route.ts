import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedCron } from '@/lib/autopilot/cron-auth';
import { serviceDb } from '@/lib/autopilot/db';
import { unreadSourceKinds } from '@/lib/autopilot/detect';
import { runWatch } from '@/lib/autopilot/run';
import { supabaseStore } from '@/lib/autopilot/store';
import { isEnabled } from '@/lib/flags';

/**
 * Content Autopilot watcher (Render cron job `bonimbait-youtube-watch`, daily;
 * see docs/deployment.md). Detects new
 * channel videos (and PODCAST_RSS_URL episodes) and, with
 * AUTOPILOT_AUTO_PROCESS=true, processes a few of them. Never publishes.
 * Requires `Authorization: Bearer ${CRON_SECRET}`.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // FLAG_AUTOPILOT=false: no watching (published videos stay in search and answers).
  if (!isEnabled('autopilot')) return NextResponse.json({ skipped: 'FLAG_AUTOPILOT=false' });
  const db = serviceDb();
  if (!db) return NextResponse.json({ error: 'knowledge store not configured' }, { status: 503 });

  try {
    const report = await runWatch(supabaseStore(db), { via: 'cron' });
    console.info(
      `[autopilot] watch: ${report.inserted.length} new, ${report.alreadyKnown} known, ${report.inStaticIndex} static, ` +
        `${report.autoProcess.processed.length} processed`,
    );
    // A source that couldn't be read fails the run (curl -f exits non-zero), so the
    // scheduler flags it instead of reporting success with nothing detected.
    const unread = unreadSourceKinds(report.feeds);
    if (unread.length > 0) {
      const errors = report.feeds.filter((f) => f.error).map((f) => `${f.url}: ${f.error}`);
      console.error(`[autopilot] watch could not read ${unread.join(', ')}: ${errors.join('; ')}`);
      return NextResponse.json(report, { status: 502 });
    }
    return NextResponse.json(report);
  } catch (err) {
    console.error('[autopilot] watch failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'watch failed' }, { status: 500 });
  }
}
