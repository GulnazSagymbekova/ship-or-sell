import "server-only";
import type { Estimate, Listing } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESTIMATE_COLUMNS, LISTING_COLUMNS, toEstimate, toListing } from "./mappers";

// RLS прячет estimates/listings от пользователя до оплаты (иначе полные цифры можно
// достать прямым запросом к PostgREST). Поэтому читаем/пишем их service-role клиентом.
// ВЫЗЫВАТЬ ТОЛЬКО ПОСЛЕ того, как владелец move проверен пользовательским клиентом,
// и передавать itemIds, полученные тем же пользовательским клиентом.

export async function loadEstimates(itemIds: string[]): Promise<Estimate[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("estimates")
    .select(ESTIMATE_COLUMNS)
    .in("item_id", itemIds);
  if (error) throw error;
  return (data ?? []).map(toEstimate);
}

export async function loadListings(itemIds: string[]): Promise<Listing[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .in("item_id", itemIds);
  if (error) throw error;
  return (data ?? []).map(toListing);
}
