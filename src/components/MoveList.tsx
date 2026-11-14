"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import type { Move } from "@/types";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { formatMoveDate, MOVE_STATUS_LABEL, MOVE_TYPE_LABEL } from "@/client/labels";
import { clearStale } from "@/client/staleReport";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";

export function MoveList() {
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [deleting, setDeleting] = useState<Move | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setMoves(null);
    try {
      setMoves(await api.listMoves());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.deleteMove(deleting.id);
      clearStale(deleting.id);
      setMoves((m) => m?.filter((x) => x.id !== deleting.id) ?? null);
      toast.success("Move deleted");
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't delete. Please try again." }));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!moves) return <LoadingState rows={2} />;

  if (moves.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="size-8 text-muted-foreground" aria-hidden />}
        title="No moves yet"
        description="Tell us where you're going and snap your furniture."
        action={
          <Button asChild size="lg">
            <Link href="/move/new">Get started</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {moves.map((m) => (
        <div key={m.id} className="flex items-center gap-1 rounded-xl border bg-card pr-1 shadow-sm">
          <Link
            href={`/move/${m.id}`}
            className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-l-xl p-4 transition-colors hover:bg-accent"
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
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete move"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(m)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button asChild variant="outline" className="w-full">
        <Link href="/move/new">
          <Plus /> New move
        </Link>
      </Button>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete this move?</AlertDialogTitle>
          <AlertDialogDescription>
            We&apos;ll permanently delete the move, every item and all photos. This can&apos;t be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Delete everything
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
