import Link from "next/link";
import { cn } from "@/client/utils";

const WIDTH = {
  /** Forms and confirmations: a readable single column. */
  narrow: "max-w-2xl",
  /** Reports and lists: two columns on desktop. */
  wide: "max-w-6xl",
} as const;

/** Shared page frame: header, centered column (narrow on forms, wide on reports), footer. */
export function AppShell({
  children,
  className,
  width = "narrow",
  bare = false,
}: {
  children: React.ReactNode;
  className?: string;
  width?: keyof typeof WIDTH;
  /** Landing: sections manage their own width and background. */
  bare?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              S/S
            </span>
            Ship-or-Sell
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/move" className="hover:text-foreground">
              My moves
            </Link>
            <Link href="/home" className="hidden hover:text-foreground sm:inline">
              My home
            </Link>
            <Link
              href="/move/new"
              className="hidden rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:bg-primary/90 sm:inline"
            >
              New move
            </Link>
          </nav>
        </div>
      </header>
      {bare ? (
        <main className={cn("flex-1", className)}>{children}</main>
      ) : (
        <main className={cn("mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-8", WIDTH[width], className)}>{children}</main>
      )}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>© 2026 Ship-or-Sell</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </div>
      </footer>
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
