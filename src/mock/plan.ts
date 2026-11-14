// Mock MovePlan (mock mode only). Mirrors the v2 contract so the report can be built and demoed
// before the real planMove (src/lib/pricing, C) ships. Numbers marked [assumption] match
// /mnt/project-files/pitch/prompts-v2.md; the server version is the source of truth.

import type { Category, Estimate, Item, Move, MovePlan, PlanAction, PlanItem } from "@/types";

const DAY = 86_400_000;

/** Trucks (U-Haul style) by capacity, cu ft [assumption]. */
const TRUCKS = [
  { label: "10 ft truck", cuft: 402 },
  { label: "15 ft truck", cuft: 764 },
  { label: "20 ft truck", cuft: 1016 },
  { label: "26 ft truck", cuft: 1682 },
];
const CONTAINER_CUFT = 800; // [assumption]
const FULL_SERVICE_MIN_LB = 2000; // [assumption]
const LB_PER_CUFT = 7;

/** Base chance an item sells within ~2 weeks [assumption]. */
const SELL_BASE: Partial<Record<Category, number>> = {
  dresser: 0.8, nightstand: 0.8, dining_table: 0.8, desk: 0.8, bookshelf: 0.8, office_chair: 0.8,
  coffee_table: 0.8, tv_stand: 0.8, dining_chair: 0.7, armchair: 0.7, lamp: 0.7, rug: 0.7, bed_frame: 0.7,
  sofa: 0.6, wardrobe: 0.6, sectional: 0.5, mattress: 0.15,
};
/** Replaced in week 1 (you need a bed on night one). */
const NEEDED_DAY1 = new Set<Category>(["bed_frame", "mattress"]);

const miles = (m: Move) => m.distanceMi ?? 1000;
const round = (n: number) => Math.max(0, Math.round(n));

function parseDay(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (mo || 1) - 1, d || 1));
}
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

interface Load {
  cuft: number;
  lb: number;
  count: number;
}

function loadOf(items: Item[]): Load {
  const furniture = items.reduce((s, i) => s + (i.volumeCuFt || 0), 0);
  const boxes = Math.max(100, 0.6 * furniture); // [assumption]
  return { cuft: furniture + boxes, lb: items.reduce((s, i) => s + (i.weightLb || 0), 0), count: items.length };
}

export function vehicleCost(move: Move, load: Load): { label: string; cost: number; rank: number } {
  const mi = miles(move);
  if (move.moveType === "diy_truck") {
    const rate = 0.6 + 0.0016 * mi;
    const idx = TRUCKS.findIndex((t) => t.cuft >= load.cuft);
    if (idx === -1) {
      const t = TRUCKS[TRUCKS.length - 1];
      return { label: `2 × ${t.label}`, cost: round(rate * t.cuft * 0.8 * 2 + 5 * load.count), rank: TRUCKS.length };
    }
    const t = TRUCKS[idx];
    return { label: t.label, cost: round(rate * t.cuft * 0.8 + 5 * load.count), rank: idx };
  }
  if (move.moveType === "container") {
    const n = Math.max(1, Math.ceil(load.cuft / CONTAINER_CUFT));
    const rate = 1.2 + 0.0025 * mi;
    return {
      label: `${n} container${n === 1 ? "" : "s"}`,
      cost: round(rate * CONTAINER_CUFT * 0.8 * n + 5 * load.count),
      rank: n,
    };
  }
  const billable = Math.max(FULL_SERVICE_MIN_LB, load.lb, load.cuft * LB_PER_CUFT);
  const lbRounded = Math.round(billable / 100) * 100;
  return {
    label: `~${lbRounded.toLocaleString("en-US")} lb full service`,
    cost: round(billable * (0.3 + 0.00045 * mi) + 15 * load.count),
    rank: lbRounded,
  };
}

