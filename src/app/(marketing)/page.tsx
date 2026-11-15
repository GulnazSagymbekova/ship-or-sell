import Link from "next/link";
import { ArrowRight, Camera, Check, Home, Scale, ShieldCheck, Sparkles, Tag, Truck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { PASS_PRICE, PRO_PRICE } from "@/client/money";
import { cn, usd } from "@/client/utils";
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
    featured: false,
    features: ["AI item recognition", "Ship / sell verdict for every item", "Your move plan and cash summary", "Full numbers for your top 3 items"],
  },
  {
    name: "Move Pass",
    price: usd.format(PASS_PRICE),
    note: "one-time, per move",
    featured: true,
    features: ["Numbers for every item", "Which items get you a smaller truck", "Marketplace listings with price-drop plan"],
  },
  {
    name: "Move Pro",
    price: usd.format(PRO_PRICE),
    note: "one-time, per move",
    featured: false,
    features: ["Everything in Move Pass", "Move budget by date", "Mover check (USDOT red flags)", "Home inventory for insurance"],
  },
];

/** Static illustration for the hero, labelled as an example (not anyone's real data). */
const EXAMPLE = [
  { name: "Sofa", tag: "Sell", className: "bg-sell text-white", note: "list by Nov 28 · ~$140" },
  { name: "Dresser", tag: "Sell", className: "bg-sell text-white", note: "list by Nov 28 · ~$90" },
  { name: "Oak dining table", tag: "Ship", className: "bg-ship text-white", note: "replacing it costs $1,040" },
  { name: "Area rug", tag: "Your call", className: "bg-tossup/15 text-foreground", note: "about the same either way" },
];

function ExamplePlan() {
  return (
    <div className="mx-auto w-full max-w-md" aria-label="Example move plan">
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground shadow-xl">
        <p className="text-xs tracking-wide uppercase opacity-75">Example plan · New York → Austin</p>
        <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums">$850</p>
        <p className="text-sm opacity-90">freed up vs. shipping everything</p>
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium">
          <Truck className="size-4" /> 10 ft truck <span className="opacity-75">instead of 15 ft</span>
        </p>
      </div>
      <ul className="mx-4 -mt-3 space-y-1 rounded-2xl border bg-card p-3 shadow-lg">
        {EXAMPLE.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{r.name}</span>
              <span className="block text-xs text-muted-foreground">{r.note}</span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase", r.className)}>
              {r.tag}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LandingPage() {
  const homePlus = `$${(HOME_PLUS_PRICE_CENTS / 100).toFixed(2)}`; // usd rounds to whole dollars
  return (
    <AppShell bare>
      <section className="border-b bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" /> AI furniture recognition · real moving math
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Moving out of state? Know what to ship and what to sell.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Snap your furniture. We compare the cost to move each piece with what it sells for and what a
              replacement costs in your new city — then plan the smallest truck you actually need.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link href="/move/new">
                  Get started — it&apos;s free <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
                <a href="#how">How it works</a>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">No sign-up. Your first plan is free.</p>
          </div>
          <ExamplePlan />
        </div>
      </section>

      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 space-y-6 px-4 py-14 sm:px-6" aria-labelledby="how-title">
        <div className="space-y-2">
          <h2 id="how-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <p className="text-muted-foreground">From photos to a plan in a couple of minutes.</p>
        </div>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border bg-card p-5 shadow-sm">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <s.icon className="size-5" />
              </span>
              <p className="mt-4 font-semibold">
                {i + 1}. {s.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-y bg-muted/40" aria-labelledby="pricing">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-14 sm:px-6">
          <div className="space-y-2">
            <h2 id="pricing" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pricing
            </h2>
            <p className="text-muted-foreground">Pay once per move, only if the plan is worth it to you.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                className={cn("flex flex-col rounded-2xl border bg-card p-6 shadow-sm", p.featured && "border-2 border-primary")}
              >
                <p className="flex items-center justify-between font-semibold">
                  {p.name}
                  {p.featured ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Most popular</span>
                  ) : null}
                </p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {p.price}
                  {p.note ? <span className="ml-1 text-xs font-normal text-muted-foreground">{p.note}</span> : null}
                </p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex gap-4 rounded-2xl border border-dashed bg-card p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Home className="size-5" />
            </span>
            <p className="text-sm">
              <span className="font-semibold">
                Home+ — {homePlus}/mo after a {HOME_PLUS_TRIAL_DAYS}-day free trial.
              </span>{" "}
              <span className="text-muted-foreground">
                After the move, keep what you shipped as a home inventory: coverage check against your insurance,
                CSV export for your insurer, cancel anytime.
              </span>
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Payments by Stripe. We remove location data from your photos.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-primary p-8 text-primary-foreground sm:flex-row sm:items-center">
          <div>
            <p className="text-2xl font-semibold tracking-tight">Ready to plan your move?</p>
            <p className="mt-1 opacity-85">Four questions and a few photos. Free to start.</p>
          </div>
          <Button asChild size="lg" variant="secondary" className="h-12 px-6 text-base">
            <Link href="/move/new">
              Get started <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
