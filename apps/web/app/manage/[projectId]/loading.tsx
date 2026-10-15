import { LoadingRegion, Skeleton, SkeletonText } from '@/components/ui/Skeleton';

/** While the project file loads: the header and the first sections, in place (no layout jump). */
export default function ManagedProjectLoading() {
  return (
    <LoadingRegion label="טוענים את תיק הפרויקט…" className="bg-paper pb-16">
      <div className="border-b border-sand-200 bg-sand-50">
        <div className="container-page space-y-4 pb-8 pt-7">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-36 rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
      <div className="container-page mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
              <Skeleton className="mb-4 h-6 w-48" />
              <SkeletonText lines={4} />
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
          <Skeleton className="mb-4 h-6 w-32" />
          <SkeletonText lines={6} />
        </div>
      </div>
    </LoadingRegion>
  );
}
