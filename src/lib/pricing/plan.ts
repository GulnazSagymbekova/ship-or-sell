import type { Category, Estimate, Item, Move, MovePlan, MoveType, PlanAction, PlanItem } from "@/types";
import { itemVolume, itemWeight, LB_PER_CUFT, moveDistance, SHIP_RATES } from "./index";

/**
 * План переезда (MovePlan), v2 «Move Money Plan».
 *
 * planMove(move, items, estimates, today) — чистая синхронная функция: без fetch, БД,
 * Date.now(), Math.random(). Дата «сегодня» приходит параметром (её берёт роут).
 *
 * В отличие от estimateMove (доля вещи в перевозке), здесь перевозка ступенчатая:
 * грузовик / контейнер / минимальный заказ мувера. Продажа вещи экономит на перевозке,
 * только если переезд «спускается на ступень ниже», — это и есть честная финансовая логика.
 *
 * estimates — ПОЛНЫЕ цифры (до paywall). Скрытие — applyPlanPaywall в lib/paywall.ts.
 *
 * Инвариант: план никогда не хуже, чем «везти всё»: netCash ≥ netCashIfShipAll, freedCash ≥ 0.
 */

// ---------- Константы ----------

/** Коробки с вещами: всегда добавляются к объёму мебели. [допущение] */
const BOXES_MIN_CUFT = 100;
const BOXES_SHARE = 0.6;

/** Грузовики (вместимость, куб. футы) — как у U-Haul. [допущение] */
const TRUCKS = [
  { label: "10 ft truck", capacityCuFt: 402 },
  { label: "15 ft truck", capacityCuFt: 764 },
  { label: "20 ft truck", capacityCuFt: 1016 },
  { label: "26 ft truck", capacityCuFt: 1682 },
] as const;
/** Ставки SHIP_RATES — за реально занятый объём; грузовик оплачиваем целиком при заполнении 80%. */
const TRUCK_FILL = 0.8;

/** Контейнер (PODS-подобный): ~800 куб. футов. [допущение] */
const CONTAINER_CUFT = 800;
const CONTAINER_FILL = 0.8;

/** Минимальный заказ межштатного мувера, фунтов. [допущение] */
const FULL_SERVICE_MIN_LB = 2000;

/** Базовый шанс продать вещь за 2 недели на Marketplace, по категории. [допущение] */
const SELL_CHANCE: Record<Category, number> = {
  dresser: 0.8,
  nightstand: 0.8,
  dining_table: 0.8,
  desk: 0.8,
  bookshelf: 0.8,
  office_chair: 0.8,
  coffee_table: 0.8,
  tv_stand: 0.8,
  dining_chair: 0.7,
  armchair: 0.7,
  lamp: 0.7,
  rug: 0.7,
  bed_frame: 0.7,
  sofa: 0.6,
  wardrobe: 0.6,
  sectional: 0.5,
  mattress: 0.15,
  other: 0.6,
};
/** Сколько дней нужно, чтобы шанс продажи вышел на базовый. [допущение] */
const FULL_SELL_WINDOW_DAYS = 14;
/** Меньше недели до переезда — продаём быстро, по resaleLow. */
const RUSH_DAYS = 7;
/** Выставить по высокой цене не позже чем за неделю до переезда. */
const SELL_BY_DAYS_BEFORE = 7;

/** Продавать не стоит возиться: максимальная выручка ниже — отдать. [допущение] */
const DONATE_BELOW_USD = 25;

/** Без этих вещей не прожить первую неделю — замена идёт в cashWeek1. */
const NEEDED_WEEK1 = new Set<Category>(["bed_frame", "mattress"]);

/** Подсказки «грузовик поменьше»: сколько вещей максимум продать и сколько подсказок. */
const TIP_MAX_ITEMS = 4;
const TIP_MAX_COUNT = 2;

// ---------- Утилиты ----------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Целые доллары ≥ 0. */
const money = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
/** Целые доллары, могут быть < 0. */
const signedMoney = (n: number) => (Number.isFinite(n) ? Math.round(n) : 0);

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(d: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

const formatDay = (t: number) => new Date(t).toISOString().slice(0, 10);

function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  if (a === null || b === null) return 0;
  return Math.max(0, Math.round((b - a) / DAY_MS));
}

const formatLb = (n: number) => n.toLocaleString("en-US");

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---------- Ступенчатая перевозка ----------

export interface Vehicle {
  label: string;
  cost: number;
  /** Чем меньше, тем меньше «ступень». Равные rank = та же ступень (тот же грузовик/контейнер). */
  rank: number;
}

/**
 * Стоимость перевозки набора вещей целиком.
 * volumeCuFt / weightLb — мебель (без коробок), itemCount — сколько вещей грузим.
 */
