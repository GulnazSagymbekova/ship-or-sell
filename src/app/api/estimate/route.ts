import { NextResponse } from "next/server";
import { z } from "zod";
import type { Estimate, EstimateResult, Item } from "@/types";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedMove } from "@/lib/db/access";
import { estimateToRow, ITEM_COLUMNS, toItem } from "@/lib/db/mappers";
import { applyPaywall, applyPlanPaywall } from "@/lib/paywall";
import { estimateMove } from "@/lib/pricing";
import { planMove } from "@/lib/pricing/plan";
import { createAdminClient } from "@/lib/supabase/admin";

const Body = z.object({ moveId: z.string().refine(isUuid, "Invalid moveId") }).strict();
const ROUTE = "POST /api/estimate";

const money = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
};

/**
 * POST /api/estimate { moveId } → EstimateResult.
 * Формулы — estimateMove от C (чистая функция). Здесь: владелец, загрузка, сохранение
 * ПОЛНЫХ цифр (через admin: RLS прячет estimates до оплаты), скрытие в ответе.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId } = body.data;

  try {
    const move = await getOwnedMove(supabase, moveId);
    if (!move) return notFound();

    const { data: rows, error: itemsErr } = await supabase
      .from("items")
      .select(ITEM_COLUMNS)
      .eq("move_id", moveId)
      .order("created_at");
    if (itemsErr) throw itemsErr;
    const items = (rows ?? []).map(toItem);
    if (items.length === 0) return apiError("conflict", "Add at least one item before calculating");

    // Страховка от ошибок в формулах: только вещи этого move, числа ≥ 0, sentimental → SHIP.
    const byId = new Map<string, Item>(items.map((i) => [i.id, i]));
    const estimates: Estimate[] = estimateMove(move, items)
      .filter((e) => byId.has(e.itemId))
      .map((e) => ({
        itemId: e.itemId,
        shipCost: money(e.shipCost),
        resaleLow: money(e.resaleLow),
        resaleHigh: Math.max(money(e.resaleLow), money(e.resaleHigh)),
        replaceCost: money(e.replaceCost),
        verdict: byId.get(e.itemId)!.sentimental ? "SHIP" : e.verdict,
        savings: money(e.savings),
        confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0)),
      }));

    const admin = createAdminClient();
    // Сохраняем полные цифры. Оценки удалённых вещей ушли каскадом вместе с вещами.
    const { error: upErr } = await admin
      .from("estimates")
      .upsert(estimates.map(estimateToRow), { onConflict: "item_id" });
    if (upErr) throw upErr;

    // Вещи без оценки (если формулы что-то пропустили) — убираем их старые оценки.
    const missing = items.filter((i) => !estimates.some((e) => e.itemId === i.id)).map((i) => i.id);
    if (missing.length > 0) {
      const { error: delErr } = await admin.from("estimates").delete().in("item_id", missing);
      if (delErr) throw delErr;
    }

    // analyzed, но не понижаем paid (его ставит только webhook; триггер не даст снять).
    if (move.status !== "paid" && move.status !== "analyzed") {
      const { error: stErr } = await supabase.from("moves").update({ status: "analyzed" }).eq("id", moveId);
      if (stErr) throw stErr;
    }

    const paywalled = applyPaywall(move, estimates, items);
    // План — по ПОЛНЫМ цифрам; «сегодня» берём здесь, pricing остаётся чистым.
    const today = new Date().toISOString().slice(0, 10);
    const plan = planMove(move, items, estimates, today);
    const result: EstimateResult = {
      ...paywalled,
      plan: applyPlanPaywall(plan, paywalled.lockedItemIds, move.status === "paid"),
    };
    return NextResponse.json(result);
  } catch (err) {
    logError(ROUTE, err);
    return apiError("internal");
  }
}
