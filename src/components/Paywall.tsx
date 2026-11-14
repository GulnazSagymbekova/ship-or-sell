"use client";

import { useState } from "react";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import type { MoveSummary } from "@/types";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { PASS_PRICE, PRO_PRICE, priceShare } from "@/client/money";
import { usd } from "@/client/utils";
import { Button } from "@/components/ui/button";

/**
 * Plans: Move Pass ($29, live via POST /api/checkout → Stripe) and Move Pro ($79, coming soon).
 * The ROI line frames the price as a share of the cash the plan frees up.
 */
export function Paywall({
  moveId,
  lockedCount,
  summary,
}: {
  moveId: string;
  lockedCount: number;
  summary: MoveSummary | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cash = summary?.totalSavings ?? 0;
  const share = priceShare(PASS_PRICE, cash);

  const unlock = async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.checkout(moveId);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, { network: "Couldn't open checkout. Please try again." }));
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-center text-sm font-medium">
        {share !== null ? (
          <>
            {usd.format(PASS_PRICE)} is {share}% of the {usd.format(cash)} you&apos;ll free up
          </>
        ) : cash > 0 ? (
          <>Your plan frees up {usd.format(cash)} — you probably don&apos;t need the paid plan.</>
        ) : (
          <>Selling won&apos;t free up cash on this move — you probably don&apos;t need the paid plan.</>
        )}
      </p>

      <div className="rounded-2xl border-2 border-primary bg-card p-5 shadow-sm">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold text-primary">
            <Lock className="size-4" /> Move Pass
          </p>
          <p className="text-2xl font-bold tabular-nums">
            {usd.format(PASS_PRICE)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">one-time</span>
          </p>
        </div>
        <ul className="mt-3 space-y-2 text-sm">
          {lockedCount > 0 ? (
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-primary" /> Numbers for {lockedCount} more item
              {lockedCount === 1 ? "" : "s"}
            </li>
          ) : null}
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" /> Ready-to-post Facebook Marketplace listings
          </li>
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" /> Price-drop plan so everything sells before move day
          </li>
        </ul>
        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal" onClick={unlock} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Unlock full report & listings — {usd.format(PASS_PRICE)}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">One-time payment per move. Secure checkout by Stripe.</p>
      </div>

      <div className="rounded-2xl border border-dashed bg-card/60 p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-amber-500" /> Move Pro
          </p>
          <p className="text-xl font-bold text-muted-foreground tabular-nums">{usd.format(PRO_PRICE)}</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Everything in Move Pass, plus a mover scam check (FMCSA), a debt-free move budget by date and a home
          inventory for insurance.
        </p>
        <Button variant="outline" className="mt-3 w-full" disabled>
          Coming soon
        </Button>
      </div>
    </section>
  );
}
