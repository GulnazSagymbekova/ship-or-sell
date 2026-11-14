import type { Estimate, Item, Move, MoveSummary } from "@/types";

/** Сколько вещей с наибольшей экономией показываем бесплатно. */
export const FREE_ITEMS = 3;

/**
 * Сводка по ПОЛНЫМ цифрам (до скрытия).
 *  - sellCount: вещей с verdict SELL
 *  - totalSavings: Σ savings по SELL без sentimental
 *  - shipAllCost: Σ shipCost по всем вещам
 *  - optimalCost: shipAllCost − totalSavings (везём SHIP/TOSSUP, SELL продаём и покупаем замену)
 */
export function computeSummary(estimates: Estimate[], items: Pick<Item, "id" | "sentimental">[]): MoveSummary {
  const sentimental = new Set(items.filter((i) => i.sentimental).map((i) => i.id));
  let sellCount = 0;
  let totalSavings = 0;
  let shipAllCost = 0;
  for (const e of estimates) {
    shipAllCost += e.shipCost;
    if (e.verdict === "SELL") {
      sellCount += 1;
      if (!sentimental.has(e.itemId)) totalSavings += e.savings;
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    sellCount,
    totalSavings: round(totalSavings),
    shipAllCost: round(shipAllCost),
    optimalCost: round(shipAllCost - totalSavings),
  };
}

/**
 * Скрытие цифр на сервере. Если move не оплачен: 3 вещи с наибольшим savings — как есть,
 * у остальных shipCost/resaleLow/resaleHigh/replaceCost/savings = 0; verdict и confidence
 * остаются. summary — всегда по полным цифрам.
 */
export function applyPaywall(
  move: Pick<Move, "status">,
  estimates: Estimate[],
  items: Pick<Item, "id" | "sentimental">[],
): { estimates: Estimate[]; lockedItemIds: string[]; summary: MoveSummary } {
  const summary = computeSummary(estimates, items);
  if (move.status === "paid") return { estimates, lockedItemIds: [], summary };

  const free = new Set(
    [...estimates]
      .sort((a, b) => b.savings - a.savings || a.itemId.localeCompare(b.itemId))
      .slice(0, FREE_ITEMS)
      .map((e) => e.itemId),
  );
  const lockedItemIds: string[] = [];
  const out = estimates.map((e) => {
    if (free.has(e.itemId)) return e;
    lockedItemIds.push(e.itemId);
    return { ...e, shipCost: 0, resaleLow: 0, resaleHigh: 0, replaceCost: 0, savings: 0 };
  });
  return { estimates: out, lockedItemIds, summary };
}
