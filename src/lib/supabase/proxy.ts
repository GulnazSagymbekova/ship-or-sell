import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Обновляет auth-куки. Входа по email нет: на /move/* и /home/* (Home+) пользователь без сессии
 * получает анонимную сессию Supabase (signInAnonymously). RLS, «чужое → 404»,
 * paywall и лимиты работают так же — по id анонимного пользователя.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Не вставлять код между createServerClient и getUser — иначе сессия может «слетать».
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const needsSession =
    pathname === "/move" || pathname.startsWith("/move/") || pathname === "/home" || pathname.startsWith("/home/");
  if (!user && needsSession) {
    // Куки новой сессии попадут в response через setAll выше.
    const { error } = await supabase.auth.signInAnonymously();
    if (error) console.error("[proxy] anonymous sign-in failed", error.code ?? "-", error.message);
  }

  return response;
}
