import { NextResponse } from "next/server";
import { apiError, logError, requireUser } from "@/lib/http";

/** POST /api/home-plus/waitlist → 204. Повторный вызов ничего не ломает (upsert). */
export async function POST() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  try {
    const { error } = await auth.supabase
      .from("home_plus_waitlist")
      .upsert({ user_id: auth.userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) throw error;
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    logError("POST /api/home-plus/waitlist", err);
    return apiError("internal");
  }
}
