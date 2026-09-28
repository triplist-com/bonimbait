'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/lib/admin/guard';
import type { LeadStatus } from '@/lib/db/types';

const ALIAS: Partial<Record<LeadStatus, LeadStatus>> = { in_progress: 'contacted', qualified: 'won', closed: 'lost' };

/** One-click lead workflow: new -> contacted -> won / lost / spam. */
export default function LeadStatusButtons({
  id,
  current,
  statuses,
  action,
}: {
  id: string;
  current: LeadStatus;
  statuses: Array<{ key: LeadStatus; label: string }>;
  action: (id: string, status: LeadStatus) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const active = ALIAS[current] ?? current;
  return (
    <div>
      <p className="mb-2 text-sm text-gray-600">סטטוס</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="סטטוס ליד">
        {statuses.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={pending}
            aria-pressed={active === s.key}
            onClick={() =>
              start(async () => {
                const res = await action(id, s.key);
                if (!res.ok) setError(res.error);
                else {
                  setError(null);
                  router.refresh();
                }
              })
            }
            className={`rounded-lg px-3 py-1.5 text-sm ring-1 disabled:opacity-60 ${
              active === s.key ? 'bg-primary text-white ring-primary' : 'bg-white text-gray-700 ring-gray-300 hover:bg-gray-50'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
