import 'server-only';

import { FUNCTION_BUDGET_MS, SOURCE_MIN_MS, autopilotConfig, type AutopilotConfig } from './config';
import { runDetection, type DetectionReport } from './detect';
import { processSource, type PipelineDeps, type ProcessOutcome } from './pipeline';
import type { SourceStore } from './store';
import type { DetectedVia, SourceListRow } from './types';

/** Captions not published yet: worth retrying on later runs (auto-captions arrive within hours). */
export const MAX_CAPTION_RETRIES = 3;

/**
 * What the cron processes, newest first within each group, filtered in SQL:
 * 1. new YouTube videos (podcast episodes need a transcript from staff);
 * 2. transcribed sources (a transcript was uploaded, a budget refusal or a
 *    time-budget handoff stopped them there);
 * 3. YouTube videos parked because captions weren't ready, a few times each.
 */
export async function autoProcessQueue(store: SourceStore, limit: number): Promise<SourceListRow[]> {
  const out: SourceListRow[] = [];
  const add = (rows: SourceListRow[]) => {
    for (const r of rows) if (out.length < limit && !out.some((o) => o.id === r.id)) out.push(r);
  };
  add(await store.listForQueue({ status: 'detected', kind: 'youtube' }, limit));
  if (out.length < limit) add(await store.listForQueue({ status: 'transcribed' }, limit));
  if (out.length < limit) {
    add(
      await store.listForQueue(
        { status: 'needs_transcript', kind: 'youtube', errorSuffix: '[no_captions]', maxAttempts: MAX_CAPTION_RETRIES },
        limit,
      ),
    );
  }
  return out;
}

export interface WatchReport extends DetectionReport {
  autoProcess: { enabled: boolean; processed: Array<{ id: string; external_id: string; outcome: ProcessOutcome }> };
}

/**
 * One watch run (daily cron or "check channel now"): detect new sources, then,
 * when AUTOPILOT_AUTO_PROCESS=true, process up to AUTOPILOT_AUTO_PROCESS_LIMIT
 * queued ones within the request's time budget. Publishing is always left to staff.
 */
export async function runWatch(
  store: SourceStore,
  opts: {
    via: DetectedVia;
    config?: AutopilotConfig;
    detect?: typeof runDetection;
    process?: (id: string, deps: PipelineDeps) => Promise<ProcessOutcome>;
    deadline?: number;
  },
): Promise<WatchReport> {
  const deadline = opts.deadline ?? Date.now() + FUNCTION_BUDGET_MS;
  const config = opts.config ?? autopilotConfig();
  const report = await (opts.detect ?? runDetection)(store, { via: opts.via, config });
  const processed: WatchReport['autoProcess']['processed'] = [];
  if (config.autoProcess) {
    for (const src of await autoProcessQueue(store, config.autoProcessLimit)) {
      // Sequential, one paid summary at a time; the rest waits for the next run.
      if (deadline - Date.now() < SOURCE_MIN_MS) break;
      const outcome = await (opts.process ?? processSource)(src.id, { store, deadline });
      processed.push({ id: src.id, external_id: src.external_id, outcome });
    }
  }
  return { ...report, autoProcess: { enabled: config.autoProcess, processed } };
}
