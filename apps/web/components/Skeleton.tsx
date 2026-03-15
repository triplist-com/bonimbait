export function VideoCardSkeleton() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-card border border-gray-100">
      <div className="skeleton aspect-video rounded-none" />
      <div className="p-4 space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-3/4" />
        <div className="flex items-center justify-between">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function VideoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <VideoCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-5 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="skeleton w-40 h-24 flex-shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-1">
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnswerSkeleton() {
  return (
    <div className="bg-gradient-to-br from-primary-50 to-white border border-primary-100 rounded-2xl p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <div className="skeleton h-7 w-36 rounded-full" />
      </div>
      <div className="space-y-3">
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-11/12" />
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-3/4" />
      </div>
    </div>
  );
}

export function CategoryBarSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-28 rounded-full flex-shrink-0" />
      ))}
    </div>
  );
}
