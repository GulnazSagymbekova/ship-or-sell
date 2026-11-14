import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isUuid, logError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const ROUTE = "POST /api/stripe/webhook";

let stripe: Stripe | undefined;
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripe ??= new Stripe(key);
  return stripe;
}

/**
 * POST /api/stripe/webhook — события Stripe.
 * Пользовательской сессии здесь нет, поэтому admin-клиент. Доверяем только событию
 * с валидной подписью STRIPE_WEBHOOK_SECRET.
 * Идемпотентность: payments.stripe_session_id unique — повтор события ничего не ломает.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Сырое тело — подпись считается по байтам, JSON.parse до проверки ломает её.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    logError(ROUTE, err);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    // Отложенная оплата: придёт checkout.session.async_payment_succeeded.
    return NextResponse.json({ received: true });
  }

  const moveId = session.metadata?.moveId;
  if (!moveId || !isUuid(moveId)) {
    logError(ROUTE, { code: "no_move_id", message: `session ${session.id} has no valid metadata.moveId` });
    // 200: повтор Stripe тут не поможет, а 4xx заставит его ретраить сутки.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  try {
    const { data: move, error: moveErr } = await admin.from("moves").select("id").eq("id", moveId).maybeSingle();
    if (moveErr) throw moveErr;
    if (!move) {
      logError(ROUTE, { code: "move_not_found", message: `session ${session.id}` });
      return NextResponse.json({ received: true });
    }

    const { error: payErr } = await admin.from("payments").insert({
      move_id: moveId,
      stripe_session_id: session.id,
      amount_cents: session.amount_total ?? 0,
    });
    // 23505 = unique violation: это событие уже обработано. Статус всё равно выставляем ниже.
    if (payErr && payErr.code !== "23505") throw payErr;

    const { error: updErr } = await admin.from("moves").update({ status: "paid" }).eq("id", moveId);
    if (updErr) throw updErr;

    return NextResponse.json({ received: true });
  } catch (err) {
    logError(ROUTE, err);
    // 500 → Stripe повторит доставку позже.
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
