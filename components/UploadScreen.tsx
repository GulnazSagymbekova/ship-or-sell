"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { Item, MoveDetails } from "@/types";
import { api } from "@/lib/api";
import { LIMITS } from "@/lib/config";
import { formatMoveDate } from "@/lib/labels";
import { usePhotoQueue } from "@/hooks/usePhotoQueue";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { DetectedItemList } from "@/components/DetectedItemList";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { PhotoCard } from "@/components/PhotoCard";
import { PhotoUploader } from "@/components/PhotoUploader";

export function UploadScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const [details, setDetails] = useState<MoveDetails | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { entries, add, retry, remove } = usePhotoQueue(moveId);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetails(await api.getMove(moveId));
    } catch (e) {
      setError(e);
    }
  }, [moveId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  // Items saved on earlier visits + items found in this session, newest last.
  const items = useMemo<Item[]>(() => {
    const fresh = entries.flatMap((e) => e.items);
    const seen = new Set(fresh.map((i) => i.id));
    return [...(details?.items ?? []).filter((i) => !seen.has(i.id)), ...fresh];
  }, [details, entries]);

  const previewByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.photoPath) m.set(e.photoPath, e.previewUrl);
    return m;
  }, [entries]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!details) return <LoadingState rows={2} />;

  const existingPhotos = new Set(details.items.map((i) => i.photoPath)).size;
  const remaining = LIMITS.maxPhotosPerMove - existingPhotos - entries.length;
  const working = entries.some((e) => e.status !== "done" && e.status !== "error");
  const route = [details.fromCity ?? details.move.fromZip, details.toCity ?? details.move.toZip].join(" → ");

  return (
    <div className="pb-24">
      <PageTitle title="Photograph your furniture" subtitle={`${route} · ${formatMoveDate(details.move.moveDate)}`} />

      <PhotoUploader remaining={remaining} onFiles={add} />

      {entries.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Photos ({existingPhotos + entries.length})
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {entries.map((e) => (
              <PhotoCard key={e.id} entry={e} onRetry={() => retry(e.id)} onRemove={() => remove(e.id)} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          Items found {items.length ? `(${items.length})` : null}
        </h2>
        {items.length > 0 ? (
          <DetectedItemList
            items={items}
            photoUrl={(i) => previewByPath.get(i.photoPath) ?? details.photoUrls[i.photoPath]}
          />
        ) : (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            {working ? "Looking for furniture…" : "Items will show up here as each photo is analyzed."}
          </p>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 py-3 backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl px-4">
          {items.length > 0 ? (
            <Button asChild size="lg" className="w-full">
              <Link href={`/move/${moveId}/review`}>
                Review items <ArrowRight />
              </Link>
            </Button>
          ) : (
            <Button size="lg" className="w-full" disabled>
              Review items <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
