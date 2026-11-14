import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { searchPlaces } from "@/lib/places";
import { cityForZip } from "@/lib/zips";

describe("searchPlaces", () => {
  it("короткий запрос → []", () => {
    assert.deepEqual(searchPlaces(""), []);
    assert.deepEqual(searchPlaces("a"), []);
    assert.deepEqual(searchPlaces("78"), []);
  });

  it("aus → первым Austin, TX; ZIP из этого города", () => {
    const [first] = searchPlaces("aus");
    assert.equal(first.label, "Austin, TX");
    assert.equal(cityForZip(first.zip), "Austin");
  });

  it("город + штат: 'austin, tx', 'austin tx', 'Austin, Texas'", () => {
    for (const q of ["austin, tx", "austin tx", "Austin, Texas"]) {
      const res = searchPlaces(q);
      assert.ok(res.length > 0, q);
      assert.ok(res.every((p) => p.state === "TX"), q);
      assert.equal(res[0].label, "Austin, TX", q);
    }
  });

  it("крупные города выше: new york, brook → Brooklyn, chic → Chicago, san fran", () => {
    assert.equal(searchPlaces("new york")[0].label, "New York, NY");
    assert.equal(searchPlaces("brook")[0].label, "Brooklyn, NY");
    assert.equal(searchPlaces("chic")[0].label, "Chicago, IL");
    assert.equal(searchPlaces("san fran")[0].label, "San Francisco, CA");
  });

  it("цифры → по началу ZIP, с подписью города", () => {
    const res = searchPlaces("787");
    assert.ok(res.length > 0 && res.length <= 8);
    assert.ok(res.every((p) => p.zip.startsWith("787")));
    assert.deepEqual(searchPlaces("10001")[0], { zip: "10001", city: "New York", state: "NY", label: "10001 — New York, NY" });
  });

  it("не больше 8 вариантов, все ZIP — 5 цифр", () => {
    const res = searchPlaces("spring");
    assert.ok(res.length <= 8);
    assert.ok(res.every((p) => /^\d{5}$/.test(p.zip)));
  });
});
