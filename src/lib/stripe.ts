import "server-only";
import Stripe from "stripe";

// Клиент создаём лениво: при `next build` ключа может не быть, а импорт модуля не должен падать.
let client: Stripe | null = null;

/** Stripe-клиент или null, если STRIPE_SECRET_KEY не задан (только сервер, без NEXT_PUBLIC_). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  client ??= new Stripe(key);
  return client;
}

/** Цена разблокировки отчёта, центы USD. */
export const UNLOCK_PRICE_CENTS = 2900; // Move Pass ($29). Keep in sync with PASS_PRICE in src/client/money.ts.
export const UNLOCK_PRODUCT_NAME = "Ship-or-Sell Move Pass — full report & Marketplace listings";
