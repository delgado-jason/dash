import { Skeleton } from "./skeleton";

// Shape-matched loading placeholders that mirror the app's page shapes — a
// skeleton that looks like the page beats a bare "Loading…" line. Compose these
// inside each page's own shell so the background/padding still match.

// A row of stat/KPI cards.
export const StatCardsSkeleton = ({ count = 3 }: { count?: number }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }, (_, i) => (
      <Skeleton key={i} className="h-24" style={{ borderRadius: 13 }} />
    ))}
  </div>
);

// A stack of list/table rows.
export const RowsSkeleton = ({ rows = 6 }: { rows?: number }) => (
  <div className="space-y-2">
    {Array.from({ length: rows }, (_, i) => (
      <Skeleton key={i} className="h-14" style={{ borderRadius: 10 }} />
    ))}
  </div>
);

// A single large panel/chart block.
export const BlockSkeleton = ({ className = "h-72" }: { className?: string }) => (
  <Skeleton className={className} style={{ borderRadius: 16 }} />
);