export function vehicleCost(move: Move, volumeCuFt: number, weightLb: number, itemCount: number): Vehicle {
  const type: MoveType = SHIP_RATES[move.moveType] ? move.moveType : "full_service";
  const rate = SHIP_RATES[type];
  const miles = moveDistance(move);
  const perUnit = rate.base + rate.perMile * miles;
  const furniture = Math.max(0, volumeCuFt);
  const total = furniture + Math.max(BOXES_MIN_CUFT, BOXES_SHARE * furniture);
  const handling = rate.handling * Math.max(0, itemCount);

  if (type === "diy_truck") {
    const idx = TRUCKS.findIndex((t) => total <= t.capacityCuFt);
    if (idx >= 0) {
      const t = TRUCKS[idx];
      return { label: t.label, cost: money(perUnit * t.capacityCuFt * TRUCK_FILL + handling), rank: idx };
    }
    const biggest = TRUCKS[TRUCKS.length - 1];
    const n = Math.ceil(total / biggest.capacityCuFt);
    return {
      label: `${n} × ${biggest.label}s`,
      cost: money(perUnit * biggest.capacityCuFt * TRUCK_FILL * n + handling),
      rank: TRUCKS.length - 1 + (n - 1) * TRUCKS.length,
    };
  }

  if (type === "container") {
    const n = Math.max(1, Math.ceil(total / CONTAINER_CUFT));
    return {
      label: n === 1 ? "1 container" : `${n} containers`,
      cost: money(perUnit * CONTAINER_CUFT * CONTAINER_FILL * n + handling),
      rank: n,
    };
  }

  // full_service: billable weight = max(вес, объём × 7), но не меньше минимального заказа.
  const billable = Math.max(Math.max(0, weightLb), total * LB_PER_CUFT, FULL_SERVICE_MIN_LB);
  const shown = Math.round(billable / 100) * 100;
  return {
    label: `~${formatLb(shown)} lb full service`,
    cost: money(billable * perUnit + handling),
    rank: Math.round(billable),
  };
}

function vehicleFor(move: Move, items: Item[]): Vehicle {
  let volume = 0;
  let weight = 0;
  for (const i of items) {
    volume += itemVolume(i);
    weight += itemWeight(i);
  }
  return vehicleCost(move, volume, weight, items.length);
}

/** «drop to a 15 ft truck» / «drop to 1 container» / «drop to ~2,400 lb full service». */
function dropPhrase(label: string): string {
  return /^\d+ ft truck$/.test(label) ? `a ${label}` : label;
}

// ---------- Шанс продажи ----------

export interface SaleOutlook {
  sellChance: number;
  expectedResale: number;
  sellBy: string;
}

export function saleOutlook(move: Move, item: Item, estimate: Estimate, today: string): SaleOutlook {
  const days = daysBetween(today, move.moveDate);
  const base = SELL_CHANCE[item.category] ?? SELL_CHANCE.other;
  const sellChance = Math.round(clamp(base * Math.min(1, days / FULL_SELL_WINDOW_DAYS), 0, 1) * 100) / 100;
  const low = Math.max(0, estimate.resaleLow);
  const high = Math.max(low, estimate.resaleHigh);
  const price = days < RUSH_DAYS ? low : (low + high) / 2;

  const moveDay = parseDay(move.moveDate);
  const todayDay = parseDay(today);
  let sellBy = today;
  if (moveDay !== null) {
    const t = moveDay - SELL_BY_DAYS_BEFORE * DAY_MS;
    sellBy = todayDay !== null && t < todayDay ? today : formatDay(t);
  }
  return { sellChance, expectedResale: money(sellChance * price), sellBy };
}

// ---------- План ----------

const isSelling = (a: PlanAction) => a === "sell" || a === "sell_buy_later";

