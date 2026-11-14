import { Heart, Lock } from "lucide-react";
import type { Estimate, Item } from "@/types";
import { CATEGORY_LABEL } from "@/lib/labels";
import { explain } from "@/lib/explain";
import { cn, usd } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DecisionBadge } from "@/components/DecisionBadge";

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
  onPhotoError,
}: {
  item: Item;
  estimate: Estimate;
  photoUrl?: string;
  toCity: string | null;
  locked: boolean;
  onPhotoError?: () => void;
}) {
  const verdict = item.sentimental ? "SHIP" : estimate.verdict;
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

      <p className={cn("mt-2 text-sm", locked ? "text-muted-foreground italic" : "text-foreground/80")}>
        {explain(item, estimate, toCity, locked)}
      </p>
    </article>
  );
}
