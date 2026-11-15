"use client";

import { AlertCircle, Loader2, Plus, RotateCw, X } from "lucide-react";
import type { Item } from "@/types";
import type { PhotoEntry } from "@/hooks/usePhotoPipeline";
import { errorMessage } from "@/client/errors";
import { Button } from "@/components/ui/button";
import { ItemCard } from "@/components/ItemCard";

/** One photo with its recognized items (review) or its upload/analyze status. */
export function PhotoSection({
  src,
  entry,
  items,
  onImgError,
  onRetry,
  onRemove,
  onAdd,
  onEdit,
  onDelete,
  onToggleSentimental,
}: {
  src?: string;
  entry?: PhotoEntry;
  items: Item[];
  onImgError?: () => void;
  onRetry?: () => void;
  onRemove?: () => void;
  onAdd?: () => void;
  onEdit: (item: Item) => void;
  onDelete: (item: Item) => void;
  onToggleSentimental: (item: Item) => void;
}) {
  const status = entry?.status;
  const busy = status === "queued" || status === "uploading" || status === "analyzing";
  const canRemove = entry && !entry.photoPath && (status === "queued" || status === "error");

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:overflow-visible">
      <div className="relative lg:sticky lg:top-20 lg:self-start lg:p-4 lg:pr-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob preview or signed URL */}
        <img
          src={src}
          alt=""
          onError={onImgError}
          className={`aspect-[4/3] w-full bg-muted object-cover lg:rounded-lg ${busy ? "opacity-70" : ""}`}
        />
        {status === "analyzing" ? (
          <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-primary/20">
            <div className="h-full w-1/3 animate-[scan_1.2s_ease-in-out_infinite] bg-primary" />
          </div>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove photo"
            className="absolute top-2 right-2 grid lg:top-6 lg:right-2 size-10 place-items-center rounded-full bg-background/90 shadow"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-2 p-3 lg:p-4">
        {busy ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin text-primary" />
            {status === "uploading" ? "Uploading…" : status === "analyzing" ? "Spotting your furniture…" : "Waiting…"}
          </p>
        ) : null}

        {status === "error" ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {errorMessage(entry?.error, {
                network: entry?.photoPath ? "Couldn't analyze this photo." : "Upload failed.",
              })}
            </p>
            {entry?.error?.kind !== "rate_limited" ? (
              <Button variant="outline" onClick={onRetry}>
                <RotateCw /> Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
            onToggleSentimental={() => onToggleSentimental(item)}
          />
        ))}

        {!busy && status !== "error" && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No furniture found in this photo.</p>
        ) : null}

        {onAdd && !busy ? (
          <Button variant="ghost" className="w-full text-primary" onClick={onAdd}>
            <Plus /> Add missed item
          </Button>
        ) : null}
      </div>
    </section>
  );
}
