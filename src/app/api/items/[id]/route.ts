import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedItem } from "@/lib/db/access";
import { ITEM_COLUMNS, itemToRow, toItem } from "@/lib/db/mappers";
import { CATEGORIES } from "@/lib/categories";
import { packedVolumeCuFt } from "@/lib/category-defaults";

type Ctx = { params: Promise<{ id: string }> };

const dim = z.number().finite().min(0).max(600);

// id, moveId, photoPath, aiConfidence, userEdited менять нельзя — их нет в схеме, а .strict()
// отвергает лишние поля с 400.
const Patch = z
  .object({
    category: z.enum(CATEGORIES),
    name: z.string().trim().min(1).max(120),
    brand: z.string().trim().max(80).nullable(),
    material: z.string().trim().min(1).max(80),
    condition: z.number().int().min(1).max(5),
    widthIn: dim,
    depthIn: dim,
    heightIn: dim,
    volumeCuFt: z.number().finite().min(0).max(1000),
    weightLb: z.number().finite().min(0).max(2000),
    sentimental: z.boolean(),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");

/** PATCH /api/items/:id — частичный Item → Item. userEdited = true. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase } = auth;

  const body = await parseJson(req, Patch);
  if (!body.ok) return body.response;
  const patch = body.data;

  try {
    const current = await getOwnedItem(supabase, id);
    if (!current) return notFound();

    // Поменялись размеры, а объём не передан — пересчитываем.
    const dimsChanged =
      patch.widthIn !== undefined || patch.depthIn !== undefined || patch.heightIn !== undefined;
    const volumeCuFt =
      patch.volumeCuFt ??
      (dimsChanged
        ? packedVolumeCuFt(
            patch.widthIn ?? current.widthIn,
            patch.depthIn ?? current.depthIn,
            patch.heightIn ?? current.heightIn,
          )
        : undefined);

    const row = itemToRow({
      ...patch,
      brand: patch.brand === undefined ? undefined : patch.brand || null,
      condition: patch.condition as 1 | 2 | 3 | 4 | 5 | undefined,
      volumeCuFt,
      userEdited: true,
    });

    const { data, error } = await supabase
      .from("items")
      .update(row)
      .eq("id", id)
      .select(ITEM_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    return NextResponse.json(toItem(data));
  } catch (err) {
    logError("PATCH /api/items/:id", err);
    return apiError("internal");
  }
}

/** DELETE /api/items/:id → 204. Estimate и listing удаляются каскадом, фото остаётся. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const current = await getOwnedItem(auth.supabase, id);
    if (!current) return notFound();
    const { error } = await auth.supabase.from("items").delete().eq("id", id);
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logError("DELETE /api/items/:id", err);
    return apiError("internal");
  }
}
