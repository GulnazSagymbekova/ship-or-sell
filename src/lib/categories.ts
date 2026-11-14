import type { Category } from "@/types";

/** Все категории из контракта src/types.ts — для zod-схем и JSON-схемы инструмента. */
export const CATEGORIES = [
  "sofa", "sectional", "armchair", "bed_frame", "mattress", "dresser",
  "nightstand", "dining_table", "dining_chair", "coffee_table", "desk",
  "office_chair", "bookshelf", "tv_stand", "wardrobe", "rug", "lamp", "other",
] as const satisfies readonly Category[];
