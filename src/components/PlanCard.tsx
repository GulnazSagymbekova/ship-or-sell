import { ArrowDownRight, ArrowUpRight, Banknote, Lightbulb, Lock, Truck } from "lucide-react";
import type { MovePlan } from "@/types";
import { RENT_SOURCE, weeksOfRent } from "@/client/money";
import { cn, usd } from "@/client/utils";

/** "+$640" / "−$1,180"; zero shows as "$0". */
function signed(n: number, sign: "+" | "−") {
  return n === 0 ? usd.format(0) : `${sign}${usd.format(Math.abs(n))}`;
}

function net(n: number) {
  return n >= 0 ? `+${usd.format(n)}` : `−${usd.format(Math.abs(n))}`;
}

/**
 * Top of the report (v2): the whole-move plan. Headline is cash freed vs. shipping everything,
 * then the vehicle you actually need and a 4-step cash timeline. All figures come from the
 * server's MovePlan; aggregates are shown even before payment (that's the free hook).
 */
export function PlanCard({ plan }: { plan: MovePlan }) {
  const freed = plan.freedCash;
  const rent = weeksOfRent(freed);
  const smaller = plan.vehicle !== plan.vehicleIfShipAll;

  const steps = [
    { label: "Before you move", sub: "what you sell", value: signed(plan.cashBeforeMove, "+"), up: true },
    { label: "Moving day", sub: plan.vehicle, value: signed(plan.cashMoveDay, "−"), up: false },
    { label: "Week 1", sub: "bed & essentials", value: signed(plan.cashWeek1, "−"), up: false },
    { label: "Month 1", sub: "the rest, used or new", value: signed(plan.cashMonth1, "−"), up: false },
  ];

  return (
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
      <p className="flex items-center gap-1.5 text-sm opacity-85">
        <Banknote className="size-4" /> Your move plan
      </p>
      {freed > 0 ? (
        <>
          <h2 className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">{usd.format(freed)}</h2>
          <p className="mt-2 text-base font-medium">
            freed up vs. shipping everything{rent ? <> — that&apos;s ≈ {rent} of rent</> : null}.
          </p>
        </>
      ) : (
        <h2 className="mt-1 text-3xl leading-tight font-bold tracking-tight">Shipping everything is your best plan</h2>
      )}

      <p className="mt-3 flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium">
        <Truck className="size-4 shrink-0" />
        {smaller ? (
          <span>
            {plan.vehicle} <span className="opacity-75">instead of {plan.vehicleIfShipAll}</span>
          </span>
        ) : (
          <span>{plan.vehicle}</span>
        )}
      </p>

      <ol className="mt-4 space-y-1.5 text-sm">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 rounded-lg bg-white/10 px-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              {s.up ? <ArrowUpRight className="size-4 shrink-0" /> : <ArrowDownRight className="size-4 shrink-0 opacity-80" />}
              <span className="min-w-0">
                <span className="font-medium">{s.label}</span>
                <span className="block truncate text-xs opacity-75">{s.sub}</span>
              </span>
            </span>
            <span className="font-semibold tabular-nums">{s.value}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/20 pt-3">
        <span className="text-sm font-medium">Net cost of your move</span>
        <span className="text-right">
          <span className="block text-lg font-bold tabular-nums">{net(plan.netCash)}</span>
          <span className="block text-xs tabular-nums opacity-75">
            vs. {net(plan.netCashIfShipAll)} if you ship everything
          </span>
        </span>
      </div>

      <p className="mt-3 text-sm opacity-90">Pay for your move with what you sell, not your credit card.</p>
      {rent ? (
        <p className="mt-2 text-[11px] opacity-70">
          Rent: US median $1,200/mo,{" "}
          <a href={RENT_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {RENT_SOURCE.label}
          </a>
          . Sales are weighted by the chance each item sells before your move date.
        </p>
      ) : null}
    </section>
  );
}

/** "Smart move" tips (paid), or a locked teaser that points to the paywall. */
export function SmartMoveCard({ plan, paid }: { plan: MovePlan; paid: boolean }) {
  if (paid && plan.tips.length === 0) return null;
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-sm", !paid && "border-dashed")}>
      <p className="flex items-center gap-2 font-semibold">
        {paid ? <Lightbulb className="size-4 text-amber-500" /> : <Lock className="size-4 text-muted-foreground" />}
        Smart move
      </p>
      {paid ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {plan.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          Unlock to see which items get you a smaller truck or one less container, and when to list each one.
        </p>
      )}
    </section>
  );
}
