import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { HomeDetails } from "@/home-types";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getHomePlus, getOwnedHome, HOME_COLUMNS, HOME_ITEM_COLUMNS, HOME_PLUS_BILLING_ENABLED, homeFolder, toHome, toHomeItem } from "@/lib/homeplus";
import { homeTotals } from "@/lib/pricing/home";
import { getSignedPhotoUrls, PHOTO_BUCKET } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/homes/:id → HomeDetails. Чужой/несуществующий → 404. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const home = await getOwnedHome(supabase, id);
    if (!home) return notFound();
    const [itemsRes, homePlus] = await Promise.all([
      supabase.from("home_items").select(HOME_ITEM_COLUMNS).eq("home_id", id).order("created_at"),
      getHomePlus(supabase, userId),
    ]);
    if (itemsRes.error) throw itemsRes.error;
    const items = (itemsRes.data ?? []).map(toHomeItem);
    const photoUrls = await getSignedPhotoUrls(
      supabase,
      [...new Set(items.map((i) => i.photoPath).filter((p): p is string => !!p))],
    );
    const body: HomeDetails = {
      home,
      items,
      photoUrls,
      ...homeTotals(items, home.coverageLimit),
      homePlus: { ...homePlus, billingEnabled: HOME_PLUS_BILLING_ENABLED },
    };
    return NextResponse.json(body);
  } catch (err) {
    logError("GET /api/homes/:id", err);
    return apiError("internal");
  }
}

const Patch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    coverageLimit: z.number().min(0).max(10_000_000).nullable().optional(),
  })
  .strict();

/** PATCH /api/homes/:id { name?, coverageLimit? } → Home. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, Patch);
  if (!body.ok) return body.response;

  const patch: Record<string, unknown> = {};
  if (body.data.name !== undefined) patch.name = body.data.name;
  if (body.data.coverageLimit !== undefined) patch.coverage_limit = body.data.coverageLimit;

  try {
    if (Object.keys(patch).length === 0) {
      const home = await getOwnedHome(auth.supabase, id);
      return home ? NextResponse.json(home) : notFound();
    }
    const { data, error } = await auth.supabase.from("homes").update(patch).eq("id", id).select(HOME_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    return NextResponse.json(toHome(data));
  } catch (err) {
    logError("PATCH /api/homes/:id", err);
    return apiError("internal");
  }
}

/** DELETE /api/homes/:id → 204. Сначала файлы {userId}/homes/{homeId}/*, потом запись (каскад вещей). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const home = await getOwnedHome(supabase, id);
    if (!home) return notFound();
    const folder = homeFolder(userId, id);
    const { data: files, error: listErr } = await supabase.storage.from(PHOTO_BUCKET).list(folder, { limit: 1000 });
    if (listErr) throw listErr;
    const paths = (files ?? []).filter((f) => f.name).map((f) => `${folder}/${f.name}`);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (rmErr) throw rmErr;
    }
    const { error } = await supabase.from("homes").delete().eq("id", id);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logError("DELETE /api/homes/:id", err);
    return apiError("internal");
  }
}
