"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RotateCw, Sparkles, Tag } from "lucide-react";
import { api } from "@/lib/api-client";
import { toApiError } from "@/client/errors";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/Confetti";
import { ErrorState } from "@/components/ErrorState";

const POLL_MS = 2000;
const MAX_TRIES = 10;

type State = "checking" | "paid" | "timeout";

/**
 * Stripe redirects here right after checkout, but the webhook that sets
 * status = "paid" is async — so poll GET /api/moves/:id for up to ~20 s.
 */
export function SuccessScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  // Move Pro (or the upgrade): wait until the server counts it, not just status "paid".
  const wantPro = useSearchParams().get("plan") === "pro";
  const [state, setState] = useState<State>("checking");
  const [fatal, setFatal] = useState<unknown>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const check = async () => {
      tries++;
      try {
        const d = await api.getMove(moveId);
        if (cancelled) return;
        const done = wantPro ? d.tier === "pro" : d.move.status === "paid";
        if (done) return setState("paid");
      } catch (e) {
        if (cancelled) return;
        if (toApiError(e).kind === "not_found") return setFatal(e);
        // transient error: keep polling
      }
      if (tries >= MAX_TRIES) setState("timeout");
      else timer = setTimeout(check, POLL_MS);
    };
    void check();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [moveId, round, wantPro]);

  const refresh = useCallback(() => {
    setState("checking");
    setRound((r) => r + 1);
  }, []);

  if (fatal) return <ErrorState error={fatal} />;

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center" aria-live="polite">
      {state === "checking" ? (
        <>
          <Loader2 className="size-12 animate-spin text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold">Confirming your payment…</h1>
          <p className="text-sm text-muted-foreground">This usually takes a few seconds.</p>
        </>
      ) : null}

      {state === "paid" ? (
        <>
          <Confetti />
          <CheckCircle2 className="size-14 text-sell" aria-hidden />
          <h1 className="text-2xl font-semibold">Payment received</h1>
          <p className="text-muted-foreground">
            {wantPro
              ? "Move Pro is on: budget by date, mover check and home inventory, plus your full report and listings."
              : "Your full report and Marketplace listings are unlocked."}
          </p>
          {wantPro ? (
            <Button asChild size="lg" className="w-full">
              <Link href={`/move/${moveId}/pro`}>
                <Sparkles /> Open Move Pro
              </Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant={wantPro ? "outline" : "default"} className="w-full">
            <Link href={`/move/${moveId}/listings`}>
              <Tag /> Get my listings
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/move/${moveId}/report`}>See full report</Link>
          </Button>
        </>
      ) : null}

      {state === "timeout" ? (
        <>
          <Clock className="size-12 text-muted-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold">Payment is processing</h1>
          <p className="text-muted-foreground">Refresh in a minute.</p>
          <Button size="lg" variant="outline" className="w-full" onClick={refresh}>
            <RotateCw /> Refresh
          </Button>
        </>
      ) : null}
    </div>
  );
}
