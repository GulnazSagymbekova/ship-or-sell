import type { Estimate, Item } from "@/types";
import { usd } from "./utils";

/** One-line reason under a verdict, built on the client from numbers + destination city. */
export function explain(item: Item, e: Estimate, toCity: string | null, locked: boolean): string {
  if (locked) return "Unlock to see the numbers";
  const city = toCity ?? "your new city";
  if (item.sentimental) return "You're keeping this one — it's sentimental.";
  switch (e.verdict) {
    case "SELL":
      return e.shipCost > e.replaceCost
        ? `Shipping costs more than buying a similar one in ${city}`
        : `Selling now and rebuying in ${city} saves you ${usd.format(e.savings)}`;
    case "SHIP":
      return `Cheaper to bring it than to replace it in ${city}`;
    case "TOSSUP": {
      // Сравниваем перевозку с «продать здесь и купить там» (замена минус выручка), а не с ценой замены.
      const swap = Math.max(0, e.replaceCost - Math.round((e.resaleLow + e.resaleHigh) / 2));
      return `It's close: shipping is ${usd.format(e.shipCost)}, selling here and rebuying in ${city} nets out to about ${usd.format(swap)}.`;
    }
  }
}
