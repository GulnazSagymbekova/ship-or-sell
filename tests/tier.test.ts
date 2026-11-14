import { test } from "node:test";
import assert from "node:assert/strict";
import { PASS_PRICE_CENTS, PRO_PRICE_CENTS, PRO_UPGRADE_CENTS, tierFromPayments } from "../src/lib/tier";

test("tierFromPayments: не оплачено → free, даже если суммы есть", () => {
  assert.equal(tierFromPayments(false, [PRO_PRICE_CENTS]), "free");
});

test("tierFromPayments: Pass $29 → pass, сразу Pro $79 → pro", () => {
  assert.equal(tierFromPayments(true, [PASS_PRICE_CENTS]), "pass");
  assert.equal(tierFromPayments(true, [PRO_PRICE_CENTS]), "pro");
});

test("tierFromPayments: Pass + апгрейд $50 = Pro", () => {
  assert.equal(PRO_UPGRADE_CENTS, 5000);
  assert.equal(tierFromPayments(true, [PASS_PRICE_CENTS, PRO_UPGRADE_CENTS]), "pro");
});

test("tierFromPayments: мусор в суммах не ломает расчёт", () => {
  assert.equal(tierFromPayments(true, [Number.NaN, PASS_PRICE_CENTS]), "pass");
  assert.equal(tierFromPayments(true, []), "pass");
});
