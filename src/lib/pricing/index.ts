import type { Category, Estimate, Item, Move, MoveType, Verdict } from "@/types";
import defaultsJson from "@/data/category-defaults.json";

/**
 * Pricing / Decision Engine.
 *
 * estimateMove(move, items) — чистая синхронная функция: без fetch, БД, Date.now(), Math.random().
 * Ровно один Estimate на каждый Item, в том же порядке. Все деньги — целые доллары ≥ 0.
 *
 * Модель (упрощённая, цифры — оценки по открытым прайсам 2025–2026):
 *  - shipCost: доля вещи в стоимости переезда. full_service — по «billable weight»
 *    (max(вес, объём × 7 фунтов/куб. фут), как считают межштатные мувинговые компании),
 *    container и diy_truck — по объёму. Ставка растёт с дистанцией.
 *  - retail: цена новой похожей вещи = база категории × бренд × материал × размер.
 *  - resale: retail × доля перепродажи (материал, бренд, категория) × состояние.
 *  - replaceCost: min(купить б/у похожую там же + забрать её, купить новую).
 *  - verdict / savings — по правилам в decide() ниже (описаны в README.md, раздел 5).
 */

// ---------- Константы ----------

/** Если ZIP нет в справочнике (distanceMi = null). */
export const DEFAULT_DISTANCE_MI = 1000;

/** Межштатные мувинговые компании считают ~7 фунтов на кубический фут. */
export const LB_PER_CUFT = 7;

interface ShipRate {
  /** $ за единицу (фунт или куб. фут) = base + perMile × мили */
  base: number;
  perMile: number;
  /** упаковка / ремни / одеяла на одну вещь */
  handling: number;
  unit: "lb" | "cuft";
}

export const SHIP_RATES: Record<MoveType, ShipRate> = {
  // Межштатный мувер: ~$0.75/фунт на 1000 миль, ~$1.20 на 2000.
  full_service: { base: 0.3, perMile: 0.00045, handling: 15, unit: "lb" },
  // PODS-подобный контейнер: ~$3.7/куб. фут на 1000 миль.
  container: { base: 1.2, perMile: 0.0025, handling: 5, unit: "cuft" },
  // Аренда грузовика в одну сторону + топливо: ~$2.2/куб. фут на 1000 миль.
  diy_truck: { base: 0.6, perMile: 0.0016, handling: 5, unit: "cuft" },
};

/** Цена новой «средней» вещи категории, $ (мид-маркет, без бренда). */
const BASE_RETAIL: Record<Category, number> = {
  sofa: 900,
  sectional: 1600,
  armchair: 450,
  bed_frame: 450,
  mattress: 800,
  dresser: 600,
  nightstand: 180,
  dining_table: 650,
  dining_chair: 120,
  coffee_table: 250,
  desk: 350,
  office_chair: 300,
  bookshelf: 180,
  tv_stand: 300,
  wardrobe: 500,
  rug: 300,
  lamp: 90,
  other: 150,
};

/**
 * Насколько охотно категория продаётся б/у (множитель к доле перепродажи).
 * Матрасы б/у почти не покупают, крупную мягкую мебель сложно вывезти покупателю.
 */
const CATEGORY_RESALE: Record<Category, number> = {
  sofa: 0.85,
  sectional: 0.8,
  armchair: 0.95,
  bed_frame: 0.9,
  mattress: 0.3,
  dresser: 1.05,
  nightstand: 1,
  dining_table: 1,
  dining_chair: 0.9,
  coffee_table: 1,
  desk: 1,
  office_chair: 1.05,
  bookshelf: 0.9,
  tv_stand: 0.85,
  wardrobe: 0.85,
  rug: 0.8,
  lamp: 0.9,
  other: 0.9,
};

/** Категории, которые не покупают б/у как замену — только новые (бюджетный вариант). */
const BUY_NEW_ONLY = new Set<Category>(["mattress"]);
/** Бюджетная новая замена (bed-in-a-box и т. п.) относительно цены такой же новой. */
const BUDGET_NEW = 0.55;

interface Tier {
  retail: number;
  resale: number;
}

