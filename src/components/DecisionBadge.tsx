import type { Verdict } from "@/types";
import { cn } from "@/client/utils";

const STYLE: Record<Verdict, { label: string; className: string }> = {
  SELL: { label: "Sell", className: "bg-sell text-white" },
  SHIP: { label: "Ship", className: "bg-ship text-white" },
  TOSSUP: { label: "Your call", className: "bg-tossup/15 text-foreground" },
};

export function DecisionBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const s = STYLE[verdict];
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full px-3 text-xs whitespace-nowrap font-semibold tracking-wide uppercase",
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  );
}
