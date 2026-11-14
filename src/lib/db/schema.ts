// Drizzle-схема. Повторяет supabase/migrations/0001_init.sql (там же RLS, триггеры и CHECK).
// Источник правды — SQL-миграции; этот файл нужен для типов и drizzle-kit studio/check.
// Не запускай `drizzle-kit push`/`migrate` поверх Supabase: RLS и триггеры живут в SQL.

import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgSchema,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

const money = (name: string) => numeric(name, { precision: 10, scale: 2, mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const moves = pgTable(
  "moves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    fromZip: text("from_zip").notNull(),
    toZip: text("to_zip").notNull(),
    distanceMi: real("distance_mi"),
    moveType: text("move_type", { enum: ["diy_truck", "container", "full_service"] }).notNull(),
    moveDate: date("move_date").notNull(),
    status: text("status", { enum: ["draft", "analyzing", "analyzed", "paid"] })
      .notNull()
      .default("draft"),
    createdAt: createdAt(),
  },
  (t) => [index("moves_user_created_idx").on(t.userId, t.createdAt.desc())],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moveId: uuid("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
    path: text("path").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index("photos_move_idx").on(t.moveId)],
);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moveId: uuid("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
    photoPath: text("photo_path")
      .notNull()
      .references(() => photos.path, { onDelete: "cascade" }),
    category: text("category", {
      enum: [
        "sofa", "sectional", "armchair", "bed_frame", "mattress", "dresser",
        "nightstand", "dining_table", "dining_chair", "coffee_table", "desk",
        "office_chair", "bookshelf", "tv_stand", "wardrobe", "rug", "lamp", "other",
      ],
    }).notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    material: text("material").notNull(),
    condition: smallint("condition").notNull(),
    widthIn: real("width_in").notNull(),
    depthIn: real("depth_in").notNull(),
    heightIn: real("height_in").notNull(),
    volumeCuFt: real("volume_cu_ft").notNull(),
    weightLb: real("weight_lb").notNull(),
    sentimental: boolean("sentimental").notNull().default(false),
    userEdited: boolean("user_edited").notNull().default(false),
    aiConfidence: real("ai_confidence").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("items_move_idx").on(t.moveId), index("items_photo_idx").on(t.photoPath)],
);

export const estimates = pgTable("estimates", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  shipCost: money("ship_cost").notNull(),
  resaleLow: money("resale_low").notNull(),
  resaleHigh: money("resale_high").notNull(),
  replaceCost: money("replace_cost").notNull(),
  verdict: text("verdict", { enum: ["SHIP", "SELL", "TOSSUP"] }).notNull(),
  savings: money("savings").notNull(),
  confidence: real("confidence").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const listings = pgTable("listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .unique()
    .references(() => items.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priceQuick: money("price_quick").notNull(),
  priceMax: money("price_max").notNull(),
  createdAt: createdAt(),
});

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    moveId: uuid("move_id").notNull().references(() => moves.id, { onDelete: "cascade" }),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    amountCents: integer("amount_cents").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payments_move_idx").on(t.moveId)],
);

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["analyze", "listing"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_calls_user_kind_created_idx").on(t.userId, t.kind, t.createdAt),
    index("ai_calls_created_idx").on(t.createdAt),
  ],
);

// ---------- Home+ (supabase/migrations/0003_home_plus.sql) ----------

export const homes = pgTable(
  "homes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    sourceMoveId: uuid("source_move_id").references(() => moves.id, { onDelete: "set null" }),
    name: text("name").notNull().default("My home"),
    coverageLimit: money("coverage_limit"),
    createdAt: createdAt(),
  },
  (t) => [index("homes_user_idx").on(t.userId, t.createdAt.desc())],
);

export const homeItems = pgTable(
  "home_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    homeId: uuid("home_id").notNull().references(() => homes.id, { onDelete: "cascade" }),
    photoPath: text("photo_path"),
    category: text("category").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    material: text("material").notNull(),
    condition: smallint("condition").notNull(),
    widthIn: real("width_in").notNull(),
    depthIn: real("depth_in").notNull(),
    heightIn: real("height_in").notNull(),
    replaceNew: money("replace_new").notNull(),
    purchasePrice: money("purchase_price"),
    serialNumber: text("serial_number"),
    createdAt: createdAt(),
  },
  (t) => [index("home_items_home_idx").on(t.homeId)],
);

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  status: text("status", { enum: ["trialing", "active", "past_due", "canceled", "incomplete", "unpaid"] }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const homePlusWaitlist = pgTable("home_plus_waitlist", {
  userId: uuid("user_id").primaryKey().references(() => authUsers.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});
