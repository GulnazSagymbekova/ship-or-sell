import defaultsJson from "@/data/category-defaults.json";
import type { Category } from "@/types";

export interface CategoryDefaults {
  widthIn: number;
  depthIn: number;
  heightIn: number;
  weightLb: number;
}

// src/data/category-defaults.json готовит C: { "<category>": { widthIn, depthIn, heightIn, weightLb } }
const DEFAULTS = defaultsJson as unknown as Record<string, CategoryDefaults>;

export function defaultsFor(category: Category): CategoryDefaults {
  return DEFAULTS[category] ?? DEFAULTS.other ?? { widthIn: 30, depthIn: 20, heightIn: 30, weightLb: 40 };
}

/** Упакованный объём: W×D×H / 1728 + 10% на упаковку, до 0.1 куб. фута. */
export function packedVolumeCuFt(w: number, d: number, h: number): number {
  return Math.round(((w * d * h) / 1728) * 1.1 * 10) / 10;
}