type BrandTier = "budget" | "generic" | "mid" | "premium";

const BRAND_TIERS: Record<BrandTier, Tier> = {
  budget: { retail: 0.45, resale: 0.7 },
  generic: { retail: 1, resale: 1 },
  mid: { retail: 1.7, resale: 1.25 },
  premium: { retail: 3, resale: 1.4 },
};

const BRANDS: Record<Exclude<BrandTier, "generic">, string[]> = {
  budget: [
    "ikea", "wayfair", "walmart", "mainstays", "target", "threshold", "room essentials",
    "sauder", "south shore", "ameriwood", "zinus", "amazon basics", "dhp", "better homes",
    "hillsdale", "furinno", "linon", "big lots", "ashley", "home depot", "costco",
  ],
  mid: [
    "west elm", "crate & barrel", "crate and barrel", "cb2", "pottery barn", "article",
    "joybird", "la-z-boy", "lazboy", "la z boy", "burrow", "floyd", "castlery", "interior define",
    "anthropologie", "serena & lily", "thomasville", "bassett", "world market", "allform",
    "maiden home", "casper", "tempur", "tempur-pedic", "purple", "saatva", "branch", "humanscale",
    "flexsteel", "lovesac", "albany park", "rejuvenation", "schoolhouse",
  ],
  premium: [
    "restoration hardware", "rh", "room & board", "room and board", "ethan allen", "herman miller",
    "steelcase", "knoll", "design within reach", "dwr", "arhaus", "stickley", "vitra", "cassina",
    "b&b italia", "ligne roset", "roche bobois", "baker", "hooker", "theodore alexander",
    "fritz hansen", "hay", "muuto", "eames", "poltrona frau", "minotti", "noguchi",
  ],
};

interface MaterialRule {
  keywords: string[];
  retail: number;
  resale: number;
}

// Порядок важен: первое совпадение побеждает ("solid wood veneer" — это шпон, не массив).
const MATERIALS: MaterialRule[] = [
  {
    keywords: ["particleboard", "particle board", "chipboard", "mdf", "fiberboard", "laminate",
      "engineered wood", "melamine", "pressed wood", "composite wood", "manufactured wood", "hdf"],
    retail: 0.6,
    resale: 0.12,
  },
  { keywords: ["veneer"], retail: 0.9, resale: 0.22 },
  {
    keywords: ["solid wood", "hardwood", "oak", "walnut", "maple", "cherry", "teak", "mahogany",
      "birch", "ash", "acacia", "mango wood", "rosewood", "reclaimed wood"],
    retail: 1.3,
    resale: 0.4,
  },
  { keywords: ["pine", "rubberwood", "poplar", "bamboo"], retail: 1.05, resale: 0.3 },
  { keywords: ["leather"], retail: 1.4, resale: 0.33 },
  { keywords: ["marble", "granite", "stone", "travertine", "quartz"], retail: 1.3, resale: 0.32 },
  { keywords: ["wool", "silk", "jute", "hand-knotted", "hand knotted"], retail: 1.3, resale: 0.3 },
  { keywords: ["metal", "steel", "iron", "aluminum", "aluminium", "brass", "chrome"], retail: 1, resale: 0.28 },
  { keywords: ["glass"], retail: 1.05, resale: 0.25 },
  { keywords: ["rattan", "wicker", "cane"], retail: 1, resale: 0.28 },
  { keywords: ["memory foam", "latex", "hybrid", "innerspring", "foam"], retail: 1, resale: 0.22 },
  {
    keywords: ["fabric", "upholster", "microfiber", "linen", "velvet", "polyester", "cotton",
      "chenille", "boucle", "bouclé", "faux leather", "vegan leather", "bonded leather", "mesh"],
    retail: 1,
    resale: 0.22,
  },
  { keywords: ["polypropylene", "synthetic", "nylon"], retail: 0.8, resale: 0.15 },
  { keywords: ["plastic", "acrylic", "resin", "vinyl"], retail: 0.6, resale: 0.15 },
  { keywords: ["wood"], retail: 1, resale: 0.25 },
];

