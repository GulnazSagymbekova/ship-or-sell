// Mock backend that follows types.ts exactly. Enabled by NEXT_PUBLIC_USE_MOCKS=true.
// State lives in memory and is mirrored to sessionStorage, so a page reload keeps the demo data.
// NEXT_PUBLIC_MOCK_FAIL_RATE (0..1, default 0) makes upload/analyze fail randomly to demo Retry.

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
import type { Api, MoveInput, NewItemInput } from "./api";
import { LIMITS } from "./config";
import { ApiError } from "./errors";

const FAIL_RATE = Number(process.env.NEXT_PUBLIC_MOCK_FAIL_RATE ?? 0) || 0;
const STORAGE_KEY = "sos-mock-db-v1";
const PLACEHOLDER_PHOTO = "/demo/placeholder.svg";
const MOCK_USER_ID = "mock-user";

interface Db {
  moves: Move[];
  items: Item[];
  estimates: Estimate[];
  listings: Listing[];
}

let db: Db | null = null;
/** photoPath → local object URL (only for photos uploaded in this tab). */
const localPhotoUrls = new Map<string, string>();

function load(): Db {
  if (db) return db;
  db = { moves: [], items: [], estimates: [], listings: [] };
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) db = JSON.parse(raw) as Db;
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
const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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
function lockFor(move: Move, estimates: Estimate[]) {
  if (move.status === "paid") return { visible: estimates, lockedItemIds: [] as string[] };
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

function getMoveOr404(id: string): Move {
  const move = load().moves.find((m) => m.id === id);
  if (!move) throw new ApiError("not_found", 404);
  return move;
}

function getItemOr404(id: string): Item {
  const item = load().items.find((i) => i.id === id);
  if (!item) throw new ApiError("not_found", 404);
  return item;
}

function photoCount(moveId: string) {
  return new Set(load().items.filter((i) => i.moveId === moveId).map((i) => i.photoPath)).size;
}

// --- API ------------------------------------------------------------------

export const mockApi: Api = {
  async listMoves() {
    await jitter(200, 400);
    return [...load().moves].reverse();
  },

  async createMove(input: MoveInput) {
    await jitter(300, 600);
    if (!/^\d{5}$/.test(input.fromZip) || !/^\d{5}$/.test(input.toZip)) throw new ApiError("validation", 400);
    const move: Move = {
      id: uid("mv"),
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
    const d = load();
    const move = getMoveOr404(id);
    const items = d.items.filter((i) => i.moveId === id);
    const raw = d.estimates.filter((e) => items.some((i) => i.id === e.itemId));
    const { visible, lockedItemIds } = lockFor(move, raw);
    const photoUrls: Record<string, string> = {};
    for (const i of items) photoUrls[i.photoPath] = localPhotoUrls.get(i.photoPath) ?? PLACEHOLDER_PHOTO;
    return {
      move,
      fromCity: cityFor(move.fromZip),
      toCity: cityFor(move.toZip),
      items,
      photoUrls,
      estimates: visible,
      lockedItemIds,
      summary: raw.length ? summarize(items, raw) : null,
      listings: move.status === "paid" ? d.listings.filter((l) => items.some((i) => i.id === l.itemId)) : [],
    };
  },

  async deleteMove(id: string) {
    await jitter(300, 500);
    const d = load();
    getMoveOr404(id);
    const itemIds = new Set(d.items.filter((i) => i.moveId === id).map((i) => i.id));
    d.moves = d.moves.filter((m) => m.id !== id);
    d.items = d.items.filter((i) => i.moveId !== id);
    d.estimates = d.estimates.filter((e) => !itemIds.has(e.itemId));
    d.listings = d.listings.filter((l) => !itemIds.has(l.itemId));
    save();
  },

  async uploadPhoto(moveId: string, file: File) {
    await jitter(500, 1200);
    getMoveOr404(moveId);
    if (!file.type.startsWith("image/") || file.size > LIMITS.maxPhotoBytes) throw new ApiError("validation", 400);
    if (photoCount(moveId) >= LIMITS.maxPhotosPerMove) throw new ApiError("rate_limited", 429);
    maybeFail();
    const photoPath = `${MOCK_USER_ID}/${moveId}/${uid("ph")}.jpg`;
    if (typeof URL !== "undefined") localPhotoUrls.set(photoPath, URL.createObjectURL(file));
    return { photoPath };
  },

  async analyze(moveId: string, photoPath: string) {
    await jitter(1500, 3500);
    const d = load();
    const move = getMoveOr404(moveId);
    maybeFail("ai_busy");
    const existing = d.items.filter((i) => i.moveId === moveId).length;
    const templates = CATALOGUE[hash(photoPath) % CATALOGUE.length].slice(0, LIMITS.maxItemsPerMove - existing);
    const items: Item[] = templates.map((tpl) => ({ ...tpl, id: uid("it"), moveId, photoPath, userEdited: false }));
    d.items.push(...items);
    move.status = move.status === "paid" ? "paid" : "analyzed";
    save();
    return items;
  },

  async addItem(input: NewItemInput) {
    await jitter(300, 500);
    const d = load();
    getMoveOr404(input.moveId);
    if (d.items.filter((i) => i.moveId === input.moveId).length >= LIMITS.maxItemsPerMove) {
      throw new ApiError("rate_limited", 429);
    }
    const base = CATALOGUE.flat().find((x) => x.category === input.category) ?? CATALOGUE[0][0];
    const item: Item = {
      ...base,
      id: uid("it"),
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
    d.items.push(item);
    save();
    return item;
  },

  async updateItem(id: string, patch: Partial<Item>) {
    await jitter(300, 500);
    const item = getItemOr404(id);
    const { id: _id, moveId: _m, photoPath: _p, ...rest } = patch;
    void _id;
    void _m;
    void _p;
    Object.assign(item, rest, { userEdited: true });
    save();
    return { ...item };
  },

  async deleteItem(id: string) {
    await jitter(200, 400);
    const d = load();
    getItemOr404(id);
    d.items = d.items.filter((i) => i.id !== id);
    d.estimates = d.estimates.filter((e) => e.itemId !== id);
    d.listings = d.listings.filter((l) => l.itemId !== id);
    save();
  },

  async estimate(moveId: string): Promise<EstimateResult> {
    await jitter(800, 1400);
    const d = load();
    const move = getMoveOr404(moveId);
    const items = d.items.filter((i) => i.moveId === moveId);
    const ids = new Set(items.map((i) => i.id));
    const raw = items.map((i) => priceItem(move, i));
    d.estimates = [...d.estimates.filter((e) => !ids.has(e.itemId)), ...raw];
    save();
    const { visible, lockedItemIds } = lockFor(move, raw);
    return { estimates: visible, lockedItemIds, summary: summarize(items, raw) };
  },

  async createListing(itemId: string) {
    await jitter(1200, 2400);
    const d = load();
    const item = getItemOr404(itemId);
    const move = getMoveOr404(item.moveId);
    if (move.status !== "paid") throw new ApiError("payment_required", 402);
    const cached = d.listings.find((l) => l.itemId === itemId);
    if (cached) return cached;
    const est = d.estimates.find((e) => e.itemId === itemId) ?? priceItem(move, item);
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

  async checkout(moveId: string) {
    await jitter(400, 700);
    const move = getMoveOr404(moveId);
    move.status = "paid"; // the real flow sets this via the Stripe webhook
    save();
    return { url: `/move/${moveId}/success` };
  },
};
