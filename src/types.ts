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
  plan?: MovePlan;          // v2; необязательно, пока сервер не отдаёт план
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
  plan?: MovePlan | null;            // v2; null, пока оценок нет
}

// --- План переезда (v2, «Move Money Plan»). Только добавления, типы выше не меняются. ---

export type PlanAction = "ship" | "sell" | "sell_buy_later" | "donate";

export interface PlanItem {
  itemId: string;
  action: PlanAction;
  sellChance: number;      // 0..1, шанс продать к дате переезда
  expectedResale: number;  // $ с учётом шанса и срока
  sellBy: string | null;   // YYYY-MM-DD, последний день выставить по высокой цене; null если не продаём
}

export interface MovePlan {
  vehicle: string;           // "15 ft truck" | "1 container" | "~3,200 lb full service"
  vehicleIfShipAll: string;  // то же, если везти всё
  shipCost: number;          // перевозка того, что везём, $
  shipAllCost: number;       // перевозка всего, $
  cashBeforeMove: number;    // + ожидаемые продажи, $
  cashMoveDay: number;       // − оплата перевозки (число ≥ 0, знак показывает UI)
  cashWeek1: number;         // − замена вещей, нужных сразу (кровать, матрас)
  cashMonth1: number;        // − остальная замена (б/у или новая, что дешевле)
  netCash: number;           // cashBeforeMove − cashMoveDay − cashWeek1 − cashMonth1 (может быть < 0)
  netCashIfShipAll: number;  // −shipAllCost
  freedCash: number;         // netCash − netCashIfShipAll, главная цифра на экране
  items: PlanItem[];         // у неоплаченного переезда только вещи НЕ из lockedItemIds
  tips: string[];            // "Sell Sofa, Desk and Rug to drop to a 15 ft truck: save $420"; пусто, если не оплачено
}

