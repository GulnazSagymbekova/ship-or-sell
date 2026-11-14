import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import {
  getHomePlus,
  getOwnedHome,
  HOME_PLUS_BILLING_ENABLED,
  HOME_PLUS_PRICE_CENTS,
  HOME_PLUS_PRODUCT_NAME,
  HOME_PLUS_TRIAL_DAYS,
} from "@/lib/homeplus";
import { getStripe } from "@/lib/stripe";

const Body = z.object({ homeId: z.string() }).strict();
const ROUTE = "POST /api/home-plus/checkout";

function appUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (fromEnv || new URL(req.url).origin).replace(/\/+$/, "");
}

/**
 * POST /api/home-plus/checkout { homeId } → { url }. Stripe Checkout в режиме подписки:
 * 30 дней бесплатно, потом $4.99/мес. Подписку в БД пишет только webhook.
 * В metadata — только id (userId, homeId). Email Stripe спрашивает сам.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, userId } = auth;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { homeId } = body.data;
  if (!isUuid(homeId)) return notFound();

  if (!HOME_PLUS_BILLING_ENABLED) return apiError("unavailable", "Home+ billing is not enabled yet");
  const stripe = getStripe();
  if (!stripe) return apiError("unavailable", "Payments are not configured");

  try {
    const home = await getOwnedHome(supabase, homeId);
    if (!home) return notFound();
    if ((await getHomePlus(supabase, userId)).active) return apiError("conflict", "Home+ is already active");

    // Повторная подписка — тот же Stripe customer (RLS: читаем только свою строку).
    const { data: prev, error: prevErr } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (prevErr) throw prevErr;

    const base = appUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: HOME_PLUS_PRICE_CENTS,
            recurring: { interval: "month" },
            product_data: { name: HOME_PLUS_PRODUCT_NAME },
          },
        },
      ],
      subscription_data: { trial_period_days: HOME_PLUS_TRIAL_DAYS, metadata: { userId } },
      metadata: { userId, homeId, kind: "home_plus" },
      client_reference_id: userId,
      ...(prev?.stripe_customer_id ? { customer: String(prev.stripe_customer_id) } : {}),
      success_url: `${base}/home/${homeId}?subscribed=1`,
      cancel_url: `${base}/home/${homeId}`,
    });
    if (!session.url) {
      logError(ROUTE, new Error("Stripe returned no session url"));
      return apiError("internal");
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    logError(ROUTE, err);
    return apiError("internal");
  }
}
