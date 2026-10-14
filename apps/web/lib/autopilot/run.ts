import 'server-only';

import { autopilotConfig, type AutopilotConfig } from './config';
import { runDetection, type DetectionReport } from './detect';
import { processSource, type PipelineDeps, type ProcessOutcome } from './pipeline';
import type { SourceStore } from './store';
import type { DetectedVia } from './types';

export interface WatchReport extends DetectionReport {
  autoProcess: { enabled: boolean; processed: Array<{ id: string; external_id: string; outcome: ProcessOutcome }> };
}

/**
 * One watch run (daily cron or "check channel now"): detect new sources, then,
 * when AUTOPILOT_AUTO_PROCESS=true, process up to AUTOPILOT_AUTO_PROCESS_LIMIT
 * detected ones (newest first). Publishing is always left to staff.
 */
export async function runWatch(
  store: SourceStore,
  opts: {
    via: DetectedVia;
    config?: AutopilotConfig;
    detect?: typeof runDetection;
    process?: (id: string, deps: PipelineDeps) => Promise<ProcessOutcome>;
  },
): Promise<WatchReport> {
  const config = opts.config ?? autopilotConfig();
  const report = await (opts.detect ?? runDetection)(store, { via: opts.via, config });
  const processed: WatchReport['autoProcess']['processed'] = [];
  if (config.autoProcess) {
    const queue = await store.listByStatus('detected', config.autoProcessLimit);
    for (const src of queue) {
      // Sequential on purpose: one paid summary at a time, inside the function's time budget.
      const outcome = await (opts.process ?? processSource)(src.id, { store });
      processed.push({ id: src.id, external_id: src.external_id, outcome });
    }
  }
  return { ...report, autoProcess: { enabled: config.autoProcess, processed } };
}
