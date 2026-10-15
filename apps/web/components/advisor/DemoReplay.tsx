'use client';

/**
 * Replays a recorded advisor answer through the real TurnView: "searching",
 * the sources about 450 ms later, then the answer typed in at its recorded
 * pace, then follow-ups and lead moments. No API calls, $0 to show. With
 * prefers-reduced-motion the finished answer shows at once.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { AdvisorTurn } from '@/lib/advisor/client/useAdvisor';
import type { AdvisorDemoData } from '@/lib/demo/fixtures/advisor';
import TurnView, { type PlayingMoment } from './TurnView';

function baseTurn(data: AdvisorDemoData): AdvisorTurn {
  return {
    id: 'demo',
    question: data.question,
    origin: 'demo',
    status: 'searching',
    sources: [],
    stats: null,
    confidence: null,
    sq: data.question,
    rewritten: false,
    answer: '',
    followups: [],
    pros: null,
    intent: null,
    at: data.recordedAt,
  };
}

function finished(data: AdvisorDemoData): AdvisorTurn {
  return {
    ...baseTurn(data),
    status: 'done',
    sources: data.sources,
    stats: data.stats,
    confidence: data.confidence,
    answer: data.answer,
    followups: data.followups,
    pros: data.pros,
    intent: data.intent,
  };
}

export default function DemoReplay({ data }: { data: AdvisorDemoData }) {
  const [turn, setTurn] = useState<AdvisorTurn>(() => baseTurn(data));
  const [playing, setPlaying] = useState<PlayingMoment | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    setPlaying(null);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTurn(finished(data));
      return;
    }
    setTurn(baseTurn(data));
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    // Cards appear before the answer, without "cited" marks (those come with "done").
    const early = data.sources.map((s) => ({ ...s, cited: undefined }));
    timers.push(
      setTimeout(() => setTurn((t) => ({ ...t, status: 'answering', sources: early, stats: data.stats, confidence: data.confidence })), data.replay.sourcesAt),
    );
    for (const c of data.chunks) {
      timers.push(setTimeout(() => setTurn((t) => ({ ...t, answer: t.answer + c.text })), data.replay.firstChunkAt + c.t));
    }
    const last = data.chunks[data.chunks.length - 1]?.t ?? 0;
    timers.push(setTimeout(() => setTurn(finished(data)), data.replay.firstChunkAt + last + 250));
    return () => timers.forEach(clearTimeout);
  }, [data, run]);

  const done = turn.status === 'done';
  return (
    <div className="space-y-8">
      <TurnView turn={turn} index={1} playing={playing} onPlay={setPlaying} headingLevel={2} />
      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-6">
        <ButtonLink href={`/ask/?q=${encodeURIComponent(data.question)}`} size="lg" iconEnd={<ArrowLeft className="ltr:rotate-180" />}>
          נסו בעצמכם
        </ButtonLink>
        <Button variant="outline" size="lg" iconStart={<RotateCcw />} onClick={() => setRun((r) => r + 1)} disabled={!done}>
          הפעלה מחדש
        </Button>
      </div>
    </div>
  );
}