export function planMove(move: Move, items: Item[], estimates: Estimate[], today: string): MovePlan {
  const estById = new Map(estimates.map((e) => [e.itemId, e]));
  const outlook = new Map<string, SaleOutlook>();
  for (const item of items) {
    const e = estById.get(item.id);
    if (e) outlook.set(item.id, saleOutlook(move, item, e, today));
  }
  const replaceOf = (id: string) => money(estById.get(id)?.replaceCost ?? 0);
  const resaleOf = (id: string) => outlook.get(id)?.expectedResale ?? 0;

  // c) Стартуем с вердикта.
  const action = new Map<string, PlanAction>();
  for (const item of items) {
    const e = estById.get(item.id);
    if (!e || item.sentimental || e.verdict !== "SELL") {
      action.set(item.id, "ship");
    } else if (e.resaleHigh < DONATE_BELOW_USD) {
      action.set(item.id, "donate");
    } else {
      action.set(item.id, NEEDED_WEEK1.has(item.category) ? "sell" : "sell_buy_later");
    }
  }

  // Проверка ступени: продажа не уменьшает грузовик/контейнер и в деньгах минус → лучше везти.
  const shipped = items.filter((i) => action.get(i.id) === "ship");
  for (const item of items) {
    if (action.get(item.id) === "ship") continue;
    const without = vehicleFor(move, shipped);
    const withIt = vehicleFor(move, [...shipped, item]);
    const keep = action.get(item.id) === "donate" ? 0 : resaleOf(item.id);
    if (withIt.rank === without.rank && keep - replaceOf(item.id) < 0) {
      action.set(item.id, "ship");
      shipped.push(item);
    }
  }

  // Правило: план никогда не хуже, чем «везти всё» (иначе советуем продать, а денег меньше).
  // 1) Локальное улучшение: если везти вещь выгоднее или так же — везём.
  // 2) Страховка: если план всё равно хуже «везти всё» — план = везти всё.
  const all = vehicleFor(move, items);
  const net = (act: Map<string, PlanAction>) => {
    let cash = 0;
    const ship: Item[] = [];
    for (const i of items) {
      const a = act.get(i.id)!;
      if (a === "ship") ship.push(i);
      else cash += (isSelling(a) ? resaleOf(i.id) : 0) - replaceOf(i.id);
    }
    return cash - vehicleFor(move, ship).cost;
  };
  for (let pass = 0, changed = true; changed && pass < items.length; pass++) {
    changed = false;
    for (const item of items) {
      if (action.get(item.id) === "ship") continue;
      const trial = new Map(action).set(item.id, "ship");
      if (net(trial) >= net(action)) {
        action.set(item.id, "ship");
        changed = true;
      }
    }
  }
  if (net(action) < -all.cost) for (const item of items) action.set(item.id, "ship");
  shipped.length = 0;
  shipped.push(...items.filter((i) => action.get(i.id) === "ship"));

  // e) Деньги.
  const current = vehicleFor(move, shipped);
  let cashBeforeMove = 0;
  let cashWeek1 = 0;
  let cashMonth1 = 0;
  const planItems: PlanItem[] = items.map((item) => {
    const a = action.get(item.id)!;
    const o = outlook.get(item.id);
    if (a === "ship") return { itemId: item.id, action: a, sellChance: 0, expectedResale: 0, sellBy: null };
    if (NEEDED_WEEK1.has(item.category)) cashWeek1 += replaceOf(item.id);
    else cashMonth1 += replaceOf(item.id);
    if (a === "donate" || !o) return { itemId: item.id, action: a, sellChance: 0, expectedResale: 0, sellBy: null };
    cashBeforeMove += o.expectedResale;
    return { itemId: item.id, action: a, sellChance: o.sellChance, expectedResale: o.expectedResale, sellBy: o.sellBy };
  });

  const cashMoveDay = current.cost;
  const netCash = signedMoney(cashBeforeMove - cashMoveDay - cashWeek1 - cashMonth1);
  const netCashIfShipAll = signedMoney(-all.cost);

  // d) Подсказки «грузовик поменьше».
  const tips = smallerVehicleTips(move, shipped, current, resaleOf, replaceOf);

  return {
    vehicle: current.label,
    vehicleIfShipAll: all.label,
    shipCost: money(cashMoveDay),
    shipAllCost: money(all.cost),
    cashBeforeMove: money(cashBeforeMove),
    cashMoveDay: money(cashMoveDay),
    cashWeek1: money(cashWeek1),
    cashMonth1: money(cashMonth1),
    netCash,
    netCashIfShipAll,
    freedCash: signedMoney(netCash - netCashIfShipAll),
    items: planItems,
    tips,
  };
}

/**
 * Жадно (по убыванию объёма) набираем до 4 перевозимых вещей (не sentimental), после продажи
 * которых ступень становится меньше, а выгода > 0:
 * выгода = (перевозка сейчас − перевозка без них) + Σ ожидаемая выручка − Σ замена.
 * Вторая подсказка — тот же поиск без самой крупной вещи первой.
 */
function smallerVehicleTips(
  move: Move,
  shipped: Item[],
  current: Vehicle,
  resaleOf: (id: string) => number,
  replaceOf: (id: string) => number,
): string[] {
  const candidates = shipped
    .filter((i) => !i.sentimental)
    .sort((a, b) => itemVolume(b) - itemVolume(a) || a.id.localeCompare(b.id));

  const tips: string[] = [];
  const used = new Set<string>();
  for (let start = 0; start < candidates.length && tips.length < TIP_MAX_COUNT; start++) {
    const picked: Item[] = [];
    for (const c of candidates.slice(start)) {
      if (picked.length >= TIP_MAX_ITEMS) break;
      picked.push(c);
      const rest = shipped.filter((s) => !picked.includes(s));
      const smaller = vehicleFor(move, rest);
      if (smaller.rank >= current.rank) continue;
      const gain =
        current.cost - smaller.cost + picked.reduce((sum, p) => sum + resaleOf(p.id) - replaceOf(p.id), 0);
      if (gain <= 0) continue;
      const key = picked.map((p) => p.id).sort().join("|");
      if (!used.has(key)) {
        used.add(key);
        tips.push(`Sell ${joinNames(picked.map((p) => p.name))} to drop to ${dropPhrase(smaller.label)}: save $${money(gain)}`);
      }
      break;
    }
  }
  return tips;
}
