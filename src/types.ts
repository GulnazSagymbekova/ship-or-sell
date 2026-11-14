// Контракт данных. Не менять без согласования с командой (см. CLAUDE.md).

export type MoveType = "diy_truck" | "container" | "full_service";
export type MoveStatus = "draft" | "analyzing" | "analyzed" | "paid";
export type Verdict = "SHIP" | "SELL" | "TOSSUP";
export type Category =
  | "sofa" | "sectional" | "armchair" | "bed_frame" | "mattress" | "dresser"
  | "nightstand" | "dining_table" | "dining_chair" | "coffee_table" | "desk"
  | "office_chair" | "bookshelf" | "tv_stand" | "wardrobe" | "rug" | "lamp" | "other";

export interface Move {
  id: string; userId: string;
  fromZip: string; toZip: string; distanceMi: number | null;
  moveType: MoveType; moveDate: string; status: MoveStatus;
}

export interface Item {
  id: string; moveId: string; photoPath: string;
  category: Category; name: string; brand: string | null; material: string;
  condition: 1 | 2 | 3 | 4 | 5;
  widthIn: number; depthIn: number; heightIn: number;
  volumeCuFt: number; weightLb: number;
  sentimental: boolean; userEdited: boolean; aiConfidence: number; // 0..1
}

export interface Estimate {
  itemId: string;
  shipCost: number; resaleLow: number; resaleHigh: number; replaceCost: number;
  verdict: Verdict; savings: number; confidence: number; // 0..1
}

export interface Listing {
  itemId: string; title: string; description: string;
  priceQuick: number; priceMax: number;
}

// --- Добавлено. Типы выше не меняются. ---

export interface MoveSummary {
  sellCount: number;      // вещей с вердиктом SELL
  totalSavings: number;   // сумма savings по SELL, без sentimental
  shipAllCost: number;    // перевезти всё
  optimalCost: number;    // стоимость по рекомендованному плану
}

// Ответ POST /api/estimate
export interface EstimateResult {
  estimates: Estimate[];
  lockedItemIds: string[]; // цифры обнулены сервером, verdict настоящий
  summary: MoveSummary;    // всегда полная, даже без оплаты
}

// Ответ GET /api/moves/:id
export interface MoveDetails {
  move: Move;
  fromCity: string | null; toCity: string | null; // из zips.json
  items: Item[];
  photoUrls: Record<string, string>; // photoPath → signed URL (TTL 600 с)
  estimates: Estimate[];
  lockedItemIds: string[];
  summary: MoveSummary | null;       // null, пока оценок нет
  listings: Listing[];               // пусто, пока status !== "paid"
}
