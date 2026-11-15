import { test } from "node:test";
import assert from "node:assert/strict";
import type { MovePlan } from "../src/types";
import { summaryFromPlan } from "../src/lib/paywall";

const plan = (over: Partial<MovePlan>): MovePlan => ({
  vehicle: "15 ft truck",
  vehicleIfShipAll: "15 ft truck",
  shipCost: 831,
  shipAllCost: 831,
  cashBeforeMove: 0,
  cashMoveDay: 831,
  cashWeek1: 0,
  cashMonth1: 0,
  netCash: -831,
  netCashIfShipAll: -831,
  freedCash: 0,
  items: [
    { itemId: "a", action: "ship", sellChance: 0, expectedResale: 0, sellBy: null },
    { itemId: "b", action: "ship", sellChance: 0, expectedResale: 0, sellBy: null },
  ],
  tips: [],
  ...over,
});

test("summaryFromPlan: «везти всё» — сводка совпадает с планом (баг из теста: $358 против $831)", () => {
  assert.deepEqual(summaryFromPlan(plan({})), { sellCount: 0, totalSavings: 0, shipAllCost: 831, optimalCost: 831 });
});

test("summaryFromPlan: план продаёт вещи — экономия = freedCash, вещей = всё, что не везём", () => {
  const p = plan({
    shipCost: 402,
    shipAllCost: 1016,
    freedCash: 420,
    items: [
      { itemId: "a", action: "sell", sellChance: 0.8, expectedResale: 200, sellBy: "2026-12-13" },
      { itemId: "b", action: "donate", sellChance: 0, expectedResale: 0, sellBy: null },
      { itemId: "c", action: "ship", sellChance: 0, expectedResale: 0, sellBy: null },
    ],
  });
  assert.deepEqual(summaryFromPlan(p), { sellCount: 2, totalSavings: 420, shipAllCost: 1016, optimalCost: 402 });
});
