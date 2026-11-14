import "server-only";
import type { SupabaseServerClient } from "@/lib/http";

export const PHOTO_BUCKET = "photos";
export const SIGNED_URL_TTL_SECONDS = 600;

/** Путь фото: {userId}/{moveId}/{uuid}.jpg — первая папка = владелец (политика Storage). */
export function photoPathFor(userId: string, moveId: string, fileId: string) {
  return `${userId}/${moveId}/${fileId}.jpg`;
}

/** photoPath принадлежит этому пользователю и этому переезду. */
export function isPhotoPathOf(path: string, userId: string, moveId: string) {
  return path.startsWith(`${userId}/${moveId}/`) && !path.includes("..");
}

/** Signed URL на одно фото (TTL 600 с). null, если файла нет или нет доступа. */
export async function getSignedPhotoUrl(
  supabase: SupabaseServerClient,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Пачкой: photoPath → signed URL. Отсутствующие файлы пропускаются. */
export async function getSignedPhotoUrls(
  supabase: SupabaseServerClient,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const entry of data) {
    if (entry.path && entry.signedUrl && !entry.error) out[entry.path] = entry.signedUrl;
  }
  return out;
}
