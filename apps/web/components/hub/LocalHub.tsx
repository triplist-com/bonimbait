'use client';

/**
 * The anonymous visitor's "הבית שלי", built in the browser from
 * localStorage (bb.hub.draft and friends). Checklist ticks, stage moves and
 * saved items work locally; budget tracking, tasks and documents ask to sign
 * up (free), and everything moves into the account on signup or login.
 */
import { useCallback, useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ToastProvider } from '@/components/ui/Toast';
import { isDraftComplete } from '@/lib/hub/onboarding';
import { onHubStorageChange, readLocalHub, readPlanner } from '@/lib/hub/local';
import type { StagePicksMap } from '@/lib/hub/types';
import type { PriceBook } from '@/lib/planner/types';
import { buildLocalViewData, type LocalViewInput } from '@/lib/hub/view';
import { HubActionsProvider } from './HubActions';
import { HubDashboard } from './HubDashboard';
import { HubIntro } from './HubIntro';
import { useLocalHubActions } from './LocalHubProvider';

function readInput(): LocalViewInput {
  return { ...readLocalHub(), planner: readPlanner() };
}

export default function LocalHub({ picks, today, book }: { picks: StagePicksMap; today: string; book?: PriceBook }) {
  const [input, setInput] = useState<LocalViewInput | null>(null);
  const refresh = useCallback(() => setInput(readInput()), []);

  useEffect(() => {
    refresh();
    return onHubStorageChange(refresh);
  }, [refresh]);

  const actions = useLocalHubActions();

  if (!input) {
    return (
      <div className="container-page grid gap-5 py-10" aria-busy="true" aria-label="טוענים את הבית שלכם">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!isDraftComplete(input.draft)) {
    return <HubIntro signedIn={false} savedCount={input.saved.length} />;
  }

  const data = buildLocalViewData(input, picks, today, book);
  return (
    <ToastProvider>
      <HubActionsProvider value={actions}>
        <HubDashboard
          data={data}
          editHref="/my-home/start/?edit=1"
          banner={
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-primary-100 bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-3 text-body-sm text-ink-800">
                <CloudOff aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary-600" />
                <span>
                  <strong className="font-bold">המפה שמורה במכשיר הזה בלבד.</strong> הירשמו בחינם כדי לשמור אותה לתמיד, ולהוסיף תקציב, משימות ומסמכים.
                </span>
              </p>
              <ButtonLink href="/signup/?next=/my-home/" size="md" prefetch={false} className="shrink-0">
                שמרו את המפה
              </ButtonLink>
            </div>
          }
        />
      </HubActionsProvider>
    </ToastProvider>
  );
}
