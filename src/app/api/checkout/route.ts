import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedMove } from "@/lib/db/access";
import {
  getStripe,
  PRO_PRICE_CENTS,
  PRO_PRODUCT_NAME,
  PRO_UPGRADE_CENTS,
  PRO_UPGRADE_PRODUCT_NAME,
  tierFromPayments,
  UNLOCK_PRICE_CENTS,
  UNLOCK_PRODUCT_NAME,
} from "@/lib/stripe";

const Body = z.object({ moveId: z.string(), plan: z.enum(["pass", "pro"]).optional() }).strict();
const ROUTE = "POST /api/checkout";

/** Базовый URL приложения: NEXT_PUBLIC_APP_URL, иначе origin запроса. Без завершающего «/». */
function appUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (fromEnv || new URL(req.url).origin).replace(/\/+$/, "");
}

/**
 * POST /api/checkout { moveId, plan? } → { url } — Stripe Checkout за переезд.
 *   plan "pass" (по умолчанию) — Move Pass $29; "pro" — Move Pro $79, а если Pass уже
 *   оплачен — апгрейд за разницу $50. Тариф потом считается по сумме оплат (src/lib/tier.ts).
 * Статус "paid" ставит webhook (/api/stripe/webhook) по metadata.moveId, не эта ручка
 * и не страница success. В Stripe не передаём email, имя, ZIP — только moveId.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId } = body.data;
  const plan = body.data.plan ?? "pass";
  // Невалидный id трактуем как несуществующий (см. CLAUDE.md: чужой/несуществующий → 404).
  if (!isUuid(moveId)) return notFound();

  try {
    const move = await getOwnedMove(auth.supabase, moveId);
    if (!move) return notFound();

    const paid = move.status === "paid";
    let tier: "free" | "pass" | "pro" = "free";
    if (paid) {
      const { data: pays, error: payErr } = await auth.supabase
        .from("payments")
        .select("amount_cents")
        .eq("move_id", moveId);
      if (payErr) throw payErr;
      tier = tierFromPayments(true, (pays ?? []).map((p) => Number((p as { amount_cents: number }).amount_cents)));
    }
    if (plan === "pass" && paid) return apiError("conflict", "Already unlocked");
    if (plan === "pro" && tier === "pro") return apiError("conflict", "Move Pro is already active");

    const amount = plan === "pass" ? UNLOCK_PRICE_CENTS : paid ? PRO_UPGRADE_CENTS : PRO_PRICE_CENTS;
    const name = plan === "pass" ? UNLOCK_PRODUCT_NAME : paid ? PRO_UPGRADE_PRODUCT_NAME : PRO_PRODUCT_NAME;

    const stripe = getStripe();
    if (!stripe) return apiError("unavailable", "Payments are not configured");

    const base = appUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: { name },
          },
        },
      ],
      metadata: { moveId, plan },
      payment_intent_data: { metadata: { moveId, plan } },
      client_reference_id: moveId,
      success_url: `${base}/move/${moveId}/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`,
      cancel_url: `${base}/move/${moveId}`,
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
