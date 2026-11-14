import { NextResponse } from "next/server";
import sharp from "sharp";
import { apiError, isUuid, logError, notFound, requireUser } from "@/lib/http";
import { PHOTO_BUCKET, photoPathFor } from "@/lib/storage";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_MOVE = 20;

/**
 * POST /api/upload — multipart: file (1 изображение), moveId.
 * Перекодируем через sharp: поворот по EXIF, ≤1600px, JPEG q85. Метаданные (EXIF/GPS)
 * sharp по умолчанию не переносит. Кладём в photos/{userId}/{moveId}/{uuid}.jpg.
 * → { photoPath }
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError("bad_request", "Expected multipart/form-data");
  }

  const moveId = form.get("moveId");
  const files = form.getAll("file");
  if (typeof moveId !== "string" || !isUuid(moveId)) {
    return apiError("bad_request", "moveId is required");
  }
  if (files.length !== 1 || !(files[0] instanceof File)) {
    return apiError("bad_request", "Exactly one file is required");
  }
  const file = files[0];
  if (!file.type.startsWith("image/")) return apiError("bad_request", "Only images are allowed");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return apiError("bad_request", "Image must be 10 MB or smaller");
  }

  // Владелец move (RLS).
  const { data: move, error: moveErr } = await supabase
    .from("moves")
    .select("id")
    .eq("id", moveId)
    .maybeSingle();
  if (moveErr) {
    logError("POST /api/upload", moveErr);
    return apiError("internal");
  }
  if (!move) return notFound();

  const { count, error: countErr } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("move_id", moveId);
  if (countErr) {
    logError("POST /api/upload", countErr);
    return apiError("internal");
  }
  if ((count ?? 0) >= MAX_PHOTOS_PER_MOVE) {
    return apiError("rate_limited", `Up to ${MAX_PHOTOS_PER_MOVE} photos per move`);
  }

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "error" })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return apiError("bad_request", "Unsupported or corrupted image");
  }

  const photoPath = photoPathFor(userId, moveId, crypto.randomUUID());

  // Сначала строка в photos: триггер в БД атомарно держит лимит 20 при параллельных загрузках.
  const { error: rowErr } = await supabase.from("photos").insert({ move_id: moveId, path: photoPath });
  if (rowErr) {
    if (rowErr.code === "P0429") {
      return apiError("rate_limited", `Up to ${MAX_PHOTOS_PER_MOVE} photos per move`);
    }
    logError("POST /api/upload", rowErr);
    return apiError("internal");
  }

  const { error: upErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(photoPath, jpeg, { contentType: "image/jpeg", upsert: false });
  if (upErr) {
    logError("POST /api/upload", upErr);
    await supabase.from("photos").delete().eq("path", photoPath);
    return apiError("internal");
  }

  return NextResponse.json({ photoPath }, { status: 201 });
}
