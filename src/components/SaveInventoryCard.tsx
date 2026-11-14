"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { House, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/client/errors";
import { Button } from "@/components/ui/button";

/** After payment: save the items you're shipping as a home inventory (free). */
export function SaveInventoryCard({ moveId }: { moveId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { homeId } = await api.createHome(moveId);
      router.push(`/home/${homeId}`);
    } catch (e) {
      setError(errorMessage(e, { network: "Couldn't save your inventory. Please try again." }));
      setBusy(false);
    }
  };

  return (
    <section className="w-full rounded-2xl border bg-card p-5 text-left shadow-sm">
      <p className="flex items-center gap-2 font-semibold">
        <House className="size-4 text-primary" /> Keep this as your home inventory
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Insurers ask for a list of your belongings after theft or damage. Save the items you&apos;re shipping — free.
      </p>
      {error ? (
        <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="outline" className="mt-3 w-full" onClick={save} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        Save home inventory
      </Button>
    </section>
  );
}
