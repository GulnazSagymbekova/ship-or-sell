import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/http";

/** Только относительный путь внутри сайта: "/..." но не "//host" и не "/\host". */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/move";
  return raw;
}

/** GET /auth/callback?code=...&next=/move/123 — завершение входа по magic link. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logError("GET /auth/callback", error);
  }

  return NextResponse.redirect(new URL(`/login?error=auth&next=${encodeURIComponent(next)}`, origin));
}
