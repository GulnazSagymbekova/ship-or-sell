import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planMove, saleOutlook, vehicleCost, vehicleLoad } from "@/lib/pricing/plan";
import { applyPlanPaywall } from "@/lib/paywall";
import type { Category, Estimate, Item, Move } from "@/types";

const move = (over: Partial<Move> = {}): Move => ({
  id: "move-1",
  userId: "user-1",
  fromZip: "10001",
  toZip: "78701",
  distanceMi: 1815, // 10001 → 78701 по справочнику (haversine × 1.2)
  moveType: "diy_truck",
  moveDate: "2026-12-15",
  status: "analyzed",
  ...over,
});

let seq = 0;
const item = (over: Partial<Item> = {}): Item => ({
  id: `item-${++seq}`,
  moveId: "move-1",
  photoPath: "user-1/move-1/photo.jpg",
  category: "dresser",
  name: "Dresser",
  brand: null,
  material: "wood",
  condition: 3,
  widthIn: 40,
  depthIn: 20,
  heightIn: 30,
  volumeCuFt: 30,
  weightLb: 100,
  sentimental: false,
  userEdited: false,
  aiConfidence: 0.85,
  ...over,
});

const est = (i: Item, over: Partial<Estimate> = {}): Estimate => ({
  itemId: i.id,
  shipCost: 100,
  resaleLow: 80,
  resaleHigh: 120,
  replaceCost: 150,
  verdict: "SHIP",
  savings: 10,
  confidence: 0.8,
  ...over,
});

const TODAY = "2026-11-14"; // за 31 день до переезда

/**
 * 12 вещей, мебель 590 куб. футов (+ коробки 60% = 944) → 20 ft truck (≤ 1016).
 * Три крупные по 52 куб. фута: без двух — 486 × 1.6 = 778 > 764 (всё ещё 20 ft),
 * без трёх — 434 × 1.6 = 694 ≤ 764 → 15 ft truck.
 */
function twelveItems(): Item[] {
  const big = (name: string, category: Category) => item({ name, category, volumeCuFt: 52, weightLb: 150 });
  const small = (name: string, category: Category, v: number) => item({ name, category, volumeCuFt: v, weightLb: 60 });
  return [
    big("Sofa", "sofa"),
    big("Wardrobe", "wardrobe"),
    big("Dining table", "dining_table"),
    small("Dresser", "dresser", 49),
    small("Bed frame", "bed_frame", 49),
    small("Mattress", "mattress", 49),
    small("Desk", "desk", 49),
    small("Bookshelf", "bookshelf", 49),
    small("Armchair", "armchair", 49),
    small("TV stand", "tv_stand", 49),
    small("Nightstand", "nightstand", 49),
    small("Rug", "rug", 42),
  ];
}

describe("vehicleCost", () => {
  it("diy_truck: 12 вещей → 20 ft, без трёх крупных → 15 ft", () => {
    const items = twelveItems();
    const vol = (xs: Item[]) => xs.reduce((s, i) => s + i.volumeCuFt, 0);
    assert.equal(vehicleCost(move(), vol(items), 0, items.length).label, "20 ft truck");
    assert.equal(vehicleCost(move(), vol(items.slice(2)), 0, 10).label, "20 ft truck");
    assert.equal(vehicleCost(move(), vol(items.slice(3)), 0, 9).label, "15 ft truck");
  });

  it("full_service ниже минимального заказа: продажа вещи экономит только handling", () => {
    const m = move({ moveType: "full_service" });
    const all = vehicleCost(m, 60, 300, 3);
    const without = vehicleCost(m, 30, 200, 2);
    assert.equal(all.rank, without.rank);
    assert.equal(all.cost - without.cost, 15);
    assert.match(all.label, /^~2,000 lb full service$/);
  });

  it("container: ceil(объём / 800)", () => {
    const m = move({ moveType: "container" });
    assert.equal(vehicleCost(m, 400, 0, 5).label, "1 container");
    assert.equal(vehicleCost(m, 600, 0, 5).label, "2 containers");
  });
});

describe("vehicleLoad", () => {
  it("matches the truck vehicleCost picks and counts boxes", () => {
    const items = [item({ volumeCuFt: 100 }), item({ volumeCuFt: 50 })];
    const load = vehicleLoad(move(), items)!;
    assert.equal(load.label, vehicleCost(move(), 150, 0, 2).label);
    assert.equal(load.usedCuFt, 250); // 150 мебели + 100 коробок (минимум)
    assert.equal(load.capacityCuFt, 402);
  });

  it("is null for full service (priced by weight)", () => {
    assert.equal(vehicleLoad(move({ moveType: "full_service" }), [item()]), null);
  });
});

