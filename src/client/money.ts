// Money framing for the report and paywall. Pure helpers, no server data beyond MoveSummary.

/** Plan prices (USD). Move Pass is what /api/checkout charges (see src/lib/stripe.ts). */
export const PASS_PRICE = 29;
export const PRO_PRICE = 79;

/**
 * Median monthly rent paid by US renters: $1,200 (Federal Reserve, Economic Well-Being
 * of U.S. Households in 2024 / SHED, May 2025).
 */
export const MEDIAN_RENT_MONTHLY = 1200;
export const RENT_SOURCE = {
  label: "Federal Reserve, SHED 2024",
  url: "https://www.federalreserve.gov/publications/files/2024-report-economic-well-being-us-households-202505.pdf",
};

const WEEKLY_RENT = (MEDIAN_RENT_MONTHLY * 12) / 52; // ≈ $277

/** Cash freed expressed in weeks of median rent, e.g. "2.6 weeks" / "1 week". Null if < half a week. */
export function weeksOfRent(cash: number): string | null {
  const weeks = cash / WEEKLY_RENT;
  if (weeks < 0.5) return null;
  const rounded = weeks < 10 ? Math.round(weeks * 10) / 10 : Math.round(weeks);
  return `${rounded} week${rounded === 1 ? "" : "s"}`;
}

/** "$29 is 4% of the $720 you'll free up" — null when the plan costs more than it saves. */
export function priceShare(price: number, cash: number): number | null {
  if (cash <= price) return null;
  return Math.max(1, Math.round((price / cash) * 100));
}

export const SIGNATURE_TEXT = "Priced with Ship-or-Sell — free move calculator";

/** Signature appended to copied listing text. Call only in the browser. */
export function listingSignature(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return url ? `${SIGNATURE_TEXT}: ${url}` : SIGNATURE_TEXT;
}

export interface PriceStep {
  label: string;
  price: number;
}

const DAY = 86_400_000;

function parseDay(iso: string): Date | null {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/**
 * Price-drop plan toward the move date: start at max, drop to the middle
 * a week out, take the quick-sale price in the last 3 days.
 * Returns null when the move date has passed or can't be read.
 * Uses `new Date()`, so call it only on the client after data loads.
 */
export function priceDropPlan(
  priceQuick: number,
  priceMax: number,
  moveDate: string,
  /** v2: plan's sellBy. Hold the max price until then, then drop to the middle. */
  sellBy?: string | null,
): { daysLeft: number; steps: PriceStep[] } | null {
  const move = parseDay(moveDate);
  if (!move) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((move.getTime() - today.getTime()) / DAY);
  if (daysLeft < 0) return null;

  const mid = Math.max(priceQuick, Math.round((priceQuick + priceMax) / 2 / 5) * 5);
  const at = (daysBefore: number) => short.format(new Date(move.getTime() - daysBefore * DAY));

  if (daysLeft <= 3) return { daysLeft, steps: [{ label: "Now", price: priceQuick }] };
  if (daysLeft <= 7)
    return {
      daysLeft,
      steps: [
        { label: "Now", price: mid },
        { label: `${at(3)} (3 days out)`, price: priceQuick },
      ],
    };
  const by = sellBy ? parseDay(sellBy) : null;
  const byDays = by ? Math.round((move.getTime() - by.getTime()) / DAY) : 7;
  const dropAt = byDays > 3 && byDays <= daysLeft ? byDays : 7;
  return {
    daysLeft,
    steps: [
      { label: dropAt === daysLeft ? "Now" : `Now → ${at(dropAt)}`, price: priceMax },
      { label: `${at(dropAt)} (${dropAt === 7 ? "1 week" : `${dropAt} days`} out)`, price: mid },
      { label: `${at(3)} (3 days out)`, price: priceQuick },
    ],
  };
}
