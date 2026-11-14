"use client";

import { useEffect, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Tag } from "lucide-react";
import { toast } from "sonner";
import type { Estimate, Item, PlanAction, PlanItem } from "@/types";
import { isStale } from "@/client/staleReport";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/AppShell";
import { DeleteMoveButton } from "@/components/DeleteMoveButton";
import { ErrorState } from "@/components/ErrorState";
import { EstimateCard } from "@/components/EstimateCard";
import { LoadingState } from "@/components/LoadingState";
import { Paywall } from "@/components/Paywall";
import { PlanCard, SmartMoveCard } from "@/components/PlanCard";
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
  const plan = details.plan ?? null;
  const cash = plan ? plan.freedCash : details.summary.totalSavings;
  const route = [details.fromCity ?? details.move.fromZip, details.toCity ?? details.move.toZip].join(" → ");

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1 text-muted-foreground">
          <Link href={`/move/${moveId}`}>
            <ArrowLeft /> Edit items
          </Link>
        </Button>
        <PageTitle title={plan ? "Your move plan" : "Your report"} subtitle={route} />
        {plan ? <PlanCard plan={plan} /> : <SummaryCard summary={details.summary} />}
      </div>

      {plan ? <SmartMoveCard plan={plan} paid={paid} /> : null}

      {paid ? (
        <Button asChild size="lg" className="w-full">
          <Link href={`/move/${moveId}/listings`}>
            <Tag /> Get Marketplace listings
          </Link>
        </Button>
      ) : null}

      {plan ? (
        <PlanGroups
          rows={rows}
          planItems={plan.items}
          paywall={
            !paid && details.lockedItemIds.length > 0 ? (
              <Paywall moveId={moveId} lockedCount={details.lockedItemIds.length} summary={details.summary} cash={cash} />
            ) : null
          }
          card={(r) => (
            <EstimateCard
              item={r.item}
              estimate={r.e}
              photoUrl={details.photoUrls[r.item.photoPath]}
              toCity={details.toCity}
              locked={r.locked}
              planItem={r.planItem}
              onPhotoError={refreshPhotos}
            />
          )}
        />
      ) : (
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
      )}

      {!paid && details.lockedItemIds.length === 0 ? (
        <Paywall moveId={moveId} lockedCount={0} summary={details.summary} cash={cash} />
      ) : null}

      <div className="flex justify-center border-t pt-4">
        <DeleteMoveButton moveId={moveId} />
      </div>
    </div>
  );
}

type Row = { e: Estimate; item: Item; locked: boolean };

const GROUPS: { action: PlanAction; title: string; hint: string }[] = [
  { action: "sell", title: "Sell before you move", hint: "Rebuy in week 1 — you'll need these right away" },
  { action: "sell_buy_later", title: "Sell now, buy later", hint: "Rebuy used in your new city within a month" },
  { action: "donate", title: "Donate", hint: "Not worth the time to list" },
  { action: "ship", title: "Ship", hint: "Cheaper to bring than to replace" },
];

/** v2 report body: items grouped by what the plan says to do; locked items last, behind the paywall. */
function PlanGroups({
  rows,
  planItems,
  paywall,
  card,
}: {
  rows: Row[];
  planItems: PlanItem[];
  paywall: ReactNode;
  card: (r: Row & { planItem?: PlanItem }) => ReactNode;
}) {
  const byId = new Map(planItems.map((p) => [p.itemId, p]));
  const open = rows.filter((r) => !r.locked && byId.has(r.item.id));
  const locked = rows.filter((r) => r.locked || !byId.has(r.item.id));

  return (
    <div className="space-y-6">
      {GROUPS.map((g) => {
        const list = open.filter((r) => byId.get(r.item.id)!.action === g.action);
        if (list.length === 0) return null;
        return (
          <section key={g.action} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold">
                {g.title} <span className="font-normal text-muted-foreground">· {list.length}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{g.hint}</p>
            </div>
            {list.map((r) => (
              <div key={r.item.id}>{card({ ...r, planItem: byId.get(r.item.id) })}</div>
            ))}
          </section>
        );
      })}
      {locked.length > 0 ? (
        <section className="space-y-3">
          {paywall}
          <h2 className="text-sm font-semibold">
            More items <span className="font-normal text-muted-foreground">· {locked.length}</span>
          </h2>
          {locked.map((r) => (
            <div key={r.item.id}>{card(r)}</div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
