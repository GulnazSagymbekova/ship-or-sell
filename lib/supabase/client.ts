"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (public anon key only). Used for magic-link sign-in. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
