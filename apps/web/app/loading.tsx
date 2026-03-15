export default function Loading() {
  return (
    <div className="container-page py-16">
      <div className="flex flex-col items-center justify-center gap-4">
        {/* Spinner */}
        <div className="w-10 h-10 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-gray-500 font-medium">טוען...</p>
      </div>

      {/* Skeleton content */}
      <div className="mt-12 space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-64 mx-auto" />
        <div className="skeleton h-4 w-96 mx-auto max-w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl overflow-hidden shadow-card border border-gray-100"
            >
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
          ))}
        </div>
      </div>
    </div>
  );
}
