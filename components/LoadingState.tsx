import { Skeleton } from "@/components/ui/skeleton";

/** Generic skeleton for a page that is loading data. */
export function LoadingState({ rows = 3, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
