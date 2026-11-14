import Link from "next/link";
import { cn } from "@/lib/utils";

/** Shared page frame: header, centered mobile-first column, footer. */
export function AppShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              S/S
            </span>
            Ship-or-Sell
          </Link>
          <Link href="/move" className="text-sm text-muted-foreground hover:text-foreground">
            My moves
          </Link>
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-2xl flex-1 px-4 py-6", className)}>{children}</main>
      <footer className="mx-auto w-full max-w-2xl px-4 py-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
      </footer>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
