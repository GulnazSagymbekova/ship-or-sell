import Link from "next/link";
import { ArrowRight, Camera, Check, Home, Scale, Sparkles, Tag, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PASS_PRICE, PRO_PRICE } from "@/client/money";
import { usd } from "@/client/utils";
import { HOME_PLUS_PRICE_CENTS, HOME_PLUS_TRIAL_DAYS } from "@/lib/homeplus";

const STEPS = [
  { icon: Camera, title: "Snap your rooms", text: "One photo can hold several pieces. AI lists each one with size, material and condition." },
  { icon: Truck, title: "Get your move plan", text: "We price the truck you actually need and check if selling a few pieces gets you a smaller one." },
  { icon: Scale, title: "Ship, sell or your call", text: "Per item: cost to move vs. what it sells for vs. buying it again in your new city." },
  { icon: Tag, title: "List it in a minute", text: "Ready-to-paste Facebook Marketplace listings with a price-drop plan before move day." },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "",
    features: ["AI item recognition", "Ship / sell verdict for every item", "Your move plan and cash summary", "Full numbers for your top 3 items"],
  },
  {
    name: "Move Pass",
    price: usd.format(PASS_PRICE),
    note: "one-time, per move",
    features: ["Numbers for every item", "Which items get you a smaller truck", "Marketplace listings with price-drop plan"],
  },
  {
    name: "Move Pro",
    price: usd.format(PRO_PRICE),
    note: "one-time, per move",
    features: ["Everything in Move Pass", "Move budget by date", "Mover check (USDOT red flags)", "Home inventory for insurance"],
  },
];

export default function LandingPage() {
  const homePlus = `$${(HOME_PLUS_PRICE_CENTS / 100).toFixed(2)}`; // usd rounds to whole dollars
  return (
    <AppShell>
      <section className="space-y-6 py-8">
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          Moving out of state? Know what to ship and what to sell.
        </h1>
        <p className="text-lg text-muted-foreground">
          Snap your furniture. We compare the cost to move each piece with what it sells for and what a
          replacement costs in your new city — most people save hundreds.
        </p>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/move/new">
            Get started — it&apos;s free <ArrowRight />
          </Link>
        </Button>
      </section>

      <section className="space-y-4 py-6" aria-labelledby="how">
        <h2 id="how" className="text-xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-xl border bg-card p-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <s.icon className="size-4" />
              </span>
              <span>
                <span className="block font-medium">
                  {i + 1}. {s.title}
                </span>
                <span className="block text-sm text-muted-foreground">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4 py-6" aria-labelledby="pricing">
        <h2 id="pricing" className="text-xl font-semibold tracking-tight">
          Pricing
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <div key={p.name} className="flex flex-col rounded-xl border bg-card p-4">
              <p className="font-semibold">{p.name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {p.price}
                {p.note ? <span className="ml-1 text-xs font-normal text-muted-foreground">{p.note}</span> : null}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex gap-3 rounded-xl border border-dashed bg-card p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Home className="size-4" />
          </span>
          <p className="text-sm">
            <span className="font-medium">
              Home+ — {homePlus}/mo after a {HOME_PLUS_TRIAL_DAYS}-day free trial.
            </span>{" "}
            <span className="text-muted-foreground">
              After the move, keep what you shipped as a home inventory: coverage check against your insurance,
              CSV export for your insurer, cancel anytime.
            </span>
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" /> Payments by Stripe. We remove location data from your photos.
        </p>
      </section>
    </AppShell>
  );
}
