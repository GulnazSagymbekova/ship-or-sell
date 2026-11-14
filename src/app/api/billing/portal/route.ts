import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedHome } from "@/lib/homeplus";
import { getStripe } from "@/lib/stripe";

const Body = z.object({ homeId: z.string() }).strict();

/** POST /api/billing/portal { homeId } → { url } — Stripe Customer Portal: отмена, смена карты. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { homeId } = body.data;
  if (!isUuid(homeId)) return notFound();
  const stripe = getStripe();
  if (!stripe) return apiError("unavailable", "Payments are not configured");

  try {
    const home = await getOwnedHome(auth.supabase, homeId);
    if (!home) return notFound();
    const { data, error } = await auth.supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();
    const origin = (process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin).replace(/\/+$/, "");
    const portal = await stripe.billingPortal.sessions.create({
      customer: String(data.stripe_customer_id),
      return_url: `${origin}/home/${homeId}`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    logError("POST /api/billing/portal", err);
    return apiError("internal");
  }
}
