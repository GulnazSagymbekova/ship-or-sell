"use client";

import { useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";

/** Unlock CTA. Payment itself lives in Stripe Checkout (POST /api/checkout → url). */
export function Paywall({ moveId, lockedCount }: { moveId: string; lockedCount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <section className="rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        <Lock className="size-4" />
        <span className="text-sm font-semibold">Full report</span>
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
          <Check className="mt-0.5 size-4 shrink-0 text-primary" /> Quick-sale and max prices for every item
        </li>
      </ul>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal" onClick={unlock} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        Unlock full report & listings — $19
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">One-time payment per move. Secure checkout by Stripe.</p>
    </section>
  );
}
