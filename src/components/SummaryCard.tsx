import { Banknote } from "lucide-react";
import type { MoveSummary } from "@/types";
import { RENT_SOURCE, weeksOfRent } from "@/client/money";
import { usd } from "@/client/utils";

/**
 * Top of the report. The headline is cash, not verdicts: summary.totalSavings is the money
 * the plan keeps in your pocket (sell + rebuy instead of paying to ship), already net of
 * replacements and excluding sentimental items. The figures come straight from the server.
 */
export function SummaryCard({ summary }: { summary: MoveSummary }) {
  const cash = summary.totalSavings;
  const rent = weeksOfRent(cash);

  if (summary.sellCount === 0 || cash <= 0) {
    return (
      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
        <p className="text-sm opacity-80">Your best plan</p>
        <h2 className="mt-1 text-3xl leading-tight font-bold tracking-tight">Ship it all — it&apos;s your cheapest option</h2>
        <p className="mt-3 text-sm opacity-90">
          Moving everything costs {usd.format(summary.shipAllCost)}. Selling wouldn&apos;t leave you with more cash.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
      <p className="flex items-center gap-1.5 text-sm opacity-85">
        <Banknote className="size-4" /> Cash you&apos;ll free up
      </p>
      <h2 className="mt-1 text-[2.5rem] leading-none font-bold tracking-tight tabular-nums">{usd.format(cash)}</h2>
      <p className="mt-2 text-base font-medium">
        by selling {summary.sellCount} item{summary.sellCount === 1 ? "" : "s"} before you move
        {rent ? <> — that&apos;s ≈ {rent} of rent</> : null}.
      </p>
      <p className="mt-1 text-sm opacity-85">Pay for your move with what you sell, not your credit card.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-white/10 p-3">
          <p className="opacity-80">Ship everything</p>
          <p className="text-lg font-semibold tabular-nums line-through decoration-1 opacity-90">
            {usd.format(summary.shipAllCost)}
          </p>
        </div>
        <div className="rounded-lg bg-white/15 p-3">
          <p className="opacity-80">Our plan</p>
          <p className="text-lg font-semibold tabular-nums">{usd.format(summary.optimalCost)}</p>
        </div>
      </div>

      {rent ? (
        <p className="mt-3 text-[11px] opacity-70">
          Rent: US median $1,200/mo,{" "}
          <a href={RENT_SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            {RENT_SOURCE.label}
          </a>
          . Cash is net of buying replacements in your new city.
        </p>
      ) : null}
    </section>
  );
}
