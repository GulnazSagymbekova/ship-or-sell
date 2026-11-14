import Link from "next/link";
import { ArrowRight, Camera, Scale, Tag } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <AppShell className="flex flex-col justify-center">
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
            Get started <ArrowRight />
          </Link>
        </Button>
        <ul className="grid gap-3 pt-4 text-sm text-muted-foreground sm:grid-cols-3">
          <li className="flex items-center gap-2">
            <Camera className="size-4 text-primary" /> Photos in, items out
          </li>
          <li className="flex items-center gap-2">
            <Scale className="size-4 text-primary" /> Ship vs. sell, per item
          </li>
          <li className="flex items-center gap-2">
            <Tag className="size-4 text-primary" /> Ready-to-post listings
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
