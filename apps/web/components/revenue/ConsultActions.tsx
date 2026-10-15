'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, CircleCheck, CircleX, PhoneCall, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/lib/admin/guard';
import { CONSULT_ACTIONS, CONSULT_STAGES, availableActions, type ConsultAction, type ConsultStage } from '@/lib/revenue/consult-workflow';

const ICONS: Record<ConsultAction, React.ReactNode> = {
  book: <CalendarCheck />,
  contacted: <PhoneCall />,
  won: <CircleCheck />,
  lost: <CircleX />,
  requeue: <Undo2 />,
};

const NEXT_STAGE: Record<ConsultAction, ConsultStage> = {
  book: 'booked',
  contacted: 'contacted',
  won: 'won',
  lost: 'lost',
  requeue: 'queue',
};

/**
 * Quick actions for one consult lead. With `action` they run the server
 * action and refresh; without it (the demo view) they only change the stage
 * on screen.
 */
export default function ConsultActions({
  leadId,
  stage,
  action,
}: {
  leadId: string;
  stage: ConsultStage;
  action?: (id: string, a: ConsultAction) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(stage);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const actions = availableActions(current);

  function run(a: ConsultAction) {
    start(async () => {
      if (!action) {
        setCurrent(NEXT_STAGE[a]);
        setMessage({ ok: true, text: `${CONSULT_ACTIONS[a].done} (תצוגת הדגמה: לא נשמר)` });
        return;
      }
      const res = await action(leadId, a);
      setMessage(res.ok ? { ok: true, text: res.message ?? CONSULT_ACTIONS[a].done } : { ok: false, text: res.error });
      if (res.ok) {
        setCurrent(NEXT_STAGE[a]);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-2xl bg-ink-50 p-3">
      <p className="mb-2 text-caption font-semibold text-ink-600">
        סטטוס: <span className="text-ink-900">{CONSULT_STAGES[current].label}</span>
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="פעולות מהירות">
        {actions.map((a, i) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={i === 0 && a !== 'requeue' ? 'primary' : 'outline'}
            iconStart={ICONS[a]}
            disabled={pending}
            onClick={() => run(a)}
          >
            {CONSULT_ACTIONS[a].label}
          </Button>
        ))}
      </div>
      <p aria-live="polite" className={message ? (message.ok ? 'mt-2 text-sm text-success-700' : 'mt-2 text-sm text-danger-700') : 'sr-only'}>
        {message?.text ?? ''}
      </p>
    </div>
  );
}
