"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import type { CheckoutPlan, MoveSummary } from "@/types";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { PASS_PRICE, PRO_PRICE, priceShare } from "@/client/money";
import { usd } from "@/client/utils";
import { Button } from "@/components/ui/button";

/**
 * Plans: Move Pass ($29) and Move Pro ($79), both via POST /api/checkout → Stripe.
 * The ROI line frames the price as a share of the cash the plan frees up.
 */
export function Paywall({
  moveId,
  lockedCount,
  summary,
  cash: cashOverride,
}: {
  moveId: string;
  lockedCount: number;
  summary: MoveSummary | null;
  /** v2: plan.freedCash when the server sends a plan; otherwise summary.totalSavings. */
  cash?: number;
}) {
  const { busy, error, start } = useCheckout(moveId);
  const cash = cashOverride ?? summary?.totalSavings ?? 0;
  const share = priceShare(PASS_PRICE, cash);
  const unlock = () => start("pass");

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
            <Check className="mt-0.5 size-4 shrink-0 text-primary" /> Which items get you a smaller truck, and when to list each
          </li>
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
        <Button size="lg" className="mt-4 h-auto min-h-12 w-full whitespace-normal" onClick={unlock} disabled={!!busy}>
          {busy === "pass" ? <Loader2 className="animate-spin" /> : null}
          Unlock full report & listings — {usd.format(PASS_PRICE)}
        </Button>
        <p className="mt-2 text-center text-xs text-muted-foreground">One-time payment per move. Secure checkout by Stripe.</p>
      </div>

      <ProCard price={PRO_PRICE} busy={busy === "pro"} disabled={!!busy} onBuy={() => start("pro")} />
    </section>
  );
}

const PRO_FEATURES = [
  "Move budget by date — how much cash to set aside so nothing goes on a credit card",
  "Mover check — USDOT lookup and the federal red flags for rogue movers",
  "Home inventory with replacement values — print or save as PDF for insurance",
];

/** Shared Stripe redirect for both plans. */
function useCheckout(moveId: string) {
  const [busy, setBusy] = useState<CheckoutPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  // «Назад» из Stripe: браузер достаёт страницу из bfcache вместе со спиннером — сбрасываем.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const start = async (plan: CheckoutPlan) => {
    setBusy(plan);
    setError(null);
    try {
      const { url } = await api.checkout(moveId, plan);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, { network: "Couldn't open checkout. Please try again." }));
      setBusy(null);
    }
  };
  return { busy, error, start };
}

function ProCard({
  price,
  label,
  note,
  busy,
  disabled,
  onBuy,
}: {
  price: number;
  label?: string;
  note?: string;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-amber-500" /> Move Pro
        </p>
        <p className="text-2xl font-bold tabular-nums">
          {usd.format(price)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">{note ?? "one-time"}</span>
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Everything in Move Pass, plus:</p>
      <ul className="mt-2 space-y-2 text-sm">
        {PRO_FEATURES.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-amber-500" /> {f}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="lg"
        className="mt-4 h-auto min-h-12 w-full whitespace-normal"
        onClick={onBuy}
        disabled={disabled}
      >
        {busy ? <Loader2 className="animate-spin" /> : null}
        {label ?? `Get Move Pro — ${usd.format(price)}`}
      </Button>
    </div>
  );
}

/** Shown after Move Pass is paid: upgrade for the price difference. */
export function UpgradeToPro({ moveId }: { moveId: string }) {
  const { busy, error, start } = useCheckout(moveId);
  const diff = PRO_PRICE - PASS_PRICE;
  return (
    <section className="space-y-2">
      <ProCard
        price={diff}
        note="upgrade"
        label={`Upgrade to Move Pro — ${usd.format(diff)}`}
        busy={busy === "pro"}
        disabled={!!busy}
        onBuy={() => start("pro")}
      />
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
