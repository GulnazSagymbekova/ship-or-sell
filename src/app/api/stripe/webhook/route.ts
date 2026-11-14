import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isUuid, logError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { toSubscriptionStatus } from "@/lib/homeplus";

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

  // Home+ (подписка): отдельная ветка, ветку Move Pass ниже не трогает.
  try {
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await saveSubscription(sub, sub.metadata?.userId, event.type === "customer.subscription.deleted");
      return NextResponse.json({ received: true });
    }
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const ref = invoice.parent?.subscription_details?.subscription;
      const subId = typeof ref === "string" ? ref : ref?.id;
      if (subId) {
        const { error } = await createAdminClient()
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);
        if (error) throw error;
      }
      return NextResponse.json({ received: true });
    }
    if (event.type === "checkout.session.completed" && (event.data.object as Stripe.Checkout.Session).mode === "subscription") {
      const session = event.data.object as Stripe.Checkout.Session;
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subId) await saveSubscription(await getStripe().subscriptions.retrieve(subId), session.metadata?.userId, false);
      return NextResponse.json({ received: true });
    }
  } catch (err) {
    logError(ROUTE, err);
    return NextResponse.json({ error: "internal" }, { status: 500 }); // Stripe повторит
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

/**
 * Home+: upsert подписки по user_id (admin-клиент, webhook — единственный писатель).
 * Stripe 23: current_period_end лежит на subscription items — берём максимум;
 * без items — конец пробного периода. Идемпотентно: повтор события даёт ту же строку.
 */
async function saveSubscription(sub: Stripe.Subscription, userId: string | undefined, deleted: boolean) {
  if (!userId || !isUuid(userId)) {
    logError(ROUTE, { code: "no_user_id", message: `subscription ${sub.id} has no valid metadata.userId` });
    return;
  }
  const ends = (sub.items?.data ?? []).map((i) => i.current_period_end).filter((n) => Number.isFinite(n));
  const periodEnd = ends.length > 0 ? Math.max(...ends) : (sub.trial_end ?? Math.floor(Date.now() / 1000));
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { error } = await createAdminClient()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customer,
        stripe_subscription_id: sub.id,
        status: deleted ? "canceled" : toSubscriptionStatus(sub.status),
        current_period_end: new Date(periodEnd * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
