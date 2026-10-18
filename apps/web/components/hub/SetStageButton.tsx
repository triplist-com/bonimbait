'use client';

import { useState, useTransition } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { StageId } from '@/lib/hub/types';
import { useHubActions } from './HubActions';

/** "זה השלב שלנו עכשיו": move the project to this stage from its page. */
export function SetStageButton({ stage, label }: { stage: StageId; label: string }) {
  const actions = useHubActions();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <Button
      variant="outline"
      size="md"
      className="mt-5"
      iconStart={<MapPin />}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await actions.setStage(stage);
          if (!res.ok) {
            toast({ title: res.message ?? 'לא הצלחנו לעדכן. נסו שוב.', tone: 'error' });
            return;
          }
          setDone(true);
          toast({ title: `המפה עודכנה: אתם בשלב ${label}`, tone: 'success' });
        })
      }
    >
      זה השלב שלנו עכשיו
    </Button>
  );
}
