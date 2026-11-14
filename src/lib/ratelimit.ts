import "server-only";
import type { SupabaseServerClient } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export type AiKind = "analyze" | "listing";

const HOURLY_LIMIT: Record<AiKind, number> = { analyze: 30, listing: 20 };
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function dailyLimit(): number {
  const n = Number(process.env.AI_DAILY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; scope: "hourly"; limit: number }
  | { ok: false; scope: "daily"; limit: number };

/**
 * Проверяет лимиты и, если можно, записывает вызов в ai_calls — ДО обращения к Claude.
 * Счётчики только в Postgres (на Vercel каждый вызов может попасть в новый инстанс).
 *  - часовой лимит на пользователя — своими строками через пользовательский клиент (RLS);
 *  - глобальный суточный — через admin: RLS не даёт пользователю видеть чужие строки.
 */
export async function checkAndRecord(
  supabase: SupabaseServerClient,
  userId: string,
  kind: AiKind,
): Promise<RateLimitResult> {
  const now = Date.now();

  const { count: hourly, error: hErr } = await supabase
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("created_at", new Date(now - HOUR_MS).toISOString());
  if (hErr) throw hErr;
  if ((hourly ?? 0) >= HOURLY_LIMIT[kind]) {
    return { ok: false, scope: "hourly", limit: HOURLY_LIMIT[kind] };
  }

  const limit = dailyLimit();
  const { count: daily, error: dErr } = await createAdminClient()
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(now - DAY_MS).toISOString());
  if (dErr) throw dErr;
  if ((daily ?? 0) >= limit) return { ok: false, scope: "daily", limit };

  const { error: insErr } = await supabase.from("ai_calls").insert({ user_id: userId, kind });
  if (insErr) throw insErr;
  return { ok: true };
}

export function hourlyMessage(kind: AiKind, limit: number) {
  return kind === "analyze"
    ? `You can scan up to ${limit} photos per hour. Please try again later.`
    : `You can generate up to ${limit} listings per hour. Please try again later.`;
}
