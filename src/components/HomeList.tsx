"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, House } from "lucide-react";
import type { Home } from "@/home-types";
import { api } from "@/lib/api-client";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";

export function HomeList() {
  const [homes, setHomes] = useState<Home[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    api.listHomes().then(setHomes).catch(setError);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!homes) return <LoadingState rows={2} />;
  if (homes.length === 0)
    return (
      <EmptyState
        icon={<House className="size-8 text-muted-foreground" />}
        title="No home inventory yet"
        description="Unlock a move report, then tap “Save home inventory” to keep a list of what you own for insurance."
        action={
          <Button asChild variant="outline">
            <Link href="/move">Go to my moves</Link>
          </Button>
        }
      />
    );

  return (
    <ul className="space-y-3">
      {homes.map((h) => (
        <li key={h.id}>
          <Link
            href={`/home/${h.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs hover:bg-accent"
          >
            <span>
              <span className="block font-medium">{h.name}</span>
              <span className="block text-xs text-muted-foreground">
                Saved {new Date(h.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