const DEFAULT_MATERIAL = { retail: 1, resale: 0.22 };

// Кожзам и «bonded leather» должны попасть в ткань, а не в кожу: проверяем их раньше.
const FAKE_LEATHER = ["faux leather", "vegan leather", "bonded leather", "pu leather", "leatherette"];

/** Состояние 1..5 → множитель к цене перепродажи. */
const CONDITION_FACTOR: Record<Item["condition"], number> = { 1: 0.3, 2: 0.55, 3: 0.8, 4: 1, 5: 1.15 };

/** Продажа быстро / максимум относительно середины. */
const QUICK_SALE = 0.75;
const MAX_SALE = 1.25;

/** Покупая б/у, платишь около верхней цены рынка, плюс немного за поиск. */
const USED_BUY_MARKUP = 1.1;

// ---------- Справочник размеров категории ----------

interface Dims {
  widthIn: number;
  depthIn: number;
  heightIn: number;
  weightLb: number;
}

const CATEGORY_DEFAULTS = defaultsJson as unknown as Record<string, Dims>;
const FALLBACK_DIMS: Dims = { widthIn: 30, depthIn: 20, heightIn: 30, weightLb: 40 };

function dimsFor(category: Category): Dims {
  return CATEGORY_DEFAULTS[category] ?? CATEGORY_DEFAULTS.other ?? FALLBACK_DIMS;
}

/** Упакованный объём: W×D×H / 1728 + 10% (так же считает B в lib/category-defaults.ts). */
function packedVolume(w: number, d: number, h: number): number {
  return ((w * d * h) / 1728) * 1.1;
}

// ---------- Утилиты ----------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const money = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

