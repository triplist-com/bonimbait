import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Loading placeholder block. Size it with className (h-*, w-*). */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton', className)} {...rest} />;
}

/** Paragraph placeholder; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('space-y-2.5', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={cn('skeleton h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Media card placeholder matching VideoThumb + title. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('overflow-hidden rounded-2xl border border-ink-100 bg-white', className)}>
      <div className="skeleton aspect-video rounded-none" />
      <div className="space-y-2.5 p-4">
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Announces loading to screen readers while skeletons are on screen. */
export function LoadingRegion({ label = 'טוען…', children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
