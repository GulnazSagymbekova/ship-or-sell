// Home+ (опись дома для страховки). Отдельно от src/types.ts — контракт команды не трогаем.
import type { Category } from "@/types";

export interface Home {
  id: string;
  name: string;
  sourceMoveId: string | null;
  coverageLimit: number | null;
  createdAt: string;
}

export interface HomeItem {
  id: string;
  homeId: string;
  photoPath: string | null;
  category: Category;
  name: string;
  brand: string | null;
  material: string;
  condition: 1 | 2 | 3 | 4 | 5;
  widthIn: number;
  depthIn: number;
  heightIn: number;
  replaceNew: number;
  purchasePrice: number | null;
  serialNumber: string | null;
}

export interface HomeDetails {
  home: Home;
  items: HomeItem[];
  photoUrls: Record<string, string>; // photoPath → signed URL, TTL 600 с
  totalValue: number; // Σ replaceNew
  coverageGap: number | null; // totalValue − coverageLimit; null, если лимит не задан
  homePlus: { active: boolean; status: string | null; billingEnabled: boolean };
}
