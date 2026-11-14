"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink, Printer, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import type { Estimate, Item, MoveDetails, MovePlan, PlanAction } from "@/types";
import { CATEGORY_LABEL, MOVE_TYPE_LABEL, formatMoveDate } from "@/client/labels";
import { usd } from "@/client/utils";
import { useMoveDetails } from "@/hooks/useMoveDetails";
import { PageTitle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { UpgradeToPro, Paywall } from "@/components/Paywall";

/** Move Pro toolkit: budget by date, mover check, home inventory. Only for tier "pro". */
export function ProScreen() {
  const { id: moveId } = useParams<{ id: string }>();
  const { details, error, reload, refreshPhotos } = useMoveDetails(moveId);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!details) return <LoadingState rows={4} />;

  const route = [details.fromCity ?? details.move.fromZip, details.toCity ?? details.move.toZip].join(" → ");
  const back = (
    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-1 text-muted-foreground print:hidden">
      <Link href={`/move/${moveId}/report`}>
        <ArrowLeft /> Back to report
      </Link>
    </Button>
  );

  if (details.tier !== "pro") {
    return (
      <div className="space-y-6">
        {back}
        <PageTitle title="Move Pro" subtitle="Budget by date, mover check and a home inventory for insurance." />
        {details.tier === "pass" ? (
          <UpgradeToPro moveId={moveId} />
        ) : details.summary ? (
          <Paywall moveId={moveId} lockedCount={details.lockedItemIds.length} summary={details.summary} cash={details.plan?.freedCash} />
        ) : (
          <p className="text-sm text-muted-foreground">Add your items and calculate the plan first.</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        {back}
        <PageTitle
          title="Move Pro"
          subtitle={`${route} · ${MOVE_TYPE_LABEL[details.move.moveType]} · ${formatMoveDate(details.move.moveDate)}`}
        />
      </div>
      {details.plan ? <BudgetByDate plan={details.plan} moveDate={details.move.moveDate} /> : null}
      <MoverCheck moveType={details.move.moveType} />
      <Inventory details={details} onPhotoError={refreshPhotos} />
    </div>
  );
}

/* ---------------- Budget by date ---------------- */

const DAY = 86_400_000;
const dayFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}
const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
};

interface Step {
  date: string;
  label: string;
  detail: string;
  amount: number; // + in, − out
}

/** Cash in from sales (by sellBy), then move day, week 1 and month 1 — with a running balance. */
export function budgetSteps(plan: MovePlan, moveDate: string): Step[] {
  const sales = new Map<string, { sum: number; n: number }>();
  for (const p of plan.items) {
    if ((p.action === "sell" || p.action === "sell_buy_later") && p.expectedResale > 0) {
      const by = p.sellBy ?? addDays(moveDate, -7);
      const cur = sales.get(by) ?? { sum: 0, n: 0 };
      sales.set(by, { sum: cur.sum + p.expectedResale, n: cur.n + 1 });
    }
  }
  const steps: Step[] = [...sales.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, n }]) => ({
      date,
      label: "Sales come in",
      detail: `${n} item${n === 1 ? "" : "s"} sold by this date (expected)`,
      amount: Math.round(sum),
    }));
  steps.push({ date: moveDate, label: "Moving day", detail: plan.vehicle, amount: -plan.cashMoveDay });
  if (plan.cashWeek1 > 0)
    steps.push({ date: addDays(moveDate, 7), label: "Week 1", detail: "Bed & essentials", amount: -plan.cashWeek1 });
  if (plan.cashMonth1 > 0)
    steps.push({ date: addDays(moveDate, 30), label: "Month 1", detail: "The rest, used or new", amount: -plan.cashMonth1 });
  return steps;
}

