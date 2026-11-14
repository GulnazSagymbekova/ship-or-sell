import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, logError, parseJson, requireUser } from "@/lib/http";
import { MOVE_COLUMNS, toMove } from "@/lib/db/mappers";
import { distanceMiBetween } from "@/lib/zips";

const zip = z.string().regex(/^\d{5}$/, "ZIP must be 5 digits");

const DAY_MS = 24 * 60 * 60 * 1000;
/** Сколько вперёд можно планировать переезд: 2 года (с запасом на високосный год, как в календаре MoveForm). */
const MAX_DAYS_AHEAD = 2 * 366;

/** Настоящая календарная дата: Date.parse принимает «2026-02-31», а Postgres — нет (было 500). */
function isCalendarDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * Не в прошлом и не дальше 2 лет. «Сегодня» — по UTC минус день: у пользователя в США
 * календарный день может отставать от UTC, и его «сегодня» не должно стать «вчера».
 */
function isPlannableDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`);
  const todayUtc = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return t >= todayUtc - DAY_MS && t <= todayUtc + MAX_DAYS_AHEAD * DAY_MS;
}

const CreateMove = z
  .object({
    fromZip: zip,
    toZip: zip,
    moveType: z.enum(["diy_truck", "container", "full_service"]),
    moveDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "moveDate must be YYYY-MM-DD")
      .refine(isCalendarDate, "Invalid date")
      .refine(isPlannableDate, "Move date must be between today and 2 years from now"),
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
