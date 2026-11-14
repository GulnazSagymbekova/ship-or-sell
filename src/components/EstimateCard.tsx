import { CalendarClock, Heart, Lock } from "lucide-react";
import type { Estimate, Item, PlanItem } from "@/types";
import { CATEGORY_LABEL } from "@/client/labels";
import { explain } from "@/client/explain";
import { cn, usd } from "@/client/utils";
import { Badge } from "@/components/ui/badge";
import { DecisionBadge } from "@/components/DecisionBadge";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => dateFmt.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/60 px-2 py-2 text-center">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function EstimateCard({
  item,
  estimate,
  photoUrl,
  toCity,
  locked,
  planItem,
  onPhotoError,
}: {
  item: Item;
  estimate: Estimate;
  photoUrl?: string;
  toCity: string | null;
  locked: boolean;
  /** v2 plan entry for this item (absent for locked items or when the server has no plan yet). */
  planItem?: PlanItem;
  onPhotoError?: () => void;
}) {
  // The plan has the final say: a SELL that doesn't shrink the vehicle and loses money ships.
  const planned =
    planItem?.action === "ship" && estimate.verdict === "SELL"
      ? "SHIP"
      : planItem && planItem.action !== "ship"
        ? "SELL"
        : estimate.verdict;
  const verdict = item.sentimental ? "SHIP" : planned;
  return (
    <article className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from storage */}
        <img src={photoUrl} alt="" onError={onPhotoError} className="size-16 shrink-0 rounded-lg bg-muted object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-medium">{item.name}</h3>
              <p className="text-sm text-muted-foreground">{CATEGORY_LABEL[item.category]}</p>
            </div>
            <DecisionBadge verdict={verdict} />
          </div>
          {item.sentimental ? (
            <Badge variant="secondary" className="mt-1.5">
              <Heart /> Keeping — sentimental
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="relative mt-3">
        <div
          className={cn("grid grid-cols-3 gap-2", locked && "pointer-events-none blur-sm select-none")}
          aria-hidden={locked}
        >
          <Figure label="Ship" value={locked ? "$000" : usd.format(estimate.shipCost)} />
          <Figure
            label="Sell for"
            value={locked ? "$00–00" : `${usd.format(estimate.resaleLow)}–${usd.format(estimate.resaleHigh)}`}
          />
          <Figure label="Replace" value={locked ? "$000" : usd.format(estimate.replaceCost)} />
        </div>
        {locked ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow-sm">
              <Lock className="size-3.5" /> Locked
            </span>
          </div>
        ) : null}
      </div>

      {planItem && planItem.sellBy && (planItem.action === "sell" || planItem.action === "sell_buy_later") ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-sell/10 px-2.5 py-1.5 text-sm font-medium">
          <CalendarClock className="size-4 shrink-0" />
          List by {shortDate(planItem.sellBy)} · ~{Math.round(planItem.sellChance * 100)}% chance · expect{" "}
          {usd.format(planItem.expectedResale)}
        </p>
      ) : planItem?.action === "donate" ? (
        <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-sm font-medium">Not worth listing — donate it.</p>
      ) : null}

      <p className={cn("mt-2 text-sm", locked ? "text-muted-foreground italic" : "text-foreground/80")}>
        {planItem?.action === "ship" && estimate.verdict === "SELL" && !item.sentimental
          ? "Selling it wouldn't get you a smaller truck, so the truck costs the same either way — ship it and skip buying a replacement."
          : explain(item, estimate, toCity, locked)}
      </p>
    </article>
  );
}
