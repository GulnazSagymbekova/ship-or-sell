import "server-only";
import bed from "@/data/demo/bed.json";
import dresser from "@/data/demo/dresser.json";
import sofa from "@/data/demo/sofa.json";
import table from "@/data/demo/table.json";
import type { DetectedItem } from "./vision";

// Заранее сохранённые ответы распознавания для DEMO_FALLBACK (страховка для демо).
// Файлы в src/data/demo/*.json; в B3 заменить реальными ответами Claude на 4 демо-фото.
const DEMO_SETS = [sofa, dresser, table, bed] as unknown as DetectedItem[][];

/** Детерминированно выбирает демо-набор по photoPath: одно и то же фото → тот же ответ. */
export function demoItemsFor(photoPath: string): DetectedItem[] {
  let h = 0;
  for (let i = 0; i < photoPath.length; i++) h = (h * 31 + photoPath.charCodeAt(i)) >>> 0;
  return DEMO_SETS[h % DEMO_SETS.length];
}
