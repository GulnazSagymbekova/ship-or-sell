import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logError, parseJson, requireUser } from "@/lib/http";
import { MOVE_COLUMNS, toMove } from "@/lib/db/mappers";
import { distanceMiBetween } from "@/lib/zips";

const zip = z.string().regex(/^\d{5}$/, "ZIP must be 5 digits");

const CreateMove = z
  .object({
    fromZip: zip,
    toZip: zip,
    moveType: z.enum(["diy_truck", "container", "full_service"]),
    moveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "moveDate must be YYYY-MM-DD")
      .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Invalid date"),
  })
  .strict();

/** GET /api/moves → Move[] текущего пользователя, новые сверху. */
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("moves")
    .select(MOVE_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) {
    logError("GET /api/moves", error);
    return apiError("internal");
  }
  return NextResponse.json((data ?? []).map(toMove));
}

/** POST /api/moves { fromZip, toZip, moveType, moveDate } → Move */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, CreateMove);
  if (!body.ok) return body.response;
  const { fromZip, toZip, moveType, moveDate } = body.data;

  const { data, error } = await auth.supabase
    .from("moves")
    .insert({
      user_id: auth.userId,
      from_zip: fromZip,
      to_zip: toZip,
      move_type: moveType,
      move_date: moveDate,
      distance_mi: distanceMiBetween(fromZip, toZip),
    })
    .select(MOVE_COLUMNS)
    .single();
  if (error || !data) {
    logError("POST /api/moves", error);
    return apiError("internal");
  }
  return NextResponse.json(toMove(data), { status: 201 });
}