function BudgetByDate({ plan, moveDate }: { plan: MovePlan; moveDate: string }) {
  const steps = budgetSteps(plan, moveDate);
  // Нарастающий остаток без переприсваивания переменных в рендере (правило react-hooks/immutability).
  const rows = steps.reduce<(Step & { balance: number })[]>((acc, s) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].balance : 0;
    acc.push({ ...s, balance: prev + s.amount });
    return acc;
  }, []);
  const setAside = -Math.min(0, ...rows.map((r) => r.balance));
  const firstOut = steps.find((s) => s.amount < 0)?.date ?? moveDate;

  return (
    <section className="space-y-3">
      <SectionTitle icon={<Wallet className="size-4" />} title="Move budget by date" />
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">To keep this move off your credit card, set aside</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{usd.format(setAside)}</p>
        <p className="text-sm text-muted-foreground">
          by {fmtDay(firstOut)}
          {plan.cashBeforeMove > 0 ? ` — your sales cover ${usd.format(plan.cashBeforeMove)} of it before you go.` : "."}
        </p>
        <ol className="mt-4 divide-y text-sm">
          {rows.map((r, i) => (
            <li key={`${r.date}-${i}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{fmtDay(r.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{r.detail}</span>
              </span>
              <span className="text-right tabular-nums">
                <span className={r.amount >= 0 ? "block font-semibold text-sell" : "block font-semibold"}>
                  {r.amount >= 0 ? "+" : "−"}
                  {usd.format(Math.abs(r.amount))}
                </span>
                <span className="block text-xs text-muted-foreground">
                  balance {r.balance < 0 ? "−" : ""}
                  {usd.format(Math.abs(r.balance))}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Sales are expected values (price × chance to sell in time). Shipping everything would cost{" "}
          {usd.format(plan.shipAllCost)} on moving day.
        </p>
      </div>
    </section>
  );
}

/* ---------------- Mover check ---------------- */

const FMCSA = {
  protect: "https://www.fmcsa.dot.gov/protect-your-move",
  search: "https://www.fmcsa.dot.gov/protect-your-move/search-mover",
  complaint: "https://www.fmcsa.dot.gov/protect-your-move/file-a-complaint",
};
const saferLookup = (dot: string) =>
  `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(dot)}`;

const RED_FLAGS = [
  "No USDOT number, or it shows as inactive on FMCSA",
  "A quote by phone or email without seeing your stuff (in person or by video)",
  "A big cash deposit before they load anything",
  "Blank or incomplete paperwork they want you to sign",
  "The price goes up after your things are on the truck",
  "An unmarked rental truck and no real business address",
];

function MoverCheck({ moveType }: { moveType: MoveDetails["move"]["moveType"] }) {
  const [dot, setDot] = useState("");
  const valid = /^\d{4,8}$/.test(dot.trim());
  return (
    <section className="space-y-3 print:hidden">
      <SectionTitle icon={<ShieldCheck className="size-4" />} title="Mover check" />
      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        {moveType === "diy_truck" ? (
          <p className="text-sm text-muted-foreground">
            You&apos;re driving the truck yourself — use this only if you hire loaders or switch to movers.
          </p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="usdot" className="text-sm font-medium">
            Mover&apos;s USDOT number
          </label>
          <div className="flex gap-2">
            <Input
              id="usdot"
              inputMode="numeric"
              placeholder="e.g. 125563"
              value={dot}
              onChange={(e) => setDot(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
            <Button asChild={valid} disabled={!valid} className="shrink-0">
              {valid ? (
                <a href={saferLookup(dot.trim())} target="_blank" rel="noopener noreferrer">
                  Check <ExternalLink />
                </a>
              ) : (
                <span>Check</span>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Opens the official FMCSA record: is the company active, insured and allowed to move household goods across
            state lines.
          </p>
        </div>
        <div>
          <p className="text-sm font-medium">Walk away if you see</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {RED_FLAGS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <a className="underline underline-offset-4" href={FMCSA.search} target="_blank" rel="noopener noreferrer">
            Search movers on FMCSA
          </a>
          <a className="underline underline-offset-4" href={FMCSA.protect} target="_blank" rel="noopener noreferrer">
            Protect Your Move (FMCSA)
          </a>
          <a className="underline underline-offset-4" href={FMCSA.complaint} target="_blank" rel="noopener noreferrer">
            File a complaint
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Home inventory ---------------- */

const ACTION_LABEL: Record<PlanAction, string> = {
  ship: "Ship",
  sell: "Sell",
  sell_buy_later: "Sell",
  donate: "Donate",
};

function Inventory({ details, onPhotoError }: { details: MoveDetails; onPhotoError: () => void }) {
  const rows = useMemo(() => {
    const est = new Map<string, Estimate>(details.estimates.map((e) => [e.itemId, e]));
    const act = new Map((details.plan?.items ?? []).map((p) => [p.itemId, p.action]));
    return details.items.map((item: Item) => ({ item, est: est.get(item.id), action: act.get(item.id) }));
  }, [details]);
  const totalValue = rows.reduce((s, r) => s + (r.est?.replaceCost ?? 0), 0);
  const totalWeight = rows.reduce((s, r) => s + r.item.weightLb, 0);
  const shippedValue = rows.filter((r) => r.action === "ship").reduce((s, r) => s + (r.est?.replaceCost ?? 0), 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle icon={<Sparkles className="size-4" />} title="Home inventory" />
        <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
          <Printer /> Print / Save PDF
        </Button>
      </div>
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Items" value={String(rows.length)} />
          <Stat label="Weight" value={`${Math.round(totalWeight).toLocaleString("en-US")} lb`} />
          <Stat label="Replacement value" value={usd.format(totalValue)} />
        </div>
        {shippedValue > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Items you ship are worth {usd.format(shippedValue)} to replace — use this figure when you choose your
            mover&apos;s valuation coverage, and keep this list for your renters or homeowners insurance.
          </p>
        ) : null}
        <ul className="mt-4 divide-y">
          {rows.map(({ item, est, action }) => (
            <li key={item.id} className="flex gap-3 py-3 text-sm break-inside-avoid">
              {details.photoUrls[item.photoPath] ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL, short TTL
                <img
                  src={details.photoUrls[item.photoPath]}
                  alt=""
                  className="size-14 shrink-0 rounded-md object-cover"
                  onError={onPhotoError}
                />
              ) : (
                <div className="size-14 shrink-0 rounded-md bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.name}
                  {action ? <span className="ml-2 text-xs font-normal text-muted-foreground">· {ACTION_LABEL[action]}</span> : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[CATEGORY_LABEL[item.category], item.brand, item.material, `condition ${item.condition}/5`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(item.widthIn)}×{Math.round(item.depthIn)}×{Math.round(item.heightIn)} in ·{" "}
                  {Math.round(item.weightLb)} lb
                </p>
              </div>
              <p className="shrink-0 text-right font-semibold tabular-nums">
                {est ? usd.format(est.replaceCost) : "—"}
                <span className="block text-xs font-normal text-muted-foreground">to replace</span>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Values are estimated replacement costs in {details.toCity ?? "your new city"}. Keep receipts and serial numbers
          with this list.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span className="text-amber-500">{icon}</span> {title}
    </h2>
  );
}
