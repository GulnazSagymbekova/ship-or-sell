import { NextResponse } from "next/server";
import { z } from "zod";
import type { MoveStatus } from "@/types";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { countItems, getOwnedMove, MAX_ITEMS_PER_MOVE, photoBelongsToMove } from "@/lib/db/access";
import { ITEM_COLUMNS, itemToRow, toItem } from "@/lib/db/mappers";
import { AiInvalidOutputError, AiUnavailableError, demoFallbackEnabled, devDetail } from "@/lib/ai/client";
import { demoItemsFor } from "@/lib/ai/demo";
import { analyzePhoto, type DetectedItem } from "@/lib/ai/vision";
import { checkAndRecord, hourlyMessage } from "@/lib/ratelimit";
import { PHOTO_BUCKET } from "@/lib/storage";

const Body = z
  .object({
    moveId: z.string().refine(isUuid, "Invalid moveId"),
    photoPath: z.string().min(1).max(300),
  })
  .strict();

const ROUTE = "POST /api/analyze";

/** POST /api/analyze { moveId, photoPath } → Item[] (вещи, найденные на этом фото). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId, photoPath } = body.data;

  let restoreStatus: MoveStatus | null = null;
  try {
    const move = await getOwnedMove(supabase, moveId);
    if (!move) return notFound();
    if (!(await photoBelongsToMove(supabase, photoPath, userId, moveId))) return notFound();

    const existing = await countItems(supabase, moveId);
    if (existing >= MAX_ITEMS_PER_MOVE) {
      return apiError("rate_limited", `Up to ${MAX_ITEMS_PER_MOVE} items per move`);
    }

    // Лимиты: запись в ai_calls — до вызова Claude.
    let detected: DetectedItem[] | null = null;
    const limit = await checkAndRecord(supabase, userId, "analyze");
    if (!limit.ok) {
      if (limit.scope === "hourly") return apiError("rate_limited", hourlyMessage("analyze", limit.limit));
      if (!demoFallbackEnabled()) return apiError("unavailable", "Daily AI limit reached");
      detected = demoItemsFor(photoPath);
    }

    if (!detected) {
      if (move.status !== "paid") {
        restoreStatus = move.status === "analyzing" ? "draft" : move.status;
        await supabase.from("moves").update({ status: "analyzing" }).eq("id", moveId);
      }

      const { data: file, error: dlErr } = await supabase.storage.from(PHOTO_BUCKET).download(photoPath);
      if (dlErr || !file) {
        if (dlErr) logError(ROUTE, dlErr);
        return notFound();
      }
      const imageBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");

      try {
        detected = await analyzePhoto(imageBase64);
      } catch (err) {
        if (err instanceof AiUnavailableError || err instanceof AiInvalidOutputError) {
          logError(ROUTE, err);
          if (!demoFallbackEnabled()) {
            return err instanceof AiUnavailableError
              ? apiError("unavailable", `AI is temporarily unavailable, try again in a minute${devDetail(err)}`)
              : apiError("internal", "Could not read this photo, try another one");
          }
          detected = demoItemsFor(photoPath);
        } else {
          throw err;
        }
      }
    }

    const room = MAX_ITEMS_PER_MOVE - existing;
    const toSave = detected.slice(0, room);
    const dropped = detected.length - toSave.length;

    let saved: ReturnType<typeof toItem>[] = [];
    if (toSave.length > 0) {
      const rows = toSave.map((d) =>
        itemToRow({ ...d, moveId, photoPath, sentimental: false, userEdited: false }),
      );
      const { data, error } = await supabase.from("items").insert(rows).select(ITEM_COLUMNS);
      if (error) throw error;
      saved = (data ?? []).map(toItem);
    }

    if (dropped > 0) {
      return apiError(
        "rate_limited",
        `Up to ${MAX_ITEMS_PER_MOVE} items per move: saved ${saved.length}, skipped ${dropped}`,
      );
    }
    return NextResponse.json(saved);
  } catch (err) {
    logError(ROUTE, err);
    return apiError("internal");
  } finally {
    if (restoreStatus) {
      const { error } = await supabase.from("moves").update({ status: restoreStatus }).eq("id", moveId);
      if (error) logError(ROUTE, error);
    }
  }
}
