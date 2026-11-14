import { NextResponse } from "next/server";
import { z } from "zod";
import type { Listing } from "@/types";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedItem, getOwnedMove } from "@/lib/db/access";
import { loadEstimates, loadListings } from "@/lib/db/estimates";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiInvalidOutputError, AiUnavailableError, demoFallbackEnabled } from "@/lib/ai/client";
import { generateListing, templateListing } from "@/lib/ai/listing";
import { checkAndRecord, hourlyMessage } from "@/lib/ratelimit";
import { cityForZip } from "@/lib/zips";

const Body = z.object({ itemId: z.string().refine(isUuid, "Invalid itemId") }).strict();
const ROUTE = "POST /api/listings";

/** POST /api/listings { itemId } → Listing. Только после оплаты и для SELL / TOSSUP. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { itemId } = body.data;

  try {
    // Владелец — пользовательским клиентом (RLS). Дальше admin только для estimates/listings.
    const item = await getOwnedItem(supabase, itemId);
    if (!item) return notFound();
    const move = await getOwnedMove(supabase, item.moveId);
    if (!move) return notFound();
    if (move.status !== "paid") {
      return apiError("payment_required", "Unlock full report & listings to get Marketplace listings");
    }

    const [estimate] = await loadEstimates([itemId]);
    if (!estimate) return apiError("conflict", "Calculate estimates first");
    if (estimate.verdict !== "SELL" && estimate.verdict !== "TOSSUP") {
      return apiError("conflict", "Listings are only for items worth selling");
    }

    // Кэш: уже сгенерированное объявление лимит не тратит.
    const [cached] = await loadListings([itemId]);
    if (cached) return NextResponse.json(cached);

    const fromCity = cityForZip(move.fromZip);
    let listing: Listing;

    const limit = await checkAndRecord(supabase, userId, "listing");
    if (!limit.ok) {
      if (limit.scope === "hourly") return apiError("rate_limited", hourlyMessage("listing", limit.limit));
      if (!demoFallbackEnabled()) return apiError("unavailable", "Daily AI limit reached");
      listing = templateListing(item, estimate, fromCity, move.moveDate);
    } else {
      try {
        listing = await generateListing(item, estimate, fromCity, move.moveDate);
      } catch (err) {
        if (!(err instanceof AiUnavailableError || err instanceof AiInvalidOutputError)) throw err;
        logError(ROUTE, err);
        if (!demoFallbackEnabled()) {
          return apiError("unavailable", "AI is temporarily unavailable, try again in a minute");
        }
        listing = templateListing(item, estimate, fromCity, move.moveDate);
      }
    }

    const { error } = await createAdminClient()
      .from("listings")
      .upsert(
        {
          item_id: listing.itemId,
          title: listing.title,
          description: listing.description,
          price_quick: listing.priceQuick,
          price_max: listing.priceMax,
        },
        { onConflict: "item_id" },
      );
    if (error) throw error;

    return NextResponse.json(listing);
  } catch (err) {
    logError(ROUTE, err);
    return apiError("internal");
  }
}
