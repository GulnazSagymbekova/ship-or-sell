import { NextResponse } from "next/server";
import { z } from "zod";
import type { Home } from "@/home-types";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedMove } from "@/lib/db/access";
import { ITEM_COLUMNS, toItem } from "@/lib/db/mappers";
import { loadEstimates } from "@/lib/db/estimates";
import { HOME_COLUMNS, homeFolder, toHome } from "@/lib/homeplus";
import { replaceNewCost } from "@/lib/pricing/home";
import { PHOTO_BUCKET } from "@/lib/storage";

const Body = z.object({ moveId: z.string() }).strict();

/** GET /api/homes → Home[] (мои описи, новые сверху). */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { data, error } = await auth.supabase
      .from("homes")
      .select(HOME_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const homes: Home[] = (data ?? []).map(toHome);
    return NextResponse.json(homes);
  } catch (err) {
    logError("GET /api/homes", err);
    return apiError("internal");
  }
}

/**
 * POST /api/homes { moveId } → { homeId }. Опись из ОПЛАЧЕННОГО переезда: копия вещей,
 * кроме вердикта SELL (sentimental — всегда), и копия фото в {userId}/homes/{homeId}/.
 * Идемпотентно: дом из этого переезда уже есть → тот же homeId.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId } = body.data;
  if (!isUuid(moveId)) return notFound();

  try {
    const move = await getOwnedMove(supabase, moveId);
    if (!move) return notFound();
    if (move.status !== "paid") return apiError("payment_required", "Unlock the report first");

    const existing = await supabase.from("homes").select("id").eq("source_move_id", moveId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return NextResponse.json({ homeId: String(existing.data.id) });

    const itemsRes = await supabase.from("items").select(ITEM_COLUMNS).eq("move_id", moveId).order("created_at");
    if (itemsRes.error) throw itemsRes.error;
    const items = (itemsRes.data ?? []).map(toItem);
    // Владелец проверен выше, itemIds — от пользовательского клиента.
    const estimates = new Map((await loadEstimates(items.map((i) => i.id))).map((e) => [e.itemId, e]));
    const keep = items.filter((i) => i.sentimental || estimates.get(i.id)?.verdict !== "SELL");

    const created = await supabase
      .from("homes")
      .insert({ user_id: userId, source_move_id: moveId })
      .select("id")
      .single();
    if (created.error) {
      // 23505: параллельный запрос уже создал дом из этого переезда.
      if (created.error.code === "23505") {
        const again = await supabase.from("homes").select("id").eq("source_move_id", moveId).single();
        if (again.error) throw again.error;
        return NextResponse.json({ homeId: String(again.data.id) });
      }
      throw created.error;
    }
    const homeId = String(created.data.id);

    // Фото: одно фото может быть у нескольких вещей — копируем один раз.
    const folder = homeFolder(userId, homeId);
    const copied = new Map<string, string | null>();
    for (const path of new Set(keep.map((i) => i.photoPath))) {
      const to = `${folder}/${path.split("/").pop()}`;
      const { error } = await supabase.storage.from(PHOTO_BUCKET).copy(path, to);
      if (error) logError("POST /api/homes copy", error);
      copied.set(path, error ? null : to);
    }

    if (keep.length > 0) {
      const rows = keep.map((i) => {
        const est = estimates.get(i.id);
        return {
          home_id: homeId,
          photo_path: copied.get(i.photoPath) ?? null,
          category: i.category,
          name: i.name.slice(0, 120) || "Item",
          brand: i.brand,
          material: i.material || "unknown",
          condition: i.condition,
          width_in: i.widthIn,
          depth_in: i.depthIn,
          height_in: i.heightIn,
          replace_new: est ? replaceNewCost(i, est) : 0,
        };
      });
      const ins = await supabase.from("home_items").insert(rows);
      if (ins.error) throw ins.error;
    }

    return NextResponse.json({ homeId }, { status: 201 });
  } catch (err) {
    logError("POST /api/homes", err);
    return apiError("internal");
  }
}
