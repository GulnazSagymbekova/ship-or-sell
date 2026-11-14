// snake_case строки Supabase → типы контракта из src/types.ts (и обратно для записи).
import type { Category, Estimate, Item, Listing, Move, MoveStatus, MoveType, Verdict } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const MOVE_COLUMNS =
  "id, user_id, from_zip, to_zip, distance_mi, move_type, move_date, status";

export function toMove(r: Row): Move {
  return {
    id: r.id,
    userId: r.user_id,
    fromZip: r.from_zip,
    toZip: r.to_zip,
    distanceMi: r.distance_mi === null ? null : Number(r.distance_mi),
    moveType: r.move_type as MoveType,
    moveDate: String(r.move_date), // date → "YYYY-MM-DD"
    status: r.status as MoveStatus,
  };
}

export const ITEM_COLUMNS =
  "id, move_id, photo_path, category, name, brand, material, condition, width_in, depth_in, " +
  "height_in, volume_cu_ft, weight_lb, sentimental, user_edited, ai_confidence";

export function toItem(r: Row): Item {
  return {
    id: r.id,
    moveId: r.move_id,
    photoPath: r.photo_path,
    category: r.category as Category,
    name: r.name,
    brand: r.brand ?? null,
    material: r.material,
    condition: Number(r.condition) as Item["condition"],
    widthIn: num(r.width_in),
    depthIn: num(r.depth_in),
    heightIn: num(r.height_in),
    volumeCuFt: num(r.volume_cu_ft),
    weightLb: num(r.weight_lb),
    sentimental: Boolean(r.sentimental),
    userEdited: Boolean(r.user_edited),
    aiConfidence: num(r.ai_confidence),
  };
}

/** Item (без id) → строка для insert/update. Поля, которых нет в partial, не попадают в строку. */
export function itemToRow(i: Partial<Item>): Row {
  const map: Record<keyof Item, string> = {
    id: "id",
    moveId: "move_id",
    photoPath: "photo_path",
    category: "category",
    name: "name",
    brand: "brand",
    material: "material",
    condition: "condition",
    widthIn: "width_in",
    depthIn: "depth_in",
    heightIn: "height_in",
    volumeCuFt: "volume_cu_ft",
    weightLb: "weight_lb",
    sentimental: "sentimental",
    userEdited: "user_edited",
    aiConfidence: "ai_confidence",
  };
  const row: Row = {};
  for (const [k, col] of Object.entries(map) as [keyof Item, string][]) {
    if (i[k] !== undefined) row[col] = i[k];
  }
  return row;
}

export const ESTIMATE_COLUMNS =
  "item_id, ship_cost, resale_low, resale_high, replace_cost, verdict, savings, confidence";

export function toEstimate(r: Row): Estimate {
  return {
    itemId: r.item_id,
    shipCost: num(r.ship_cost),
    resaleLow: num(r.resale_low),
    resaleHigh: num(r.resale_high),
    replaceCost: num(r.replace_cost),
    verdict: r.verdict as Verdict,
    savings: num(r.savings),
    confidence: num(r.confidence),
  };
}

export function estimateToRow(e: Estimate): Row {
  return {
    item_id: e.itemId,
    ship_cost: e.shipCost,
    resale_low: e.resaleLow,
    resale_high: e.resaleHigh,
    replace_cost: e.replaceCost,
    verdict: e.verdict,
    savings: e.savings,
    confidence: e.confidence,
    updated_at: new Date().toISOString(),
  };
}

export const LISTING_COLUMNS = "item_id, title, description, price_quick, price_max";

export function toListing(r: Row): Listing {
  return {
    itemId: r.item_id,
    title: r.title,
    description: r.description,
    priceQuick: num(r.price_quick),
    priceMax: num(r.price_max),
  };
}
