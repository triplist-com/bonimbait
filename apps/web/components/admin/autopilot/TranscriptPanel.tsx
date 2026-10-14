'use client';

import { useState, type ReactNode } from 'react';

/**
 * Collapsible transcript upload area. The open state lives on the client, so
 * the refresh after saving and processing doesn't collapse it and hide the
 * result message.
 */
export default function TranscriptPanel({ title, initialOpen, children }: { title: string; initialOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details className="rounded-lg border border-gray-200 p-3" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-primary">{title}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}
