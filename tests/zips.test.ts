import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zips from "@/data/zips.json";
import { cityForZip, distanceMiBetween, lookupZip } from "@/lib/zips";

describe("zips.json", () => {
  it("keys are 5-digit strings with leading zeros, values have lat/lng/city/state", () => {
    const entries = Object.entries(zips as Record<string, { lat: number; lng: number; city: string; state: string }>);
    assert.ok(entries.length > 40000);
    for (const [zip, v] of entries) {
      assert.match(zip, /^\d{5}$/);
      assert.ok(Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180, zip);
      assert.ok(v.city.length > 0 && /^[A-Z]{2}$/.test(v.state), zip);
    }
  });

  it("known cities and distances", () => {
    assert.equal(cityForZip("02108"), "Boston");
    assert.equal(cityForZip("78701"), "Austin");
    assert.equal(lookupZip("99999"), null);
    const nyToAustin = distanceMiBetween("10001", "78701");
    assert.ok(nyToAustin !== null && nyToAustin > 1700 && nyToAustin < 2100, String(nyToAustin));
  });

  it("company-only ZIPs show the real city, not the company", () => {
    assert.equal(cityForZip("11255"), "Brooklyn"); // was "Ny Telephone"
    assert.equal(cityForZip("35225"), "Birmingham"); // was "Bham"
    assert.equal(cityForZip("94138"), "San Francisco"); // was "Wells Fargo Bank"
  });
});
