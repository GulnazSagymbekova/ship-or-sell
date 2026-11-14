"use client";

import { AlertCircle, CheckCircle2, Loader2, RotateCw, X } from "lucide-react";
import type { PhotoEntry } from "@/hooks/usePhotoQueue";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS_TEXT: Record<PhotoEntry["status"], string> = {
  queued: "Waiting…",
  uploading: "Uploading…",
  analyzing: "Finding items…",
  done: "",
  error: "",
};

export function PhotoCard({
  entry,
  onRetry,
  onRemove,
}: {
  entry: PhotoEntry;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const busy = entry.status === "queued" || entry.status === "uploading" || entry.status === "analyzing";
  const canRemove = !entry.photoPath && (entry.status === "queued" || entry.status === "error");

  return (
    <div className="relative overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="relative aspect-square bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img
          src={entry.previewUrl}
          alt=""
          className={cn("size-full object-cover transition", busy && "opacity-60", entry.status === "error" && "grayscale")}
        />
        {entry.status === "analyzing" ? (
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-[scan_1.2s_ease-in-out_infinite] bg-primary" />
          </div>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove photo"
            className="absolute top-1 right-1 grid size-9 place-items-center rounded-full bg-background/90 shadow"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-12 items-center gap-2 px-2.5 py-2 text-xs">
        {busy ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
            <span className="text-muted-foreground">{STATUS_TEXT[entry.status]}</span>
          </>
        ) : null}
        {entry.status === "done" ? (
          <>
            <CheckCircle2 className="size-4 shrink-0 text-sell" aria-hidden />
            <span className="truncate">
              {entry.items.length === 0
                ? "No furniture found"
                : `${entry.items.length} item${entry.items.length === 1 ? "" : "s"} found`}
            </span>
          </>
        ) : null}
        {entry.status === "error" ? (
          <div className="flex w-full flex-col gap-1.5">
            <span className="flex items-start gap-1.5 text-destructive">
              <AlertCircle className="mt-px size-4 shrink-0" aria-hidden />
              {errorMessage(entry.error, {
                network: "Upload failed.",
                validation: "This photo couldn't be processed.",
              })}
            </span>
            <Button size="sm" variant="outline" onClick={onRetry} className="h-9 w-full">
              <RotateCw /> Retry
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