export function buildPlan(move: Move, items: Item[], estimates: Estimate[], today: string): MovePlan {
  const est = new Map(estimates.map((e) => [e.itemId, e]));
  const days = Math.max(0, Math.round((parseDay(move.moveDate).getTime() - parseDay(today).getTime()) / DAY));
  const sellBy = isoDay(new Date(Math.max(parseDay(today).getTime(), parseDay(move.moveDate).getTime() - 7 * DAY)));

  const planItems: PlanItem[] = [];
  for (const item of items) {
    const e = est.get(item.id);
    if (!e) continue;
    const chance = Math.round((SELL_BASE[item.category] ?? 0.6) * Math.min(1, days / 14) * 100) / 100;
    const price = days < 7 ? e.resaleLow : (e.resaleLow + e.resaleHigh) / 2;
    const expectedResale = round(chance * price);
    let action: PlanAction = "ship";
    if (!item.sentimental && e.verdict === "SELL") {
      if (e.resaleHigh < 25) action = "donate";
      else action = NEEDED_DAY1.has(item.category) ? "sell" : "sell_buy_later";
    }
    planItems.push({
      itemId: item.id,
      action,
      sellChance: action === "ship" ? 0 : chance,
      expectedResale: action === "ship" || action === "donate" ? 0 : expectedResale,
      sellBy: action === "ship" ? null : sellBy,
    });
  }

  const byId = new Map(items.map((i) => [i.id, i]));
  const kept = () => planItems.filter((p) => p.action === "ship").map((p) => byId.get(p.itemId)!);
  const allCost = vehicleCost(move, loadOf(items)).cost;

  // Cash vs. shipping everything for the current choice of actions.
  const gain = () =>
    allCost -
    vehicleCost(move, loadOf(kept())).cost +
    planItems
      .filter((p) => p.action !== "ship")
      .reduce((s, p) => s + p.expectedResale - est.get(p.itemId)!.replaceCost, 0);

  const sellAction = (item: Item): PlanAction => (NEEDED_DAY1.has(item.category) ? "sell" : "sell_buy_later");
  const expectFor = (item: Item) => {
    const e = est.get(item.id)!;
    const chance = Math.round((SELL_BASE[item.category] ?? 0.6) * Math.min(1, days / 14) * 100) / 100;
    return { chance, resale: round(chance * (days < 7 ? e.resaleLow : (e.resaleLow + e.resaleHigh) / 2)) };
  };
  const setShip = (p: PlanItem) => Object.assign(p, { action: "ship", sellChance: 0, expectedResale: 0, sellBy: null });
  const setSell = (p: PlanItem) => {
    const item = byId.get(p.itemId)!;
    const { chance, resale } = expectFor(item);
    Object.assign(p, { action: sellAction(item), sellChance: chance, expectedResale: resale, sellBy });
  };

  // Vehicle prices step, so per-item verdicts can mislead. Hill-climb single toggles
  // (never sentimental, never "donate") until no flip improves cash, then make sure
  // the plan is never worse than shipping everything.
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (const p of planItems) {
      const item = byId.get(p.itemId)!;
      if (item.sentimental || p.action === "donate") continue;
      const before = gain();
      const prev = { ...p };
      if (p.action === "ship") setSell(p);
      else setShip(p);
      if (gain() > before) improved = true;
      else Object.assign(p, prev);
    }
    if (!improved) break;
  }
  if (gain() < 0) for (const p of planItems) if (p.action !== "donate") setShip(p);

  const all = vehicleCost(move, loadOf(items));
  const ship = vehicleCost(move, loadOf(kept()));

  // Tip: sell up to 4 big shipped items to drop one vehicle size.
  const tips: string[] = [];
  const candidates = planItems
    .filter((p) => p.action === "ship" && !byId.get(p.itemId)!.sentimental)
    .map((p) => byId.get(p.itemId)!)
    .sort((a, b) => b.volumeCuFt - a.volumeCuFt);
  const picked: Item[] = [];
  for (const c of candidates.slice(0, 4)) {
    picked.push(c);
    const rest = kept().filter((k) => !picked.includes(k));
    const smaller = vehicleCost(move, loadOf(rest));
    if (smaller.rank < ship.rank) {
      const resale = picked.reduce((s, i) => s + expectFor(i).resale, 0);
      const replace = picked.reduce((s, i) => s + est.get(i.id)!.replaceCost, 0);
      const gain = round(ship.cost - smaller.cost + resale - replace);
      if (gain > 0) {
        const names = picked.map((i) => i.name);
        const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
        tips.push(`Sell ${list} to drop to a ${smaller.label}: save $${gain.toLocaleString("en-US")}`);
      }
      break;
    }
  }

  const sold = planItems.filter((p) => p.action !== "ship");
  const cashBeforeMove = sold.reduce((s, p) => s + p.expectedResale, 0);
  const cashWeek1 = sold
    .filter((p) => p.action === "sell")
    .reduce((s, p) => s + est.get(p.itemId)!.replaceCost, 0);
  const cashMonth1 = sold
    .filter((p) => p.action === "sell_buy_later")
    .reduce((s, p) => s + est.get(p.itemId)!.replaceCost, 0);
  const netCash = cashBeforeMove - ship.cost - cashWeek1 - cashMonth1;

  return {
    vehicle: ship.label,
    vehicleIfShipAll: all.label,
    shipCost: ship.cost,
    shipAllCost: all.cost,
    cashBeforeMove,
    cashMoveDay: ship.cost,
    cashWeek1,
    cashMonth1,
    netCash,
    netCashIfShipAll: -all.cost,
    freedCash: netCash + all.cost,
    items: planItems,
    tips,
  };
}

/** Same rule as the server's applyPlanPaywall: hide locked items and tips until paid. */
export function lockPlan(plan: MovePlan, lockedItemIds: string[], paid: boolean): MovePlan {
  if (paid) return plan;
  const locked = new Set(lockedItemIds);
  return { ...plan, items: plan.items.filter((p) => !locked.has(p.itemId)), tips: [] };
}
