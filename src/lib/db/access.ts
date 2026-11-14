import "server-only";
import type { Item, Move } from "@/types";
import type { SupabaseServerClient } from "@/lib/http";
import { isUuid } from "@/lib/http";
import { isPhotoPathOf } from "@/lib/storage";
import { ITEM_COLUMNS, MOVE_COLUMNS, toItem, toMove } from "./mappers";

// Все проверки — пользовательским клиентом: RLS сама скрывает чужое, «нет строки» = 404.

export const MAX_ITEMS_PER_MOVE = 60;

export async function getOwnedMove(supabase: SupabaseServerClient, moveId: string): Promise<Move | null> {
  if (!isUuid(moveId)) return null;
  const { data, error } = await supabase.from("moves").select(MOVE_COLUMNS).eq("id", moveId).maybeSingle();
  if (error) throw error;
  return data ? toMove(data) : null;
}

export async function getOwnedItem(supabase: SupabaseServerClient, itemId: string): Promise<Item | null> {
  if (!isUuid(itemId)) return null;
  const { data, error } = await supabase.from("items").select(ITEM_COLUMNS).eq("id", itemId).maybeSingle();
  if (error) throw error;
  return data ? toItem(data) : null;
}

/** Фото принадлежит пользователю, этому move и реально загружено (есть строка в photos). */
export async function photoBelongsToMove(
  supabase: SupabaseServerClient,
  photoPath: string,
  userId: string,
  moveId: string,
): Promise<boolean> {
  if (!isPhotoPathOf(photoPath, userId, moveId)) return false;
  const { data, error } = await supabase
    .from("photos")
    .select("id")
    .eq("path", photoPath)
    .eq("move_id", moveId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function countItems(supabase: SupabaseServerClient, moveId: string): Promise<number> {
  const { count, error } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .eq("move_id", moveId);
  if (error) throw error;
  return count ?? 0;
}
