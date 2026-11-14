import "server-only";
import type { Category } from "@/types";
import type { Home, HomeItem } from "@/home-types";
import type { SupabaseServerClient } from "@/lib/http";
import { isUuid } from "@/lib/http";

/** Оплата Home+ включается флагом (этап 2). Без него — waitlist. Только сервер. */
export const HOME_PLUS_BILLING_ENABLED = process.env.HOME_PLUS_BILLING === "true";

export const HOME_COLUMNS = "id, name, source_move_id, coverage_limit, created_at";
export const HOME_ITEM_COLUMNS =
  "id, home_id, photo_path, category, name, brand, material, condition, width_in, depth_in, height_in, replace_new, purchase_price, serial_number";

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toHome(r: Row): Home {
  return {
    id: String(r.id),
    name: String(r.name),
    sourceMoveId: (r.source_move_id as string | null) ?? null,
    coverageLimit: num(r.coverage_limit),
    createdAt: String(r.created_at),
  };
}

export function toHomeItem(r: Row): HomeItem {
  return {
    id: String(r.id),
    homeId: String(r.home_id),
    photoPath: (r.photo_path as string | null) ?? null,
    category: r.category as Category,
    name: String(r.name),
    brand: (r.brand as string | null) ?? null,
    material: String(r.material),
    condition: Number(r.condition) as HomeItem["condition"],
    widthIn: Number(r.width_in),
    depthIn: Number(r.depth_in),
    heightIn: Number(r.height_in),
    replaceNew: Number(r.replace_new),
    purchasePrice: num(r.purchase_price),
    serialNumber: (r.serial_number as string | null) ?? null,
  };
}

/** Своя подписка: trialing/active и период не истёк. RLS отдаёт только свою строку. */
export async function getHomePlus(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<{ active: boolean; status: string | null }> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { active: false, status: null };
  const status = String(data.status);
  const active =
    (status === "trialing" || status === "active") && new Date(String(data.current_period_end)).getTime() > Date.now();
  return { active, status };
}

export async function hasHomePlus(supabase: SupabaseServerClient, userId: string): Promise<boolean> {
  return (await getHomePlus(supabase, userId)).active;
}

/** Как getOwnedMove: RLS прячет чужое, «нет строки» = 404. */
export async function getOwnedHome(supabase: SupabaseServerClient, homeId: string): Promise<Home | null> {
  if (!isUuid(homeId)) return null;
  const { data, error } = await supabase.from("homes").select(HOME_COLUMNS).eq("id", homeId).maybeSingle();
  if (error) throw error;
  return data ? toHome(data) : null;
}

/** Папка фото описи. Первая папка = userId, иначе не пустит политика bucket. */
export const homeFolder = (userId: string, homeId: string) => `${userId}/homes/${homeId}`;

/** Home+ price: $4.99/mo after a 30-day trial. Price is created inline in Checkout (no dashboard product needed). */
export const HOME_PLUS_PRICE_CENTS = 499;
export const HOME_PLUS_TRIAL_DAYS = 30;
export const HOME_PLUS_PRODUCT_NAME = "Ship-or-Sell Home+ — home inventory for insurance";

/** Stripe status → our CHECK list in 0003_home_plus.sql. */
export function toSubscriptionStatus(s: string): "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "unpaid" {
  switch (s) {
    case "trialing":
    case "active":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return s;
    default: // incomplete_expired, paused, …
      return "canceled";
  }
}
