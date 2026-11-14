import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, isUuid, logError, notFound, parseJson, requireUser } from "@/lib/http";
import { getOwnedMove } from "@/lib/db/access";
import { getStripe, UNLOCK_PRICE_CENTS, UNLOCK_PRODUCT_NAME } from "@/lib/stripe";

const Body = z.object({ moveId: z.string() }).strict();
const ROUTE = "POST /api/checkout";

/** Базовый URL приложения: NEXT_PUBLIC_APP_URL, иначе origin запроса. Без завершающего «/». */
function appUrl(req: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (fromEnv || new URL(req.url).origin).replace(/\/+$/, "");
}

/**
 * POST /api/checkout { moveId } → { url } — Stripe Checkout, Move Pass $29 за переезд.
 * Статус "paid" ставит webhook (/api/stripe/webhook) по metadata.moveId, не эта ручка
 * и не страница success. В Stripe не передаём email, имя, ZIP — только moveId.
 */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  const body = await parseJson(req, Body);
  if (!body.ok) return body.response;
  const { moveId } = body.data;
  // Невалидный id трактуем как несуществующий (см. CLAUDE.md: чужой/несуществующий → 404).
  if (!isUuid(moveId)) return notFound();

  try {
    const move = await getOwnedMove(auth.supabase, moveId);
    if (!move) return notFound();
    if (move.status === "paid") return apiError("conflict", "Already unlocked");

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
            unit_amount: UNLOCK_PRICE_CENTS,
            product_data: { name: UNLOCK_PRODUCT_NAME },
          },
        },
      ],
      metadata: { moveId },
      payment_intent_data: { metadata: { moveId } },
      client_reference_id: moveId,
      success_url: `${base}/move/${moveId}/success?session_id={CHECKOUT_SESSION_ID}`,
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
