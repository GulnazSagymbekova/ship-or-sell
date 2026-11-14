"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCircle2, Download, House, Loader2, PlusCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import type { HomeDetails } from "@/home-types";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { CATEGORY_LABEL } from "@/client/labels";
import { usd } from "@/client/utils";
import { PageTitle } from "@/components/AppShell";
import { ErrorState } from "@/components/ErrorState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const NAIC_URL = "https://content.naic.org/article/consumer-insight-understanding-your-homeowners-or-renters-policy";

export function HomeScreen() {
  const { id } = useParams<{ id: string }>();
  const [details, setDetails] = useState<HomeDetails | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Back from Stripe: the webhook activates Home+ a few seconds later — poll until it does.
  const justSubscribed = useSearchParams().get("subscribed") === "1";
  const [activating, setActivating] = useState(justSubscribed);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDetails(await api.getHome(id));
    } catch (e) {
      setError(e);
    }
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
    void load();
  }, [load]);

  useEffect(() => {
    if (!activating) return;
    if (details?.homePlus.active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- stop polling once active
      setActivating(false);
      toast.success("Home+ is on. Your 30-day free trial has started.");
      return;
    }
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const d = await api.getHome(id);
        setDetails(d);
        if (d.homePlus.active || tries >= 10) {
          clearInterval(timer);
          setActivating(false);
        }
      } catch {
        if (tries >= 10) {
          clearInterval(timer);
          setActivating(false);
        }
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [activating, details?.homePlus.active, id]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!details) return <LoadingState rows={4} />;

  return (
    <div className="space-y-6">
      <PageTitle title={details.home.name} subtitle="Home inventory" />

      <section className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm">
        <p className="text-sm opacity-90">Your stuff is worth</p>
        <p className="text-4xl font-bold tracking-tight tabular-nums">{usd.format(details.totalValue)}</p>
        <p className="mt-1 text-xs opacity-80">Estimated replacement value — not an appraisal</p>
      </section>

      <Coverage details={details} onSaved={(limit) => setDetails(withLimit(details, limit))} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Items <span className="font-normal text-muted-foreground">· {details.items.length}</span>
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {details.items.map((item) => {
            const url = item.photoPath ? details.photoUrls[item.photoPath] : undefined;
            return (
              <li key={item.id} className="overflow-hidden rounded-xl border bg-card">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed URL, short TTL
                  <img src={url} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-muted">
                    <House className="size-6 text-muted-foreground" />
                  </div>
                )}
                <div className="p-3">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[CATEGORY_LABEL[item.category] ?? item.category, item.brand].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums">{usd.format(item.replaceNew)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <HomePlusBlock details={details} activating={activating} />

      <div className="flex justify-center border-t pt-4">
        <DeleteHomeButton homeId={details.home.id} />
      </div>
    </div>
  );
}

function withLimit(d: HomeDetails, limit: number | null): HomeDetails {
  return {
    ...d,
    home: { ...d.home, coverageLimit: limit },
    coverageGap: limit === null ? null : Math.round(d.totalValue - limit),
  };
}

function Coverage({ details, onSaved }: { details: HomeDetails; onSaved: (limit: number | null) => void }) {
  const initial = details.home.coverageLimit;
  const [text, setText] = useState(initial === null ? "" : String(Math.round(initial)));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const clean = text.replace(/[^\d]/g, "");
    const limit = clean === "" ? null : Math.min(10_000_000, Number(clean));
    if (limit === initial) return;
    setBusy(true);
    try {
      await api.updateHome(details.home.id, { coverageLimit: limit });
      onSaved(limit);
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't save your coverage. Please try again." }));
    } finally {
      setBusy(false);
    }
  };

  const gap = details.coverageGap;
  return (
    <section className="space-y-3">
      <label htmlFor="coverage" className="text-sm font-semibold">
        Your policy covers
      </label>
      <div className="flex items-center gap-2">
        <span className="text-lg text-muted-foreground">$</span>
        <Input
          id="coverage"
          inputMode="numeric"
          placeholder="e.g. 20,000 — personal property limit"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ""))}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>
      {gap === null ? (
        <p className="text-xs text-muted-foreground">
          Find “personal property” (Coverage C) on your renters or homeowners policy.
        </p>
      ) : gap > 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <ShieldAlert className="size-4 shrink-0" /> You may be underinsured by {usd.format(gap)}
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg bg-sell/10 p-3 text-sm font-medium text-sell">
          <CheckCircle2 className="size-4 shrink-0" /> You&apos;re covered
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        <a href={NAIC_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          NAIC recommends keeping a home inventory
        </a>{" "}
        to speed up insurance claims.
      </p>
    </section>
  );
}

