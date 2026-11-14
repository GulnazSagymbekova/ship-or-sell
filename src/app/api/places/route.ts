import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces } from "@/lib/places";

/**
 * GET /api/places?q=aus → Place[] (до 8): город или ZIP для полей «From» / «To».
 * Публичный справочник без данных пользователя — авторизация не нужна, ответ кэшируется.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 60);
  return NextResponse.json(searchPlaces(q), {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
