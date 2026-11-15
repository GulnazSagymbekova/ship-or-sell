import type { Category, MoveStatus, MoveType } from "@/types";

export const MOVE_TYPES: { value: MoveType; label: string; hint: string }[] = [
  { value: "diy_truck", label: "DIY truck", hint: "You rent a truck and drive it yourself." },
  { value: "container", label: "Container (PODS)", hint: "They drop a container, you pack, they ship it." },
  { value: "full_service", label: "Full-service movers", hint: "Movers pack, load and deliver everything." },
];

export const MOVE_TYPE_LABEL: Record<MoveType, string> = Object.fromEntries(
  MOVE_TYPES.map((m) => [m.value, m.label]),
) as Record<MoveType, string>;

export const MOVE_STATUS_LABEL: Record<MoveStatus, string> = {
  draft: "Draft",
  analyzing: "Analyzing",
  analyzed: "Report ready",
  paid: "Unlocked",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  sofa: "Sofa",
  sectional: "Sectional",
  armchair: "Armchair",
  bed_frame: "Bed frame",
  mattress: "Mattress",
  dresser: "Dresser",
  nightstand: "Nightstand",
  dining_table: "Dining table",
  dining_chair: "Dining chair",
  coffee_table: "Coffee table",
  desk: "Desk",
  office_chair: "Office chair",
  bookshelf: "Bookshelf",
  tv_stand: "TV stand",
  wardrobe: "Wardrobe",
  rug: "Rug",
  lamp: "Lamp",
  other: "Other",
};

/** "2026-12-01" → "Dec 1, 2026" without timezone drift. */
export function formatMoveDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
