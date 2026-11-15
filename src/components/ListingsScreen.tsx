"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Tag } from "lucide-react";
import type { Item, Listing } from "@/types";
import { api } from "@/lib/api-client";
import { toApiError, type ApiError } from "@/client/errors";
import { runPool } from "@/client/pool";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { ListingCard } from "@/components/ListingCard";
import { LoadingState } from "@/components/LoadingState";

const GENERATE_CONCURRENCY = 3;

export function ListingsScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const router = useRouter();
  const { details, error, reload, refreshPhotos } = useMoveDetails(moveId);
  const [listings, setListings] = useState<Record<string, Listing>>({});
  const [errors, setErrors] = useState<Record<string, ApiError>>({});
  const started = useRef(new Set<string>());

  const paid = details?.move.status === "paid";

  // SELL first, then TOSSUP; sentimental items are never listed. A SELL item the plan
  // still ships (selling it wouldn't shrink the truck) is shown as "your call", like the report.
  const rows = useMemo(() => {
    if (!details) return [];
    const est = new Map(details.estimates.map((e) => [e.itemId, e]));
    const planned = new Map((details.plan?.items ?? []).map((p) => [p.itemId, p.action]));
    const listable = details.items.filter((i) => {
      const v = est.get(i.id)?.verdict;
      return !i.sentimental && (v === "SELL" || v === "TOSSUP");
    });
    const isSell = (i: Item) => est.get(i.id)?.verdict === "SELL" && planned.get(i.id) !== "ship";
    return [
      ...listable.filter(isSell).map((item) => ({ item, tossup: false })),
      ...listable.filter((i) => !isSell(i)).map((item) => ({ item, tossup: true })),
    ];
  }, [details]);

  const generate = useCallback(
    async (items: Item[]) => {
      await runPool(items, GENERATE_CONCURRENCY, async (item) => {
        try {
          const l = await api.createListing(item.id);
          setListings((m) => ({ ...m, [item.id]: l }));
        } catch (e) {
          const err = toApiError(e);
          if (err.kind === "payment_required") {
            router.replace(`/move/${moveId}/report`);
            return;
          }
          started.current.delete(item.id);
          setErrors((m) => ({ ...m, [item.id]: err }));
        }
      });
    },
    [moveId, router],
  );

  useEffect(() => {
    if (!details) return;
    if (!paid) {
      router.replace(`/move/${moveId}/report`);
      return;
    }
    const existing = Object.fromEntries(details.listings.map((l) => [l.itemId, l]));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed from server data
    setListings((m) => ({ ...existing, ...m }));
    const missing = rows.map((r) => r.item).filter((i) => !existing[i.id] && !started.current.has(i.id));
    missing.forEach((i) => started.current.add(i.id));
    if (missing.length) void generate(missing);
  }, [details, paid, rows, moveId, router, generate]);

  const retry = (item: Item) => {
    setErrors((m) => {
      const next = { ...m };
      delete next[item.id];
      return next;
    });
    started.current.add(item.id);
    void generate([item]);
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!details || !paid) return <LoadingState rows={2} />;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1 text-muted-foreground">
          <Link href={`/move/${moveId}/report`}>
            <ArrowLeft /> Back to report
          </Link>
        </Button>
        <PageTitle
          title="Your Marketplace listings"
          subtitle="Copy a listing, open Marketplace, paste. Add the photo and you're live."
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-8 text-muted-foreground" aria-hidden />}
          title="Nothing to sell"
          description="Your plan ships everything. No listings needed."
          action={
            <Button asChild variant="outline">
              <Link href={`/move/${moveId}/report`}>Back to report</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {rows.map(({ item, tossup }) => (
            <ListingCard
              key={item.id}
              item={item}
              tossup={tossup}
              moveDate={details.move.moveDate}
              sellBy={details.plan?.items.find((p) => p.itemId === item.id)?.sellBy ?? null}
              listing={listings[item.id] ?? null}
              error={errors[item.id] ?? null}
              photoUrl={details.photoUrls[item.photoPath]}
              onRetry={() => retry(item)}
              onPhotoError={refreshPhotos}
            />
          ))}
        </div>
      )}
    </div>
  );
}
