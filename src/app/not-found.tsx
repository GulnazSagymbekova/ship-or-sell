import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold">We couldn&apos;t find that page</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          The link may be old, or the move was deleted. Your moves are still in My moves.
        </p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/move">My moves</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
