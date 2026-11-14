// Mock backend for endpoints that aren't live yet. Follows src/types.ts exactly.
//
// Two modes (see src/lib/api-client.ts):
// - hybrid (default): moves + upload are real; analyze/items/estimate/listings/checkout
//   are served here and overlaid onto the real MoveDetails via `overlayDetails`.
// - full mock (NEXT_PUBLIC_USE_MOCKS=true): everything is served here, no Supabase needed.
//
// State is mirrored to sessionStorage so a reload keeps the demo data.
// NEXT_PUBLIC_MOCK_FAIL_RATE (0..1) makes upload/analyze fail randomly to demo Retry.

import type {
  Category,
  Estimate,
  EstimateResult,
  Item,
  Listing,
  Move,
  MoveDetails,
  MoveSummary,
  MoveType,
} from "@/types";
import type { MoveInput, NewItemInput } from "@/lib/api-client";
import { LIMITS } from "@/client/config";
import { ApiError } from "@/client/errors";
import { planMove } from "@/lib/pricing/plan";
import { applyPlanPaywall } from "@/lib/paywall";

const FAIL_RATE = Number(process.env.NEXT_PUBLIC_MOCK_FAIL_RATE ?? 0) || 0;
const STORAGE_KEY = "sos-mock-db-v2";
const PLACEHOLDER_PHOTO = "/demo/placeholder.svg";
const MOCK_USER_ID = "mock-user";

interface Db {
  /** Moves created in full-mock mode. */
  moves: Move[];
  /** Real moves seen via GET /api/moves/:id (hybrid mode), for pricing. */
  known: Record<string, Move>;
  /** Real items per move seen via GET /api/moves/:id (hybrid mode). */
  knownItems: Record<string, Item[]>;
  /** photoPaths uploaded in full-mock mode, per move. */
  photos: Record<string, string[]>;
  items: Item[];
  estimates: Estimate[];
  listings: Listing[];
  paid: string[];
}

let db: Db | null = null;
/** photoPath → local object URL (full-mock mode, current tab only). */
const localPhotoUrls = new Map<string, string>();

function load(): Db {
  if (db) return db;
  db = { moves: [], known: {}, knownItems: {}, photos: {}, items: [], estimates: [], listings: [], paid: [] };
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) db = { ...db, ...(JSON.parse(raw) as Db) };
    } catch {
      /* ignore */
    }
  }
  return db;
}

