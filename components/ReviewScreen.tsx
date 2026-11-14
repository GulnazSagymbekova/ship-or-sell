"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Calculator, ImageOff, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Item } from "@/types";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { clearStale, isStale, markStale } from "@/lib/staleReport";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { AddItemSheet } from "@/components/AddItemSheet";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ItemCard } from "@/components/ItemCard";
import { ItemEditSheet } from "@/components/ItemEditSheet";
import { LoadingState } from "@/components/LoadingState";

export function ReviewScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const router = useRouter();
  const { details, setDetails, error, reload, refreshPhotos } = useMoveDetails(moveId);
  const [editing, setEditing] = useState<Item | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [stale, setStale] = useState(() => (typeof window === "undefined" ? false : isStale(moveId)));

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const item of details?.items ?? []) {
      const list = m.get(item.photoPath) ?? [];
      list.push(item);
      m.set(item.photoPath, list);
    }
    return [...m.entries()];
  }, [details]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!details) return <LoadingState rows={3} />;

  const setItems = (fn: (items: Item[]) => Item[]) =>
    setDetails((d) => (d ? { ...d, items: fn(d.items) } : d));

  const changed = () => {
    markStale(moveId);
    setStale(true);
  };

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

  const hasReport = details.summary !== null && !stale;

  return (
    <div className="pb-28">
      <PageTitle
        title="Check your items"
        subtitle={`${details.items.length} item${details.items.length === 1 ? "" : "s"} found. Fix names, sizes or anything we got wrong.`}
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={<ImageOff className="size-8 text-muted-foreground" aria-hidden />}
          title="No items yet"
          description="Upload a few photos and we'll find your furniture."
          action={
            <Button asChild size="lg">
              <Link href={`/move/${moveId}/upload`}>Add photos</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([photoPath, items]) => (
            <section key={photoPath} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from storage */}
              <img
                src={details.photoUrls[photoPath]}
                alt=""
                onError={refreshPhotos}
                className="aspect-[4/3] w-full bg-muted object-cover"
              />
              <div className="space-y-2 p-3">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} onEdit={() => setEditing(item)} onDelete={() => remove(item)} />
                ))}
                <Button variant="ghost" className="w-full text-primary" onClick={() => setAddingTo(photoPath)}>
                  <Plus /> Add missing item
                </Button>
              </div>
            </section>
          ))}
          <Button asChild variant="outline" className="w-full">
            <Link href={`/move/${moveId}/upload`}>
              <Plus /> Add more photos
            </Link>
          </Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-4">
          <Button size="lg" className="w-full" onClick={calculate} disabled={calculating || details.items.length === 0}>
            {calculating ? <Loader2 className="animate-spin" /> : <Calculator />}
            {calculating ? "Calculating…" : "Calculate"}
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
