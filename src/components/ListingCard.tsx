"use client";

import { useState } from "react";
import { CalendarClock, Copy, Download, ExternalLink, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import type { Item, Listing } from "@/types";
import type { ApiError } from "@/client/errors";
import { errorMessage } from "@/client/errors";
import { usd } from "@/client/utils";
import { listingSignature, priceDropPlan } from "@/client/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const MARKETPLACE_URL = "https://www.facebook.com/marketplace/create/item";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy. Long-press the text to copy it.");
  }
}

function withSignature(description: string) {
  return `${description}\n\n${listingSignature()}`;
}

function fullText(l: Listing) {
  return `${l.title}\n\n${withSignature(l.description)}\n\nPrice: ${usd.format(l.priceMax)}`;
}

function PriceDropHint({ listing, moveDate, sellBy }: { listing: Listing; moveDate: string; sellBy?: string | null }) {
  const plan = priceDropPlan(listing.priceQuick, listing.priceMax, moveDate, sellBy);
  if (!plan) return null;
  return (
    <div className="rounded-lg border border-dashed p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden /> Price-drop plan
      </p>
      {plan.daysLeft <= 3 ? (
        <p className="mt-1 text-muted-foreground">
          {plan.daysLeft === 0 ? "You move today" : `${plan.daysLeft} day${plan.daysLeft === 1 ? "" : "s"} to your move`}{" "}
          — list at {usd.format(listing.priceQuick)} so it sells in time.
        </p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {plan.steps.map((s) => (
            <li key={s.label} className="flex justify-between gap-3">
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-medium tabular-nums">{usd.format(s.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };

/** Downloads a signed URL via blob — the `download` attribute is ignored cross-origin. */
async function downloadPhoto(url: string, name: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${name.replace(/[^\w-]+/g, "-").toLowerCase() || "photo"}.${EXT[blob.type] ?? "jpg"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    toast.error("Couldn't download the photo. Please try again.");
  }
}

export function ListingCard({
  item,
  listing,
  error,
  photoUrl,
  tossup,
  moveDate,
  sellBy,
  onRetry,
  onPhotoError,
}: {
  item: Item;
  listing: Listing | null;
  error: ApiError | null;
  photoUrl?: string;
  tossup: boolean;
  moveDate: string;
  /** v2 plan's sellBy for this item, if the server sent a plan. */
  sellBy?: string | null;
  onRetry: () => void;
  onPhotoError?: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL from storage */}
        <img src={photoUrl} alt="" onError={onPhotoError} className="aspect-[4/3] w-full bg-muted object-cover" />
        {photoUrl ? (
          <Button
            size="sm"
            variant="secondary"
            className="absolute right-2 bottom-2 h-10 shadow"
            disabled={downloading}
            onClick={async () => {
              setDownloading(true);
              await downloadPhoto(photoUrl, item.name);
              setDownloading(false);
            }}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />} Download photo
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 p-4">
        {tossup ? (
          <p className="rounded-lg bg-tossup/10 px-3 py-2 text-xs text-muted-foreground">
            Your call — listing ready if you decide to sell
          </p>
        ) : null}

        {listing ? (
          <>
            <h3 className="text-lg leading-snug font-semibold">{listing.title}</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Quick sale</p>
                <p className="font-semibold tabular-nums">{usd.format(listing.priceQuick)}</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-2.5">
                <p className="text-xs text-muted-foreground">Max</p>
                <p className="font-semibold tabular-nums">{usd.format(listing.priceMax)}</p>
              </div>
            </div>
            <PriceDropHint listing={listing} moveDate={moveDate} sellBy={sellBy} />
            <p className="text-sm whitespace-pre-line text-foreground/80">{listing.description}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => copy(listing.title)}>
                <Copy /> Copy title
              </Button>
              <Button variant="outline" onClick={() => copy(withSignature(listing.description))}>
                <Copy /> Copy description
              </Button>
              <Button variant="secondary" className="col-span-2" onClick={() => copy(fullText(listing))}>
                <Copy /> Copy all
              </Button>
              <Button asChild className="col-span-2">
                <a href={MARKETPLACE_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink /> Open Marketplace
                </a>
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Copied text ends with a short &ldquo;Priced with Ship-or-Sell&rdquo; line. Delete it if you like.
            </p>
          </>
        ) : error ? (
          <div className="space-y-3">
            <p className="font-medium">{item.name}</p>
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(error, { network: "Couldn't write this listing." })}
            </p>
            <Button variant="outline" className="w-full" onClick={onRetry}>
              <RotateCw /> Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-3" role="status" aria-label="Writing listing">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Writing a listing for {item.name}…
            </p>
            <Skeleton className="h-6 w-3/4" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        )}
      </div>
    </article>
  );
}
