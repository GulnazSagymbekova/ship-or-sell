import { NextResponse, type NextRequest } from "next/server";
import type { MoveDetails } from "@/types";
import { apiError, isUuid, logError, notFound, requireUser } from "@/lib/http";
import { ITEM_COLUMNS, MOVE_COLUMNS, toItem, toMove } from "@/lib/db/mappers";
import { loadEstimates, loadListings } from "@/lib/db/estimates";
import { applyPaywall } from "@/lib/paywall";
import { getSignedPhotoUrls, PHOTO_BUCKET } from "@/lib/storage";
import { cityForZip } from "@/lib/zips";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/moves/:id → MoveDetails. Чужой или несуществующий id → 404. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  try {
    // RLS: чужой move просто не найдётся.
    const { data: moveRow, error: moveErr } = await supabase
      .from("moves")
      .select(MOVE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (moveErr) throw moveErr;
    if (!moveRow) return notFound();
    const move = toMove(moveRow);

    const [itemsRes, photosRes] = await Promise.all([
      supabase.from("items").select(ITEM_COLUMNS).eq("move_id", id).order("created_at"),
      supabase.from("photos").select("path").eq("move_id", id).order("created_at"),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    if (photosRes.error) throw photosRes.error;

    const items = (itemsRes.data ?? []).map(toItem);
    const itemIds = items.map((i) => i.id);
    const photoPaths = (photosRes.data ?? []).map((p) => p.path as string);

    // Владелец уже проверен выше; itemIds получены пользовательским клиентом.
    const [photoUrls, fullEstimates, listings] = await Promise.all([
      getSignedPhotoUrls(supabase, photoPaths),
      loadEstimates(itemIds),
      move.status === "paid" ? loadListings(itemIds) : Promise.resolve([]),
    ]);

    const paywalled =
      fullEstimates.length > 0 ? applyPaywall(move, fullEstimates, items) : null;

    const body: MoveDetails = {
      move,
      fromCity: cityForZip(move.fromZip),
      toCity: cityForZip(move.toZip),
      items,
      photoUrls,
      estimates: paywalled?.estimates ?? [],
      lockedItemIds: paywalled?.lockedItemIds ?? [],
      summary: paywalled?.summary ?? null,
      listings,
    };
    return NextResponse.json(body);
  } catch (err) {
    logError("GET /api/moves/:id", err);
    return apiError("internal");
  }
}

/** DELETE /api/moves/:id → 204. Сначала файлы в Storage, потом запись (каскад). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const { data: moveRow, error: moveErr } = await supabase
      .from("moves")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (moveErr) throw moveErr;
    if (!moveRow) return notFound();

    const folder = `${userId}/${id}`;
    const { data: files, error: listErr } = await supabase.storage
      .from(PHOTO_BUCKET)
      .list(folder, { limit: 1000 });
    if (listErr) throw listErr;
    const paths = (files ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (rmErr) throw rmErr;
    }

    const { error: delErr } = await supabase.from("moves").delete().eq("id", id);
    if (delErr) throw delErr;

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logError("DELETE /api/moves/:id", err);
    return apiError("internal");
  }
}