describe("planMove", () => {
  it("diy_truck 10001 → 78701: 20 ft, подсказка продать 3 крупных → 15 ft", () => {
    const items = twelveItems();
    const plan = planMove(move(), items, items.map((i) => est(i)), TODAY);
    assert.equal(plan.vehicle, "20 ft truck");
    assert.equal(plan.vehicleIfShipAll, "20 ft truck");
    assert.ok(plan.tips.length >= 1);
    assert.match(plan.tips[0], /^Sell .+ to drop to a 15 ft truck: save \$\d+$/);
    for (const name of ["Sofa", "Wardrobe", "Dining table"]) assert.ok(plan.tips[0].includes(name), name);
    assert.ok(plan.tips.length <= 2);
  });

  it("full_service < 2000 lb: SELL-вещь не уменьшает перевозку → везём", () => {
    const m = move({ moveType: "full_service" });
    const keep = item({ name: "Dresser", volumeCuFt: 30, weightLb: 130 });
    const cheap = item({ name: "Bookshelf", category: "bookshelf", volumeCuFt: 20, weightLb: 40 });
    const plan = planMove(m, [keep, cheap], [est(keep), est(cheap, { verdict: "SELL", resaleLow: 30, resaleHigh: 50 })], TODAY);
    assert.equal(plan.items.find((p) => p.itemId === cheap.id)?.action, "ship");
    assert.equal(plan.shipCost, plan.shipAllCost);
  });

  it("days = 3 → цена resaleLow, шанс ≤ база × 3/14", () => {
    const m = move({ moveDate: "2026-12-15" });
    const i = item({ category: "dresser" });
    const o = saleOutlook(m, i, est(i, { resaleLow: 100, resaleHigh: 200 }), "2026-12-12");
    assert.ok(o.sellChance <= 0.8 * (3 / 14) + 1e-9);
    assert.equal(o.expectedResale, Math.round(o.sellChance * 100));
    assert.equal(o.sellBy, "2026-12-12"); // за неделю до переезда уже прошло → сегодня
  });

  it("sentimental никогда не продаётся и не попадает в tips", () => {
    const items = twelveItems();
    items[0] = { ...items[0], name: "Grandma's sofa", sentimental: true };
    const plan = planMove(
      move(),
      items,
      items.map((i) => est(i, { verdict: i.sentimental ? "SELL" : "SHIP" })),
      TODAY,
    );
    assert.equal(plan.items.find((p) => p.itemId === items[0].id)?.action, "ship");
    for (const tip of plan.tips) assert.ok(!tip.includes("Grandma"), tip);
  });

  it("SELL: дешёвое — donate, кровать — sell (week1), остальное — sell_buy_later", () => {
    const m = move({ moveType: "container", distanceMi: 2500 });
    // Объём подобран так, что продажа уменьшает число контейнеров.
    const bed = item({ name: "Bed frame", category: "bed_frame", volumeCuFt: 260 });
    const sofa = item({ name: "Sofa", category: "sofa", volumeCuFt: 260 });
    const lamp = item({ name: "Lamp", category: "lamp", volumeCuFt: 260 });
    const base = item({ name: "Dresser", volumeCuFt: 250 });
    const items = [base, bed, sofa, lamp];
    const plan = planMove(
      m,
      items,
      [
        est(base),
        est(bed, { verdict: "SELL", resaleLow: 200, resaleHigh: 300, replaceCost: 150 }),
        est(sofa, { verdict: "SELL", resaleLow: 300, resaleHigh: 400, replaceCost: 200 }),
        est(lamp, { verdict: "SELL", resaleLow: 5, resaleHigh: 15, replaceCost: 20 }),
      ],
      TODAY,
    );
    const act = (i: Item) => plan.items.find((p) => p.itemId === i.id)?.action;
    assert.equal(act(base), "ship");
    assert.equal(act(bed), "sell");
    assert.equal(act(sofa), "sell_buy_later");
    assert.ok(act(lamp) === "donate" || act(lamp) === "ship");
    assert.equal(plan.cashWeek1, 150);
    assert.ok(plan.cashMonth1 >= 200);
    assert.ok(plan.items.find((p) => p.itemId === bed.id)?.sellBy === "2026-12-08");
  });

  it("деньги: netCash и freedCash по формулам, всё в целых долларах", () => {
    const items = twelveItems();
    const ests = items.map((i, k) => est(i, { verdict: k < 3 ? "SELL" : "SHIP", resaleLow: 200, resaleHigh: 300, replaceCost: 120 }));
    const p = planMove(move(), items, ests, TODAY);
    assert.equal(p.netCash, p.cashBeforeMove - p.cashMoveDay - p.cashWeek1 - p.cashMonth1);
    assert.equal(p.netCashIfShipAll, -p.shipAllCost);
    assert.equal(p.freedCash, p.netCash - p.netCashIfShipAll);
    for (const k of ["shipCost", "shipAllCost", "cashBeforeMove", "cashMoveDay", "cashWeek1", "cashMonth1"] as const) {
      assert.ok(Number.isInteger(p[k]) && p[k] >= 0, k);
    }
    assert.equal(p.vehicle, "15 ft truck");
    assert.ok(p.freedCash > 0);
  });

  it("план не хуже «везти всё»: дорогая замена при спуске ступени → везём", () => {
    // Продажа крупной вещи спускает 15 ft → 10 ft, но замена стоит больше экономии.
    const big = item({ name: "Sectional", category: "sectional", volumeCuFt: 120 });
    const rest = [item({ volumeCuFt: 60 }), item({ volumeCuFt: 60 }), item({ volumeCuFt: 50 })];
    const items = [big, ...rest];
    const plan = planMove(
      move(),
      items,
      [est(big, { verdict: "SELL", resaleLow: 100, resaleHigh: 200, replaceCost: 5000 }), ...rest.map((i) => est(i))],
      TODAY,
    );
    assert.equal(plan.items.find((p) => p.itemId === big.id)?.action, "ship");
    assert.equal(plan.freedCash, 0);
    assert.equal(plan.netCash, plan.netCashIfShipAll);
  });

  it("свойство: freedCash ≥ 0 на 200 случайных наборах", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const cats: Category[] = ["sofa", "dresser", "bed_frame", "mattress", "desk", "rug", "wardrobe", "lamp"];
    const types = ["diy_truck", "container", "full_service"] as const;
    for (let k = 0; k < 200; k++) {
      const m = move({ moveType: types[k % 3], distanceMi: Math.round(100 + rnd() * 2500) });
      const items = Array.from({ length: 1 + Math.floor(rnd() * 15) }, () =>
        item({ category: cats[Math.floor(rnd() * cats.length)], volumeCuFt: 5 + rnd() * 120, weightLb: 10 + rnd() * 250, sentimental: rnd() < 0.1 }),
      );
      const ests = items.map((i) => {
        const low = Math.round(rnd() * 400);
        return est(i, {
          verdict: (["SHIP", "SELL", "TOSSUP"] as const)[Math.floor(rnd() * 3)],
          resaleLow: low,
          resaleHigh: low + Math.round(rnd() * 300),
          replaceCost: Math.round(rnd() * 1200),
        });
      });
      const today = rnd() < 0.3 ? "2026-12-12" : TODAY;
      const p = planMove(m, items, ests, today);
      assert.ok(p.freedCash >= 0, `case ${k}: freedCash ${p.freedCash}`);
      assert.ok(p.netCash >= p.netCashIfShipAll, `case ${k}`);
    }
  });

  it("пустой список → только коробки, 10 ft truck", () => {
    const p = planMove(move(), [], [], TODAY);
    assert.equal(p.vehicle, "10 ft truck");
    assert.deepEqual(p.items, []);
  });
});

describe("applyPlanPaywall", () => {
  it("не оплачено: items без locked, tips пустые, агрегаты те же", () => {
    const items = twelveItems();
    const plan = planMove(move(), items, items.map((i) => est(i)), TODAY);
    const locked = items.slice(3).map((i) => i.id);
    const hidden = applyPlanPaywall(plan, locked, false);
    assert.equal(hidden.items.length, 3);
    assert.ok(hidden.items.every((p) => !locked.includes(p.itemId)));
    assert.deepEqual(hidden.tips, []);
    assert.equal(hidden.freedCash, plan.freedCash);
    assert.equal(hidden.vehicle, plan.vehicle);
    assert.deepEqual(applyPlanPaywall(plan, locked, true), plan);
  });
});