function includesWord(haystack: string, needle: string): boolean {
  // Короткие ключи ("rh", "hay", "ash", "hdf") — только целым словом, длинные — подстрокой.
  if (needle.length <= 3) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`).test(haystack);
  }
  return haystack.includes(needle);
}

export function brandTier(brand: string | null | undefined): BrandTier {
  const b = (brand ?? "").trim().toLowerCase();
  if (!b) return "generic";
  for (const tier of ["premium", "mid", "budget"] as const) {
    if (BRANDS[tier].some((name) => includesWord(b, name))) return tier;
  }
  return "generic";
}

export function materialRule(material: string | null | undefined): { retail: number; resale: number } {
  const m = (material ?? "").trim().toLowerCase();
  if (!m) return DEFAULT_MATERIAL;
  if (FAKE_LEATHER.some((k) => m.includes(k))) return { retail: 0.9, resale: 0.18 };
  for (const rule of MATERIALS) {
    if (rule.keywords.some((k) => includesWord(m, k))) return rule;
  }
  return DEFAULT_MATERIAL;
}

export function itemVolume(item: Item): number {
  if (positive(item.volumeCuFt)) return item.volumeCuFt;
  if (positive(item.widthIn) && positive(item.depthIn) && positive(item.heightIn)) {
    return packedVolume(item.widthIn, item.depthIn, item.heightIn);
  }
  const d = dimsFor(item.category);
  return packedVolume(d.widthIn, d.depthIn, d.heightIn);
}

export function itemWeight(item: Item): number {
  if (positive(item.weightLb)) return item.weightLb;
  return dimsFor(item.category).weightLb;
}

export function moveDistance(move: Move): number {
  return positive(move.distanceMi) ? move.distanceMi : move.distanceMi === 0 ? 0 : DEFAULT_DISTANCE_MI;
}

// ---------- Компоненты оценки ----------

export function shipCostFor(move: Move, item: Item): number {
  const rate = SHIP_RATES[move.moveType] ?? SHIP_RATES.full_service;
  const miles = moveDistance(move);
  const perUnit = rate.base + rate.perMile * miles;
  const volume = itemVolume(item);
  const units = rate.unit === "lb" ? Math.max(itemWeight(item), volume * LB_PER_CUFT) : volume;
  return money(units * perUnit + rate.handling);
}

/** Размер относительно типичного для категории: большие вещи дороже, но не линейно. */
function sizeFactor(item: Item): number {
  const d = dimsFor(item.category);
  const typical = packedVolume(d.widthIn, d.depthIn, d.heightIn);
  if (!(typical > 0)) return 1;
  return clamp(Math.sqrt(itemVolume(item) / typical), 0.6, 1.8);
}

interface Valuation {
  retail: number;
  resaleLow: number;
  resaleHigh: number;
  replaceCost: number;
}

export function valueItem(item: Item): Valuation {
  const tier = BRAND_TIERS[brandTier(item.brand)];
  const mat = materialRule(item.material);
  const category = BASE_RETAIL[item.category] !== undefined ? item.category : "other";

  const retail = BASE_RETAIL[category] * tier.retail * mat.retail * sizeFactor(item);

  // Доля перепродажи не выше 60% от новой — даже у премиум-брендов.
  const resaleRate = clamp(mat.resale * tier.resale * CATEGORY_RESALE[category], 0.02, 0.6);
  const condition = CONDITION_FACTOR[item.condition] ?? CONDITION_FACTOR[3];
  const mid = retail * resaleRate * condition;

  const resaleLow = money(mid * QUICK_SALE);
  const resaleHigh = Math.max(resaleLow, money(Math.min(mid * MAX_SALE, retail * 0.9)));

  // Забрать б/у вещь у продавца: мелочь — в машину, крупное — грузовик/доставка.
  const pickup = clamp(itemVolume(item), 0, 60);
  const buyUsed = resaleHigh * USED_BUY_MARKUP + pickup;
  const buyNew = retail;
  const replaceCost = money(BUY_NEW_ONLY.has(category) ? buyNew * BUDGET_NEW : Math.min(buyUsed, buyNew));

  return { retail, resaleLow, resaleHigh, replaceCost };
}

export function decide(
  shipCost: number,
  resaleLow: number,
  resaleHigh: number,
  replaceCost: number,
): { verdict: Verdict; savings: number; diff: number; threshold: number } {
  const resaleMid = (resaleLow + resaleHigh) / 2;
  const sellNet = replaceCost - resaleMid;
  const diff = shipCost - sellNet;
  const threshold = Math.max(25, 0.1 * shipCost);
  if (diff > threshold) return { verdict: "SELL", savings: money(diff), diff, threshold };
  if (diff < -threshold) return { verdict: "SHIP", savings: money(-diff), diff, threshold };
  return { verdict: "TOSSUP", savings: money(Math.abs(diff)), diff, threshold };
}

function confidenceFor(move: Move, item: Item, diff: number, threshold: number): number {
  const ai = item.userEdited ? Math.max(0.9, item.aiConfidence) : clamp(item.aiConfidence, 0, 1);
  // Насколько вердикт далёк от границы: |diff| = 3 порога и больше — уверенно.
  const decisiveness = clamp(Math.abs(diff) / (threshold * 3), 0, 1);
  let c = (0.45 + 0.5 * decisiveness) * (0.6 + 0.4 * (Number.isFinite(ai) ? ai : 0.5));
  if (move.distanceMi === null) c *= 0.85;
  if (!item.material?.trim()) c *= 0.9;
  return Math.round(clamp(c, 0.05, 0.99) * 100) / 100;
}

// ---------- Публичная функция ----------

export function estimateItem(move: Move, item: Item): Estimate {
  const shipCost = shipCostFor(move, item);
  const { resaleLow, resaleHigh, replaceCost } = valueItem(item);
  const decision = decide(shipCost, resaleLow, resaleHigh, replaceCost);

  return {
    itemId: item.id,
    shipCost,
    resaleLow,
    resaleHigh,
    replaceCost,
    // sentimental → всегда SHIP, но savings = «цена решения» по обычной формуле.
    // В итоговую экономию такая вещь не попадает (summary берёт только SELL без sentimental).
    verdict: item.sentimental ? "SHIP" : decision.verdict,
    savings: decision.savings,
    confidence: confidenceFor(move, item, decision.diff, decision.threshold),
  };
}

export function estimateMove(move: Move, items: Item[]): Estimate[] {
  return items.map((item) => estimateItem(move, item));
}