function save() {
  if (typeof window === "undefined" || !db) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota or private mode — memory only */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
const maybeFail = (kind: "network" | "ai_busy" = "network") => {
  if (FAIL_RATE > 0 && Math.random() < FAIL_RATE) throw new ApiError(kind, kind === "ai_busy" ? 503 : 500);
};

const ZIP_CITIES: Record<string, string> = {
  "10001": "New York",
  "11201": "Brooklyn",
  "60601": "Chicago",
  "78701": "Austin",
  "94103": "San Francisco",
  "98101": "Seattle",
  "33101": "Miami",
  "80202": "Denver",
  "02108": "Boston",
  "90012": "Los Angeles",
};
const cityFor = (zip: string) => ZIP_CITIES[zip] ?? null;

// --- demo catalogue -------------------------------------------------------

type Template = Omit<Item, "id" | "moveId" | "photoPath" | "userEdited">;

const t = (
  category: Category,
  name: string,
  brand: string | null,
  material: string,
  condition: Item["condition"],
  [w, d, h]: [number, number, number],
  weightLb: number,
  aiConfidence: number,
): Template => ({
  category,
  name,
  brand,
  material,
  condition,
  widthIn: w,
  depthIn: d,
  heightIn: h,
  volumeCuFt: Math.round(((w * d * h) / 1728) * 10) / 10,
  weightLb,
  sentimental: false,
  aiConfidence,
});

const CATALOGUE: Template[][] = [
  [t("sofa", "Gray 3-seat sofa", "IKEA", "fabric", 3, [84, 35, 33], 120, 0.93)],
  [t("dresser", "6-drawer wood dresser", null, "oak veneer", 4, [60, 18, 31], 140, 0.88), t("lamp", "Brass table lamp", null, "metal", 4, [10, 10, 24], 6, 0.52)],
  [t("dining_table", "Round dining table", "West Elm", "solid wood", 4, [48, 48, 30], 90, 0.9), t("dining_chair", "Dining chair (set of 4)", null, "wood", 3, [18, 20, 34], 40, 0.71)],
  [t("bed_frame", "Queen platform bed", "Zinus", "metal", 3, [64, 84, 14], 70, 0.86)],
  [t("bookshelf", "Tall white bookshelf", "IKEA", "particleboard", 2, [31, 11, 79], 75, 0.81)],
  [t("office_chair", "Ergonomic office chair", "Herman Miller", "mesh", 4, [27, 27, 41], 50, 0.95), t("desk", "Standing desk", "Uplift", "bamboo", 4, [60, 30, 29], 95, 0.58)],
  [t("coffee_table", "Glass coffee table", null, "glass", 3, [44, 24, 18], 45, 0.77)],
  [t("tv_stand", "Low TV stand", null, "walnut veneer", 3, [60, 16, 20], 60, 0.64)],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// --- pricing (mock only; real logic is C's estimateMove) -------------------

const RATE_PER_CUFT: Record<MoveType, number> = { diy_truck: 4, container: 7, full_service: 12 };
const REPLACE_BASE: Partial<Record<Category, number>> = {
  sofa: 900, sectional: 1600, armchair: 450, bed_frame: 400, mattress: 700, dresser: 550, nightstand: 150,
  dining_table: 600, dining_chair: 320, coffee_table: 250, desk: 500, office_chair: 900, bookshelf: 150,
  tv_stand: 250, wardrobe: 600, rug: 300, lamp: 80, other: 200,
};

function priceItem(move: Move, item: Item): Estimate {
  const distanceFactor = Math.max(1, (move.distanceMi ?? 1000) / 1000);
  const shipCost = Math.round(item.volumeCuFt * RATE_PER_CUFT[move.moveType] * distanceFactor + item.weightLb * 0.3);
  const replaceCost = REPLACE_BASE[item.category] ?? 200;
  const resaleMid = replaceCost * (0.15 + item.condition * 0.08);
  const resaleLow = Math.round(resaleMid * 0.8);
  const resaleHigh = Math.round(resaleMid * 1.15);
  const sellOutcome = replaceCost - (resaleLow + resaleHigh) / 2; // net cost to sell and rebuy
  const savings = Math.max(0, Math.round(shipCost - sellOutcome));
  let verdict: Estimate["verdict"] = Math.abs(shipCost - sellOutcome) < shipCost * 0.15 ? "TOSSUP" : shipCost > sellOutcome ? "SELL" : "SHIP";
  if (item.sentimental) verdict = "SHIP";
  return {
    itemId: item.id,
    shipCost,
    resaleLow,
    resaleHigh,
    replaceCost,
    verdict,
    savings: verdict === "SHIP" && !item.sentimental ? 0 : savings,
    confidence: Math.min(0.95, item.aiConfidence),
  };
}

function summarize(items: Item[], estimates: Estimate[]): MoveSummary {
  const byId = new Map(items.map((i) => [i.id, i]));
  let sellCount = 0;
  let totalSavings = 0;
  let shipAllCost = 0;
  for (const e of estimates) {
    shipAllCost += e.shipCost;
    if (e.verdict === "SELL") {
      sellCount++;
      if (!byId.get(e.itemId)?.sentimental) totalSavings += e.savings;
    }
  }
  return { sellCount, totalSavings, shipAllCost, optimalCost: Math.max(0, shipAllCost - totalSavings) };
}

/** Server-side style locking: all but the top-3 savings get zeroed numbers unless paid. */
function lockFor(paid: boolean, estimates: Estimate[]) {
  if (paid) return { visible: estimates, lockedItemIds: [] as string[] };
  const top = [...estimates].sort((a, b) => b.savings - a.savings).slice(0, 3).map((e) => e.itemId);
  const lockedItemIds = estimates.map((e) => e.itemId).filter((id) => !top.includes(id));
  const visible = estimates.map((e) =>
    lockedItemIds.includes(e.itemId)
      ? { ...e, shipCost: 0, resaleLow: 0, resaleHigh: 0, replaceCost: 0, savings: 0 }
      : e,
  );
  return { visible, lockedItemIds };
}

// --- helpers --------------------------------------------------------------

function findMove(id: string): Move {
  const d = load();
  const move = d.moves.find((m) => m.id === id) ?? d.known[id];
  if (!move) throw new ApiError("not_found", 404);
  return move;
}

function findItem(id: string): Item {
  const d = load();
  const item = d.items.find((i) => i.id === id) ?? Object.values(d.knownItems).flat().find((i) => i.id === id);
  if (!item) throw new ApiError("not_found", 404);
  return item;
}

const isPaid = (moveId: string) => load().paid.includes(moveId);
/** Items created by the mock (mocked analyze / add). */
const itemsOf = (moveId: string) => load().items.filter((i) => i.moveId === moveId);
/** Real items (from the backend) + mock items for a move. */
const allItemsOf = (moveId: string) => {
  const real = load().knownItems[moveId] ?? [];
  return [...real, ...itemsOf(moveId).filter((m) => !real.some((r) => r.id === m.id))];
};

function estimatesView(moveId: string) {
  const items = allItemsOf(moveId);
  const raw = load().estimates.filter((e) => items.some((i) => i.id === e.itemId));
  const { visible, lockedItemIds } = lockFor(isPaid(moveId), raw);
  const move = load().moves.find((m) => m.id === moveId) ?? load().known[moveId];
  return {
    estimates: visible,
    lockedItemIds,
    summary: raw.length ? summarize(items, raw) : null,
    // v2: тот же planMove, что на сервере (чистая функция).
    plan:
      raw.length && move
        ? applyPlanPaywall(planMove(move, items, raw, new Date().toISOString().slice(0, 10)), lockedItemIds, isPaid(moveId))
        : null,
    listings: isPaid(moveId) ? load().listings.filter((l) => items.some((i) => i.id === l.itemId)) : [],
  };
}

// --- hybrid overlay -------------------------------------------------------

/**
 * Merge mocked state (items, estimates, listings, paid) into a real MoveDetails.
 * Real items/estimates win if the backend already returns them.
 */
export function overlayDetails(real: MoveDetails): MoveDetails {
  const d = load();
  d.known[real.move.id] = real.move;
  d.knownItems[real.move.id] = real.items;
  save();
  const mockItems = itemsOf(real.move.id).filter((m) => !real.items.some((r) => r.id === m.id));
  const view = estimatesView(real.move.id);
  const useMockEstimates = real.estimates.length === 0 && view.estimates.length > 0;
  return {
    ...real,
    move: isPaid(real.move.id) ? { ...real.move, status: "paid" } : real.move,
    items: [...real.items, ...mockItems],
    estimates: useMockEstimates ? view.estimates : real.estimates,
    lockedItemIds: useMockEstimates ? view.lockedItemIds : real.lockedItemIds,
    summary: real.summary ?? view.summary,
    plan: real.plan ?? view.plan,
    listings: real.listings.length ? real.listings : view.listings,
  };
}

/** Drop mocked state for a move that was deleted on the real backend. */
export function forgetMove(moveId: string) {
  const d = load();
  const ids = new Set(itemsOf(moveId).map((i) => i.id));
  d.moves = d.moves.filter((m) => m.id !== moveId);
  delete d.known[moveId];
  delete d.knownItems[moveId];
  delete d.photos[moveId];
  d.items = d.items.filter((i) => i.moveId !== moveId);
  d.estimates = d.estimates.filter((e) => !ids.has(e.itemId));
  d.listings = d.listings.filter((l) => !ids.has(l.itemId));
  d.paid = d.paid.filter((id) => id !== moveId);
  save();
}

// --- API ------------------------------------------------------------------

export const mockApi = {
  async listMoves(): Promise<Move[]> {
    await jitter(200, 400);
    return load()
      .moves.map((m) => (isPaid(m.id) ? { ...m, status: "paid" as const } : m))
      .reverse();
  },

  async createMove(input: MoveInput): Promise<Move> {
    await jitter(300, 600);
    if (!/^\d{5}$/.test(input.fromZip) || !/^\d{5}$/.test(input.toZip)) {
      throw new ApiError("validation", 400, "ZIP must be 5 digits");
    }
    const move: Move = {
      id: uuid(),
      userId: MOCK_USER_ID,
      fromZip: input.fromZip,
      toZip: input.toZip,
      distanceMi: 800 + (hash(input.fromZip + input.toZip) % 1800),
      moveType: input.moveType,
      moveDate: input.moveDate,
      status: "draft",
    };
    load().moves.push(move);
    save();
    return move;
  },

  async getMove(id: string): Promise<MoveDetails> {
    await jitter(200, 400);
    const move = findMove(id);
    const d = load();
    const photoUrls: Record<string, string> = {};
    for (const p of d.photos[id] ?? []) photoUrls[p] = localPhotoUrls.get(p) ?? PLACEHOLDER_PHOTO;
    return {
      move: isPaid(id) ? { ...move, status: "paid" } : move,
      fromCity: cityFor(move.fromZip),
      toCity: cityFor(move.toZip),
      items: itemsOf(id),
      photoUrls,
      ...estimatesView(id),
    };
  },

  async deleteMove(id: string): Promise<void> {
    await jitter(300, 500);
    findMove(id);
    forgetMove(id);
  },

  async uploadPhoto(moveId: string, file: Blob): Promise<{ photoPath: string }> {
    await jitter(500, 1200);
    findMove(moveId);
    const d = load();
    const photos = (d.photos[moveId] ??= []);
    if (photos.length >= LIMITS.maxPhotosPerMove) {
      throw new ApiError("rate_limited", 429, `Up to ${LIMITS.maxPhotosPerMove} photos per move`);
    }
    maybeFail();
    const photoPath = `${MOCK_USER_ID}/${moveId}/${uuid()}.jpg`;
    photos.push(photoPath);
    save();
    if (typeof URL !== "undefined") localPhotoUrls.set(photoPath, URL.createObjectURL(file));
    return { photoPath };
  },

  async analyze(moveId: string, photoPath: string): Promise<Item[]> {
    await jitter(3000, 6000);
    findMove(moveId);
    maybeFail("ai_busy");
    const d = load();
    const existing = allItemsOf(moveId).length;
    if (existing >= LIMITS.maxItemsPerMove) {
      throw new ApiError("rate_limited", 429, `Up to ${LIMITS.maxItemsPerMove} items per move`);
    }
    const templates = CATALOGUE[hash(photoPath) % CATALOGUE.length].slice(0, LIMITS.maxItemsPerMove - existing);
    const items: Item[] = templates.map((tpl) => ({ ...tpl, id: uuid(), moveId, photoPath, userEdited: false }));
    d.items.push(...items);
    save();
    return items;
  },

  async addItem(input: NewItemInput): Promise<Item> {
    await jitter(300, 500);
    findMove(input.moveId);
    if (itemsOf(input.moveId).length >= LIMITS.maxItemsPerMove) {
      throw new ApiError("rate_limited", 429, `Up to ${LIMITS.maxItemsPerMove} items per move`);
    }
    const base = CATALOGUE.flat().find((x) => x.category === input.category) ?? CATALOGUE[0][0];
    const item: Item = {
      ...base,
      id: uuid(),
      moveId: input.moveId,
      photoPath: input.photoPath,
      category: input.category,
      name: input.name,
      brand: null,
      condition: 3,
      sentimental: false,
      userEdited: true,
      aiConfidence: 1,
    };
    load().items.push(item);
    save();
    return item;
  },

  async updateItem(id: string, patch: Partial<Item>): Promise<Item> {
    await jitter(300, 500);
    const item = findItem(id);
    // Not editable per contract: id, moveId, photoPath, aiConfidence.
    const { id: _id, moveId: _m, photoPath: _p, aiConfidence: _c, ...rest } = patch;
    void [_id, _m, _p, _c];
    Object.assign(item, rest, { userEdited: true });
    save();
    return { ...item };
  },

  async deleteItem(id: string): Promise<void> {
    await jitter(200, 400);
    const d = load();
    findItem(id);
    d.items = d.items.filter((i) => i.id !== id);
    d.estimates = d.estimates.filter((e) => e.itemId !== id);
    d.listings = d.listings.filter((l) => l.itemId !== id);
    save();
  },

  async estimate(moveId: string): Promise<EstimateResult> {
    await jitter(800, 1400);
    const d = load();
    const move = findMove(moveId);
    const items = allItemsOf(moveId);
    const ids = new Set(items.map((i) => i.id));
    const raw = items.map((i) => priceItem(move, i));
    d.estimates = [...d.estimates.filter((e) => !ids.has(e.itemId)), ...raw];
    save();
    const { visible, lockedItemIds } = lockFor(isPaid(moveId), raw);
    const today = new Date().toISOString().slice(0, 10);
    const plan = applyPlanPaywall(planMove(move, items, raw, today), lockedItemIds, isPaid(moveId));
    return { estimates: visible, lockedItemIds, summary: summarize(items, raw), plan };
  },

  async createListing(itemId: string): Promise<Listing> {
    await jitter(1200, 2400);
    const d = load();
    const item = findItem(itemId);
    const move = findMove(item.moveId);
    if (!isPaid(move.id)) throw new ApiError("payment_required", 402);
    const est = d.estimates.find((e) => e.itemId === itemId) ?? priceItem(move, item);
    if (est.verdict === "SHIP") throw new ApiError("conflict", 409, "Listings are only for items to sell");
    const cached = d.listings.find((l) => l.itemId === itemId);
    if (cached) return cached;
    const city = cityFor(move.fromZip);
    const listing: Listing = {
      itemId,
      title: `${item.brand ? item.brand + " " : ""}${item.name}`.slice(0, 80),
      description: [
        `${item.name} in ${["poor", "fair", "good", "very good", "excellent"][item.condition - 1]} condition.`,
        `Material: ${item.material}. Size: ${item.widthIn}"W x ${item.depthIn}"D x ${item.heightIn}"H.`,
        `Moving out of state${city ? ` — pickup in ${city}` : ""} before ${move.moveDate}. Cash or Venmo.`,
      ].join("\n"),
      priceQuick: est.resaleLow,
      priceMax: est.resaleHigh,
    };
    d.listings.push(listing);
    save();
    return listing;
  },

  async checkout(moveId: string): Promise<{ url: string }> {
    await jitter(400, 700);
    findMove(moveId);
    const d = load();
    if (!d.paid.includes(moveId)) d.paid.push(moveId); // real flow: Stripe webhook sets it
    save();
    return { url: `/move/${moveId}/success` };
  },
};
