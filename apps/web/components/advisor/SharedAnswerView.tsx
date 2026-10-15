'use client';

/**
 * A shared answer (/ask/a/<id>/): the same TurnView as the live advisor, read
 * only. The moments still play inline, follow-ups open the live advisor, and
 * "שתפו" passes the same link on (no new snapshot).
 */
import { useState } from 'react';
import type { AdvisorTurn } from '@/lib/advisor/client/useAdvisor';
import type { AdvisorIntent, AdvisorSharePayload } from '@/lib/advisor/types';
import TurnView, { type PlayingMoment } from './TurnView';

export interface SharedAnswerViewProps {
  id: string;
  payload: AdvisorSharePayload;
  intent: AdvisorIntent;
}

export default function SharedAnswerView({ id, payload, intent }: SharedAnswerViewProps) {
  const [playing, setPlaying] = useState<PlayingMoment | null>(null);
  const turn: AdvisorTurn = {
    id: `shared-${id}`,
    question: payload.question,
    origin: 'url',
    status: 'done',
    sources: payload.sources,
    stats: null,
    confidence: null,
    sq: null,
    rewritten: false,
    answer: payload.answer,
    followups: payload.followups,
    pros: null,
    intent,
    at: payload.at,
    shareId: id,
    // The snapshot is already shared: ShareBar reuses this id and never re-publishes.
    signature: 'shared',
    restored: true,
  };
  return (
    <TurnView
      turn={turn}
      index={1}
      playing={playing}
      onPlay={setPlaying}
      headingLevel={1}
      sharePayload={payload}
      onShareId={() => undefined}
    />
  );
}
