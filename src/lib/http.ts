import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ApiErrorCode =
  | "unauthorized"
  | "bad_request"
  | "not_found"
  | "payment_required"
  | "conflict"
  | "rate_limited"
  | "unavailable"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  bad_request: 400,
  not_found: 404,
  payment_required: 402,
  conflict: 409,
  rate_limited: 429,
  unavailable: 503,
  internal: 500,
};

/** Тело ошибки для клиента: { error: code, message? }. Без деталей БД. */
export function apiError(code: ApiErrorCode, message?: string) {
  return NextResponse.json(message ? { error: code, message } : { error: code }, {
    status: STATUS[code],
  });
}

export const notFound = () => apiError("not_found");

/**
 * Логи: только имя роута, код и сообщение. Никаких email, тел запросов, фото, ответов AI.
 */
export function logError(route: string, err: unknown) {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : undefined;
  const message = typeof e?.message === "string" ? e.message.slice(0, 200) : String(err).slice(0, 200);
  console.error(`[${route}]`, code ?? "-", message);
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Пользовательский Supabase-клиент + текущий пользователь, либо готовый 401. */
export async function requireUser(): Promise<
  | { ok: true; supabase: SupabaseServerClient; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: apiError("unauthorized") };
  return { ok: true, supabase, userId: user.id };
}

/** JSON-тело через zod. Невалидный JSON или схема → 400. */
export async function parseJson<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: apiError("bad_request", "Invalid JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.length ? `${first.path.join(".")}: ` : "";
    return { ok: false, response: apiError("bad_request", `${where}${first?.message ?? "Invalid body"}`) };
  }
  return { ok: true, data: parsed.data };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Невалидный uuid в URL трактуем как несуществующий id → 404 (а не 500 от Postgres). */
export const isUuid = (s: string) => UUID_RE.test(s);
