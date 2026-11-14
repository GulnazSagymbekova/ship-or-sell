import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16: middleware переименован в proxy (runtime всегда nodejs).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // /api/* сюда не попадает: роуты сами проверяют сессию (401), а загрузка фото
  // не буферизуется прокси. Статика и картинки тоже исключены.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
