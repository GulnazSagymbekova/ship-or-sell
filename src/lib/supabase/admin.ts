import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Service-role клиент. ОБХОДИТ RLS. Использовать только:
 *  - в Stripe webhook (нет пользовательской сессии);
 *  - для estimates/listings, которые RLS прячет от пользователя до оплаты
 *    (см. src/lib/db/estimates.ts) — и только ПОСЛЕ проверки владельца
 *    через пользовательский клиент.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
