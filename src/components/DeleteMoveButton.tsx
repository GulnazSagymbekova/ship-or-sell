"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { clearStale } from "@/client/staleReport";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** "Delete my data" → confirm → DELETE /api/moves/:id → home with a toast. */
export function DeleteMoveButton({ moveId }: { moveId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteMove(moveId);
      clearStale(moveId);
      setOpen(false);
      toast.success("Your move, items and photos were deleted.");
      router.push("/");
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't delete your data. Please try again." }));
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="link" className="text-muted-foreground hover:text-destructive">
          Delete my data
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this move?</AlertDialogTitle>
        <AlertDialogDescription>
          We&apos;ll permanently delete the move, every item and all photos. This can&apos;t be undone.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* Plain button so the dialog stays open while the request runs. */}
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Delete everything
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
