import type { MoveTier } from "@/types";

/** Move Pass, центы USD. Совпадает с UNLOCK_PRICE_CENTS в src/lib/stripe.ts. */
export const PASS_PRICE_CENTS = 2900;
/** Move Pro ($79): всё из Pass + бюджет по датам, проверка мувера, опись для страховки. */
export const PRO_PRICE_CENTS = 7900; // Keep in sync with PRO_PRICE in src/client/money.ts.
/** Переход с уже оплаченного Pass на Pro: разница в цене. */
export const PRO_UPGRADE_CENTS = PRO_PRICE_CENTS - PASS_PRICE_CENTS;
export const PRO_PRODUCT_NAME = "Ship-or-Sell Move Pro — budget by date, mover check, home inventory";
export const PRO_UPGRADE_PRODUCT_NAME = "Ship-or-Sell Move Pro — upgrade from Move Pass";

/**
 * Тариф по сумме оплат за переезд (webhook пишет каждую оплату в payments).
 * Без миграции БД: $29 → pass, ≥ $79 (сразу Pro или Pass + апгрейд $50) → pro.
 */
export function tierFromPayments(paid: boolean, amountsCents: number[]): MoveTier {
  if (!paid) return "free";
  const total = amountsCents.reduce((s, a) => s + (Number(a) || 0), 0);
  return total >= PRO_PRICE_CENTS ? "pro" : "pass";
}
