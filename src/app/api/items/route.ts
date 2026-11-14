import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { countItems, getOwnedMove, MAX_ITEMS_PER_MOVE, photoBelongsToMove } from "@/lib/db/access";
import { ITEM_COLUMNS, itemToRow, toItem } from "@/lib/db/mappers";
import { CATEGORIES } from "@/lib/categories";
import { defaultsFor, packedVolumeCuFt } from "@/lib/category-defaults";

const Body = z
  .object({
    moveId: z.string().refine(isUuid, "Invalid moveId"),
    photoPath: z.string().min(1).max(300),
    category: z.enum(CATEGORIES),
    name: z.string().trim().min(1).max(120),
  })
  .strict();

/** POST /api/items { moveId, photoPath, category, name } → Item (вещь, которую пропустил AI). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId, photoPath, category, name } = body.data;

  try {
    const move = await getOwnedMove(supabase, moveId);
    if (!move) return notFound();
    if (!(await photoBelongsToMove(supabase, photoPath, userId, moveId))) return notFound();
    if ((await countItems(supabase, moveId)) >= MAX_ITEMS_PER_MOVE) {
      return apiError("rate_limited", `Up to ${MAX_ITEMS_PER_MOVE} items per move`);
    }

    const d = defaultsFor(category);
    const row = itemToRow({
      moveId,
      photoPath,
      category,
      name,
      brand: null,
      material: "unknown",
      condition: 3,
      widthIn: d.widthIn,
      depthIn: d.depthIn,
      heightIn: d.heightIn,
      volumeCuFt: packedVolumeCuFt(d.widthIn, d.depthIn, d.heightIn),
      weightLb: d.weightLb,
      sentimental: false,
      userEdited: true,
      aiConfidence: 1,
    });

    const { data, error } = await supabase.from("items").insert(row).select(ITEM_COLUMNS).single();
    if (error || !data) throw error;
    return NextResponse.json(toItem(data), { status: 201 });
  } catch (err) {
    logError("POST /api/items", err);
    return apiError("internal");
  }
}
