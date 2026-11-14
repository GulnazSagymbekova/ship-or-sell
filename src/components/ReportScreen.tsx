"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Tag } from "lucide-react";
import { toast } from "sonner";
import type { Estimate, Item } from "@/types";
import { isStale } from "@/client/staleReport";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { DeleteMoveButton } from "@/components/DeleteMoveButton";
import { ErrorState } from "@/components/ErrorState";
import { EstimateCard } from "@/components/EstimateCard";
import { LoadingState } from "@/components/LoadingState";
import { Paywall } from "@/components/Paywall";
import { SummaryCard } from "@/components/SummaryCard";

export function ReportScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const router = useRouter();
  const { details, error, reload, refreshPhotos } = useMoveDetails(moveId);

  // No estimates yet, or items changed since the last Calculate → back to review.
  const mustRecalculate = !!details && (details.summary === null || isStale(moveId));
  useEffect(() => {
    if (!mustRecalculate) return;
    toast.info("Your items changed — tap Calculate to update the report.");
    router.replace(`/move/${moveId}`);
  }, [mustRecalculate, moveId, router]);

  const rows = useMemo(() => {
    if (!details) return [];
    const items = new Map(details.items.map((i) => [i.id, i]));
    const locked = new Set(details.lockedItemIds);
    return details.estimates
      .map((e) => ({ e, item: items.get(e.itemId), locked: locked.has(e.itemId) }))
      .filter((r): r is { e: Estimate; item: Item; locked: boolean } => !!r.item)
      .sort((a, b) => Number(a.locked) - Number(b.locked) || b.e.savings - a.e.savings);
  }, [details]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!details || mustRecalculate || !details.summary) return <LoadingState rows={4} />;

  const paid = details.move.status === "paid";
  const route = [details.fromCity ?? details.move.fromZip, details.toCity ?? details.move.toZip].join(" → ");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1 text-muted-foreground">
          <Link href={`/move/${moveId}`}>
            <ArrowLeft /> Edit items
          </Link>
        </Button>
        <PageTitle title="Your report" subtitle={route} />
        <SummaryCard summary={details.summary} />
      </div>

      {paid ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/move/${moveId}/listings`}>
            <Tag /> Get Marketplace listings
          </Link>
        </Button>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Item by item</h2>
        {rows.map(({ e, item, locked }, i) => (
          <div key={item.id}>
            {!paid && locked && (i === 0 || !rows[i - 1].locked) ? (
              <div className="mb-3">
                <Paywall moveId={moveId} lockedCount={details.lockedItemIds.length} summary={details.summary} />
              </div>
            ) : null}
            <EstimateCard
              item={item}
              estimate={e}
              photoUrl={details.photoUrls[item.photoPath]}
              toCity={details.toCity}
              locked={locked}
              onPhotoError={refreshPhotos}
            />
          </div>
        ))}
      </section>

      {!paid && details.lockedItemIds.length === 0 ? <Paywall moveId={moveId} lockedCount={0} summary={details.summary} /> : null}

      <div className="flex justify-center border-t pt-4">
        <DeleteMoveButton moveId={moveId} />
      </div>
    </div>
  );
}
