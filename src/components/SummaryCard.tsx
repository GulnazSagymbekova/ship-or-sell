import type { MoveSummary } from "@/types";
import { usd } from "@/client/utils";

export function SummaryCard({ summary }: { summary: MoveSummary }) {
  const headline =
    summary.sellCount > 0
      ? `Sell ${summary.sellCount} item${summary.sellCount === 1 ? "" : "s"}, save ${usd.format(summary.totalSavings)}`
      : "Ship it all — it's your cheapest option";
  return (
    <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-md">
      <p className="text-sm opacity-80">Your best plan</p>
      <h2 className="mt-1 text-3xl leading-tight font-bold tracking-tight">{headline}</h2>
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
    </section>
  );
}
