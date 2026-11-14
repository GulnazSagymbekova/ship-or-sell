import { NextResponse, type NextRequest } from "next/server";
import { apiError, isUuid, logError, notFound, requireUser } from "@/lib/http";
import { getOwnedHome, hasHomePlus, HOME_ITEM_COLUMNS, toHomeItem } from "@/lib/homeplus";
import { homeItemsToCsv } from "@/lib/pricing/home";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/homes/:id/export → CSV для страховой. Только с Home+ (иначе 402). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  try {
    const home = await getOwnedHome(supabase, id);
    if (!home) return notFound();
    if (!(await hasHomePlus(supabase, userId))) return apiError("payment_required", "Home+ is required to export");
    const { data, error } = await supabase.from("home_items").select(HOME_ITEM_COLUMNS).eq("home_id", id).order("created_at");
    if (error) throw error;
    return new NextResponse(homeItemsToCsv((data ?? []).map(toHomeItem)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="home-inventory.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logError("GET /api/homes/:id/export", err);
    return apiError("internal");
  }
}
