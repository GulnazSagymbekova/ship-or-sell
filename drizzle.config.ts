import { defineConfig } from "drizzle-kit";

// Миграции БД — в supabase/migrations/*.sql (с RLS). Drizzle-kit здесь для `studio` и `check`.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["public"],
  dbCredentials: {
    // Supabase pooler: ...pooler.supabase.com:6543/postgres
    url: process.env.DATABASE_URL!,
  },
});
