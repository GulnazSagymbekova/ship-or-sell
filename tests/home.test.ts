import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item, Move } from "../src/types";
import type { HomeItem } from "../src/home-types";
import { estimateMove } from "../src/lib/pricing/index";
import { CSV_HEADER, homeItemsToCsv, homeTotals, replaceNewCost } from "../src/lib/pricing/home";

const hi = (over: Partial<HomeItem> = {}): HomeItem => ({
  id: "x",
  homeId: "h",
  photoPath: null,
  category: "sofa",
  name: "Sofa",
  brand: null,
  material: "fabric",
  condition: 3,
  widthIn: 84,
  depthIn: 36,
  heightIn: 34,
  replaceNew: 900,
  purchasePrice: null,
  serialNumber: null,
  ...over,
});

test("CSV: запятая и кавычка в названии экранируются", () => {
  const csv = homeItemsToCsv([hi({ name: 'Sofa, 3-seat "Kivik"' })], "2026-11-15");
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.ok(lines[2].startsWith('"Sofa, 3-seat ""Kivik""",sofa,'));
  assert.ok(!csv.includes("homes/") && !csv.includes('"x"'), "нет фото и id");
});

test("CSV: пустая опись → строка-пояснение и заголовки", () => {
  const lines = homeItemsToCsv([], "2026-11-15").trim().split("\r\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /generated 2026-11-15\. Values are estimates, not an appraisal\./);
  assert.equal(lines[1], CSV_HEADER.join(","));
});

test("homeTotals: лимит null → coverageGap null; иначе разница", () => {
  assert.deepEqual(homeTotals([hi({ replaceNew: 900 }), hi({ replaceNew: 100.4 })], null), { totalValue: 1000, coverageGap: null });
  assert.deepEqual(homeTotals([hi({ replaceNew: 1500 })], 1000), { totalValue: 1500, coverageGap: 500 });
  assert.deepEqual(homeTotals([], 0), { totalValue: 0, coverageGap: 0 });
});

test("replaceNewCost ≥ replaceCost, целые доллары, детерминированно", () => {
  const move: Move = {
    id: "m", userId: "u", fromZip: "10001", toZip: "78701", distanceMi: 1700,
    moveType: "diy_truck", moveDate: "2026-12-20", status: "paid",
  };
  const cats: Item["category"][] = ["sofa", "mattress", "dresser", "lamp", "rug", "other"];
  for (const category of cats) {
    for (const condition of [1, 3, 5] as const) {
      const item: Item = {
        id: `${category}-${condition}`, moveId: "m", photoPath: "p", category, name: category,
        brand: condition === 5 ? "West Elm" : null, material: "solid oak", condition,
        widthIn: 40, depthIn: 20, heightIn: 30, volumeCuFt: 0, weightLb: 0,
        sentimental: false, userEdited: false, aiConfidence: 0.9,
      };
      const [est] = estimateMove(move, [item]);
      const v = replaceNewCost(item, est);
      assert.ok(Number.isInteger(v) && v >= est.replaceCost, `${category}/${condition}: ${v} < ${est.replaceCost}`);
      assert.equal(replaceNewCost(item, est), v);
    }
  }
});
