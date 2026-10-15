'use client';

import { useTransition } from 'react';
import { ArrowLeft, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { StageId } from '@/lib/hub/types';
import { useHubActions } from './HubActions';

/** "סיימתם את השלב?": moves the project to the next stage. */
export function NextStageCard({
  currentLabel,
  next,
  nextLabel,
}: {
  currentLabel: string;
  next: StageId;
  nextLabel: string;
}) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-success-100 bg-success-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-3 text-body-sm text-success-800">
        <PartyPopper aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success-600" />
        <span>
          <strong className="font-bold">סימנתם את כל הצעדים בשלב {currentLabel}.</strong> עוברים לשלב {nextLabel}? המפה תתעדכן בהתאם.
        </span>
      </p>
      <Button
        size="md"
        variant="secondary"
        loading={pending}
        iconEnd={<ArrowLeft className="ltr:rotate-180" />}
        onClick={() =>
          startTransition(async () => {
            const res = await actions.setStage(next);
            if (!res.ok) toast({ title: res.message ?? 'לא הצלחנו לעדכן. נסו שוב.', tone: 'error' });
            else toast({ title: `עברתם לשלב ${nextLabel}`, tone: 'success' });
          })
        }
      >
        לשלב {nextLabel}
      </Button>
    </div>
  );
}
