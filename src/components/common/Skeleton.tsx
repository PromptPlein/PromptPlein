export function SkeletonCard() {
  return (
    <div className="opl-card p-5">
      <div className="skeleton mb-3 h-5 w-2/3 rounded" />
      <div className="skeleton mb-2 h-3 w-full rounded" />
      <div className="skeleton mb-4 h-3 w-4/5 rounded" />
      <div className="flex gap-2">
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
