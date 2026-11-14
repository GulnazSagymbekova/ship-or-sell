import type { Estimate, Item } from "@/types";
import type { HomeItem } from "@/home-types";
import { valueItem } from "./index";

const money = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * Стоимость замены НОВОЙ вещью — то, что спросит страховая.
 * replaceCost в estimateMove = min(б/у похожая + забрать, бюджетная новая) — для описи мало.
 * Берём retail из valueItem: та же вещь новой (бренд × материал × размер),
 * без скидки за состояние и без поправки на б/у. Не меньше replaceCost.
 */
export function replaceNewCost(item: Item, estimate: Pick<Estimate, "replaceCost">): number {
  const { retail } = valueItem(item);
  return Math.max(money(retail), money(estimate.replaceCost));
}

export function homeTotals(
  items: Pick<HomeItem, "replaceNew">[],
  coverageLimit: number | null,
): { totalValue: number; coverageGap: number | null } {
  const totalValue = money(items.reduce((s, i) => s + (Number(i.replaceNew) || 0), 0));
  const coverageGap = coverageLimit === null || coverageLimit === undefined ? null : Math.round(totalValue - coverageLimit);
  return { totalValue, coverageGap };
}

export const CSV_HEADER = [
  "Item",
  "Category",
  "Brand",
  "Material",
  "Condition",
  "Width in",
  "Depth in",
  "Height in",
  "Replacement value (USD)",
  "Purchase price (USD)",
  "Serial number",
];

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV для страховой. Без фото, адреса и id. `today` — YYYY-MM-DD (для теста). */
export function homeItemsToCsv(items: HomeItem[], today = new Date().toISOString().slice(0, 10)): string {
  const lines = [
    cell(`Ship-or-Sell home inventory, generated ${today}. Values are estimates, not an appraisal.`),
    CSV_HEADER.map(cell).join(","),
    ...items.map((i) =>
      [
        i.name,
        i.category,
        i.brand,
        i.material,
        `${i.condition}/5`,
        Math.round(i.widthIn),
        Math.round(i.depthIn),
        Math.round(i.heightIn),
        money(i.replaceNew),
        i.purchasePrice === null ? null : money(i.purchasePrice),
        i.serialNumber,
      ]
        .map(cell)
        .join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}
