"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, Truck } from "lucide-react";
import type { Move } from "@/types";
import { api } from "@/lib/api";
import { formatMoveDate, MOVE_STATUS_LABEL, MOVE_TYPE_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";

export function MoveList() {
  const router = useRouter();
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [redirecting, setRedirecting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setMoves(null);
    try {
      const list = await api.listMoves();
      if (list.length === 1) {
        // Single move → jump straight into it.
        setRedirecting(true);
        const details = await api.getMove(list[0].id);
        router.replace(`/move/${list[0].id}/${details.items.length > 0 ? "review" : "upload"}`);
        return;
      }
      setMoves(list);
    } catch (e) {
      setRedirecting(false);
      setError(e);
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!moves || redirecting) return <LoadingState rows={2} />;

  if (moves.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="size-8 text-muted-foreground" aria-hidden />}
        title="No moves yet"
        description="Tell us where you're going and snap your furniture."
        action={
          <Button asChild size="lg">
            <Link href="/move/new">Start my move</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {moves.map((m) => (
        <Link
          key={m.id}
          href={`/move/${m.id}/${m.status === "draft" ? "upload" : "review"}`}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent"
        >
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              {m.fromZip} → {m.toZip}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatMoveDate(m.moveDate)} · {MOVE_TYPE_LABEL[m.moveType]}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={m.status === "paid" ? "default" : "secondary"}>{MOVE_STATUS_LABEL[m.status]}</Badge>
            <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
          </div>
        </Link>
      ))}
      <Button asChild variant="outline" className="w-full">
        <Link href="/move/new">
          <Plus /> New move
        </Link>
      </Button>
    </div>
  );
}
