import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ВНИМАНИЕ: это прямое подключение к Postgres под ролью из DATABASE_URL — RLS НЕ применяется.
// API-роуты работают через пользовательский Supabase-клиент (src/lib/supabase/server.ts).
// Используй этот клиент только для скриптов/сидов, не в пользовательских роутах.

const url = process.env.DATABASE_URL;

let client: ReturnType<typeof postgres> | undefined;

export function getDb() {
  if (!url) throw new Error("DATABASE_URL is not set");
  // Supabase pooler (transaction mode, порт 6543) не поддерживает prepared statements.
  client ??= postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
