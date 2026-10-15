/** Placeholder with the wizard card's footprint (no layout shift when it hydrates). Server-safe. */
export function PlannerSkeleton() {
  return (
    <div className="mx-auto max-w-3xl rounded-4xl border border-ink-100 bg-white p-5 shadow-card sm:p-8" aria-busy="true" aria-label="טוענים את המחשבון">
      <div className="skeleton h-4 w-40 rounded" />
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton h-1.5 rounded-full" />
        ))}
      </div>
      <div className="skeleton mt-8 h-8 w-64 rounded" />
      <div className="skeleton mt-6 h-[17rem] rounded-2xl" />
      <div className="mt-8 flex justify-end">
        <div className="skeleton h-12 w-32 rounded-xl" />
      </div>
    </div>
  );
}
