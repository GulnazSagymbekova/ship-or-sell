import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estimateMove } from "@/lib/pricing";
import type { Item, Move } from "@/types";

const move = (over: Partial<Move> = {}): Move => ({
  id: "move-1",
  userId: "user-1",
  fromZip: "10001",
  toZip: "78701",
  distanceMi: 1000,
  moveType: "diy_truck",
  moveDate: "2026-12-01",
  status: "analyzed",
  ...over,
});

const item = (over: Partial<Item> = {}): Item => ({
  id: "item-1",
  moveId: "move-1",
  photoPath: "user-1/move-1/photo.jpg",
  category: "dresser",
  name: "Dresser",
  brand: null,
  material: "wood",
  condition: 3,
  widthIn: 60,
  depthIn: 20,
  heightIn: 34,
  volumeCuFt: 26,
  weightLb: 130,
  sentimental: false,
  userEdited: false,
  aiConfidence: 0.85,
  ...over,
});

const cheapParticleboard = item({ id: "cheap", brand: "IKEA", material: "particleboard" });
const solidWood = item({
  id: "solid",
  brand: "Restoration Hardware",
  material: "solid walnut",
  condition: 4,
});

const MONEY = ["shipCost", "resaleLow", "resaleHigh", "replaceCost", "savings"] as const;
const MOVE_TYPES = ["diy_truck", "container", "full_service"] as const;

describe("estimateMove", () => {
  it("empty items → []", () => {
    assert.deepEqual(estimateMove(move(), []), []);
  });

  for (const moveType of MOVE_TYPES) {
    it(`cheap particleboard, 2000 mi, ${moveType} → SELL`, () => {
      const [e] = estimateMove(move({ distanceMi: 2000, moveType }), [cheapParticleboard]);
      assert.equal(e.verdict, "SELL");
      assert.ok(e.savings > 0);
    });

    it(`expensive solid wood, 200 mi, ${moveType} → SHIP`, () => {
      const [e] = estimateMove(move({ distanceMi: 200, moveType }), [solidWood]);
      assert.equal(e.verdict, "SHIP");
      assert.ok(e.savings > 0);
    });
  }

  it("sentimental → SHIP, numbers still computed", () => {
    const m = move({ distanceMi: 2000, moveType: "full_service" });
    const [normal] = estimateMove(m, [cheapParticleboard]);
    const [kept] = estimateMove(m, [{ ...cheapParticleboard, sentimental: true }]);
    assert.equal(normal.verdict, "SELL");
    assert.equal(kept.verdict, "SHIP");
    for (const k of MONEY) assert.equal(kept[k], normal[k], k);
    assert.ok(kept.shipCost > 0);
  });

  it("distanceMi = null does not throw and matches the 1000 mi default", () => {
    const [nullDist] = estimateMove(move({ distanceMi: null }), [solidWood]);
    const [thousand] = estimateMove(move({ distanceMi: 1000 }), [solidWood]);
    assert.equal(nullDist.shipCost, thousand.shipCost);
    assert.ok(nullDist.confidence <= thousand.confidence);
  });

  it("one estimate per item, same order, valid ranges", () => {
    const categories = [
      "sofa", "sectional", "armchair", "bed_frame", "mattress", "dresser", "nightstand",
      "dining_table", "dining_chair", "coffee_table", "desk", "office_chair", "bookshelf",
      "tv_stand", "wardrobe", "rug", "lamp", "other",
    ] as const;
    const items = categories.flatMap((category, i) =>
      ([1, 3, 5] as const).map((condition) =>
        item({ id: `${category}-${condition}`, category, condition, aiConfidence: (i % 10) / 10 }),
      ),
    );
    for (const moveType of MOVE_TYPES) {
      for (const distanceMi of [0, 50, 1000, 3000, null]) {
        const out = estimateMove(move({ moveType, distanceMi }), items);
        assert.equal(out.length, items.length);
        out.forEach((e, i) => {
          assert.equal(e.itemId, items[i].id);
          for (const k of MONEY) {
            assert.ok(Number.isInteger(e[k]) && e[k] >= 0, `${k}=${e[k]}`);
          }
          assert.ok(e.resaleLow <= e.resaleHigh);
          assert.ok(e.confidence >= 0 && e.confidence <= 1);
          assert.ok(["SHIP", "SELL", "TOSSUP"].includes(e.verdict));
        });
      }
    }
  });

  it("broken numbers from AI (0 / NaN) fall back to category defaults", () => {
    const [e] = estimateMove(move(), [
      item({ volumeCuFt: 0, weightLb: Number.NaN, widthIn: 0, depthIn: 0, heightIn: 0 }),
    ]);
    for (const k of MONEY) assert.ok(Number.isInteger(e[k]) && e[k] >= 0);
    assert.ok(e.shipCost > 0);
  });

  it("is deterministic", () => {
    const items = [cheapParticleboard, solidWood];
    assert.deepEqual(estimateMove(move(), items), estimateMove(move(), items));
  });

  it("verdict follows the agreed rule (diff vs threshold)", () => {
    for (const e of estimateMove(move({ distanceMi: 1500 }), [cheapParticleboard, solidWood])) {
      const sellNet = e.replaceCost - (e.resaleLow + e.resaleHigh) / 2;
      const diff = e.shipCost - sellNet;
      const threshold = Math.max(25, 0.1 * e.shipCost);
      const expected = diff > threshold ? "SELL" : diff < -threshold ? "SHIP" : "TOSSUP";
      assert.equal(e.verdict, expected);
      assert.equal(e.savings, Math.round(Math.abs(diff)));
    }
  });
});
