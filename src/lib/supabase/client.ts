"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Браузерный клиент: только для auth (signInWithOtp, signOut). Данные — через /api/*. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
