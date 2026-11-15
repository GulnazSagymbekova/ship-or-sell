"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Item } from "@/types";
import { api } from "@/lib/api-client";
import { LIMITS } from "@/client/config";
import { errorMessage } from "@/client/errors";
import { formatMoveDate } from "@/client/labels";
import { clearStale, isStale, markStale } from "@/client/staleReport";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { usePhotoPipeline } from "@/hooks/usePhotoPipeline";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { AddItemSheet } from "@/components/AddItemSheet";
import { ErrorState } from "@/components/ErrorState";
import { ItemEditSheet } from "@/components/ItemEditSheet";
import { LoadingState } from "@/components/LoadingState";
import { PhotoSection } from "@/components/PhotoSection";
import { PhotoUploader } from "@/components/PhotoUploader";

/** /move/{id}: upload photos → recognition → review items → Calculate. */
export function MoveScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const router = useRouter();
  const { details, setDetails, error, reload, refreshPhotos } = useMoveDetails(moveId);
  const [editing, setEditing] = useState<Item | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [stale, setStale] = useState(() => (typeof window === "undefined" ? false : isStale(moveId)));

  const setItems = (fn: (items: Item[]) => Item[]) => setDetails((d) => (d ? { ...d, items: fn(d.items) } : d));
  const changed = () => {
    markStale(moveId);
    setStale(true);
  };

  const pipeline = usePhotoPipeline(moveId, {
    onUploaded: (photoPath, previewUrl) =>
      setDetails((d) => (d ? { ...d, photoUrls: { ...d.photoUrls, [photoPath]: d.photoUrls[photoPath] ?? previewUrl } } : d)),
    onAnalyzed: (items) => {
      setItems((prev) => [...prev, ...items.filter((i) => !prev.some((p) => p.id === i.id))]);
      setStale(true);
    },
  });

  // Photo order: server photos first, then local ones still uploading.
  const sections = useMemo(() => {
    if (!details) return [];
    const byPhoto = new Map<string, Item[]>();
    for (const i of details.items) byPhoto.set(i.photoPath, [...(byPhoto.get(i.photoPath) ?? []), i]);
    const paths = [...new Set([...Object.keys(details.photoUrls), ...byPhoto.keys()])];
    const entryByPath = new Map(pipeline.entries.filter((e) => e.photoPath).map((e) => [e.photoPath!, e]));
    const server = paths.map((p) => ({
      key: p,
      photoPath: p as string | null,
      src: details.photoUrls[p],
      entry: entryByPath.get(p),
      items: byPhoto.get(p) ?? [],
    }));
    const local = pipeline.entries
      .filter((e) => !e.photoPath)
      .map((e) => ({ key: e.id, photoPath: null, src: e.previewUrl, entry: e, items: [] as Item[] }));
    return [...server, ...local];
  }, [details, pipeline.entries]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!details) return <LoadingState rows={3} />;

  const photoCount = sections.length;
  const remaining = LIMITS.maxPhotosPerMove - photoCount;
  const itemCount = details.items.length;
  const route = [details.fromCity ?? details.move.fromZip, details.toCity ?? details.move.toZip].join(" → ");
  const { total, uploaded } = pipeline.progress;
  const hasReport = details.summary !== null && !stale;

  const remove = async (item: Item) => {
    const snapshot = details.items;
    setItems((items) => items.filter((i) => i.id !== item.id)); // optimistic
    try {
      await api.deleteItem(item.id);
      changed();
    } catch (e) {
      setItems(() => snapshot);
      toast.error(errorMessage(e, { network: "Couldn't delete. Please try again." }));
    }
  };

  const toggleSentimental = async (item: Item) => {
    const next = !item.sentimental;
    setItems((items) => items.map((i) => (i.id === item.id ? { ...i, sentimental: next } : i)));
    try {
      const saved = await api.updateItem(item.id, { sentimental: next });
      setItems((items) => items.map((i) => (i.id === saved.id ? saved : i)));
      changed();
    } catch (e) {
      setItems((items) => items.map((i) => (i.id === item.id ? { ...i, sentimental: item.sentimental } : i)));
      toast.error(errorMessage(e, { network: "Couldn't save. Please try again." }));
    }
  };

  const calculate = async () => {
    setCalculating(true);
    try {
      await api.estimate(moveId);
      clearStale(moveId);
      router.push(`/move/${moveId}/report`);
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't calculate. Please try again." }));
      setCalculating(false);
    }
  };

  return (
    <div className="pb-32">
      <PageTitle
        title={photoCount ? "Check your items" : "Photograph your furniture"}
        subtitle={`${route} · ${formatMoveDate(details.move.moveDate)}`}
      />

      <PhotoUploader remaining={remaining} onFiles={pipeline.add} compact={photoCount > 0} />

      {total > 0 && uploaded < total ? (
        <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium" role="status">
          <Loader2 className="size-4 animate-spin text-primary" /> Uploading {Math.min(uploaded + 1, total)} / {total}
        </p>
      ) : null}

      {sections.length > 0 ? (
        <div className="mt-6 space-y-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            {itemCount} item{itemCount === 1 ? "" : "s"} · {photoCount} photo{photoCount === 1 ? "" : "s"}
          </h2>
          <div className="space-y-6">
            {sections.map((s) => (
              <PhotoSection
                key={s.key}
                src={s.src}
                entry={s.entry}
                items={s.items}
                onImgError={s.entry ? undefined : refreshPhotos}
                onRetry={s.entry ? () => pipeline.retry(s.entry!.id) : undefined}
                onRemove={s.entry ? () => pipeline.remove(s.entry!.id) : undefined}
                onAdd={s.photoPath ? () => setAddingTo(s.photoPath) : undefined}
                onEdit={setEditing}
                onDelete={remove}
                onToggleSentimental={toggleSentimental}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-4">
          <Button
            size="lg"
            className="w-full"
            onClick={calculate}
            disabled={calculating || itemCount === 0 || pipeline.busy}
          >
            {calculating ? <Loader2 className="animate-spin" /> : <Calculator />}
            {calculating ? "Calculating…" : pipeline.busy ? "Analyzing photos…" : "Calculate"}
          </Button>
          {hasReport ? (
            <Button asChild variant="link" size="sm">
              <Link href={`/move/${moveId}/report`}>View last report</Link>
            </Button>
          ) : null}
        </div>
      </div>

      <ItemEditSheet
        item={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={(saved) => {
          setItems((items) => items.map((i) => (i.id === saved.id ? saved : i)));
          setEditing(null);
          changed();
          toast.success("Saved");
        }}
      />
      <AddItemSheet
        moveId={moveId}
        photoPath={addingTo}
        onOpenChange={(open) => !open && setAddingTo(null)}
        onAdded={(item) => {
          setItems((items) => [...items, item]);
          setAddingTo(null);
          changed();
          toast.success("Item added");
        }}
      />
    </div>
  );
}