function HomePlusBlock({ details, activating }: { details: HomeDetails; activating: boolean }) {
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = details.homePlus.active;

  const redirect = async (get: () => Promise<{ url: string }>) => {
    setBusy(true);
    try {
      const { url } = await get();
      window.location.assign(url);
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't open Stripe. Please try again." }));
      setBusy(false);
    }
  };
  const subscribe = () => redirect(() => api.homePlusCheckout(details.home.id));
  const manage = () => redirect(() => api.billingPortal(details.home.id));

  const join = async () => {
    setBusy(true);
    try {
      await api.joinHomePlusWaitlist();
      setJoined(true);
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't join the waitlist. Please try again." }));
    } finally {
      setBusy(false);
    }
  };

  const features = [
    { icon: <Download className="size-4" />, text: "Export for your insurer (CSV)" },
    { icon: <PlusCircle className="size-4" />, text: "Add new purchases with a photo" },
    { icon: <Bell className="size-4" />, text: "Quarterly reminders to update values" },
  ];

  return (
    <section className="rounded-2xl border-2 border-primary bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-semibold text-primary">Home+</p>
        <p className="text-xl font-bold tabular-nums">
          $4.99<span className="text-xs font-normal text-muted-foreground">/mo · 30 days free</span>
        </p>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f.text} className="flex items-center gap-2">
            <span className="text-primary">{f.icon}</span> {f.text}
          </li>
        ))}
      </ul>
      {active ? (
        <div className="mt-4 space-y-2">
          <p className="text-center text-xs text-muted-foreground">
            {details.homePlus.status === "trialing" ? "Free trial active" : "Subscription active"}
          </p>
          <Button asChild size="lg" className="w-full">
            <a href={`/api/homes/${details.home.id}/export`}>
              <Download /> Export CSV for your insurer
            </a>
          </Button>
          <Button variant="ghost" className="w-full" onClick={manage} disabled={busy}>
            Manage subscription
          </Button>
        </div>
      ) : activating ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-muted p-3 text-sm">
          <Loader2 className="size-4 animate-spin" /> Activating Home+…
        </p>
      ) : details.homePlus.billingEnabled ? (
        <div className="mt-4 space-y-2">
          <Button size="lg" className="w-full" onClick={subscribe} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Start 30-day free trial
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Then $4.99/mo. Cancel anytime. Secure checkout by Stripe.
          </p>
          {details.homePlus.status === "past_due" ? (
            <Button variant="ghost" className="w-full" onClick={manage} disabled={busy}>
              Update payment method
            </Button>
          ) : null}
        </div>
      ) : joined ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-sell/10 p-3 text-sm font-medium text-sell">
          <CheckCircle2 className="size-4" /> You&apos;re on the list
        </p>
      ) : (
        <Button size="lg" className="mt-4 w-full" onClick={join} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Join the waitlist
        </Button>
      )}
    </section>
  );
}

function DeleteHomeButton({ homeId }: { homeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteHome(homeId);
      setOpen(false);
      toast.success("Your inventory and its photos were deleted.");
      router.push("/home");
    } catch (e) {
      toast.error(errorMessage(e, { network: "Couldn't delete your inventory. Please try again." }));
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
      <AlertDialogTrigger asChild>
        <Button variant="link" className="text-muted-foreground hover:text-destructive">
          Delete this inventory
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete this inventory?</AlertDialogTitle>
        <AlertDialogDescription>
          We&apos;ll permanently delete the list and its photo copies. Your move stays as it is.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
