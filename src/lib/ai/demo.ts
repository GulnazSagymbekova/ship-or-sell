import "server-only";
import bed from "@/data/demo/bed.json";
import dresser from "@/data/demo/dresser.json";
import sofa from "@/data/demo/sofa.json";
import table from "@/data/demo/table.json";
import type { DetectedItem } from "./vision";

// Настоящие ответы Claude на 4 демо-фото команды (снято на проде 15.11.2026) — для DEMO_FALLBACK.
// Порядок = порядок загрузки на демо: 1) кровать, 2) стол, 3) комод, 4) диван.
// Загружайте фото на демо в том же порядке — тогда даже без Claude ответ совпадёт с фото.
const DEMO_SETS = [bed, table, dresser, sofa] as unknown as DetectedItem[][];

/** Демо-набор по номеру фото в переезде (0 — первое загруженное). */
export function demoItemsFor(photoIndex: number): DetectedItem[] {
  const i = Number.isFinite(photoIndex) && photoIndex >= 0 ? Math.floor(photoIndex) : 0;
  return DEMO_SETS[i % DEMO_SETS.length];
}
