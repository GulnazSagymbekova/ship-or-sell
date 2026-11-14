import zipsJson from "@/data/zips.json";

export interface ZipInfo {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

// src/data/zips.json готовит C: { "78701": { "lat": .., "lng": .., "city": "Austin", "state": "TX" }, ... }
const ZIPS = zipsJson as unknown as Record<string, ZipInfo>;

export function lookupZip(zip: string): ZipInfo | null {
  return ZIPS[zip] ?? null;
}

/** Название города для UI и для объявления (в AI уходит только оно, не ZIP). */
export function cityForZip(zip: string): string | null {
  return lookupZip(zip)?.city ?? null;
}

const EARTH_RADIUS_MI = 3958.8;
/** Приближение дорожной дистанции: haversine × 1.2. */
const ROAD_FACTOR = 1.2;

export function distanceMiBetween(fromZip: string, toZip: string): number | null {
  const a = lookupZip(fromZip);
  const b = lookupZip(toZip);
  if (!a || !b) return null;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const miles = 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(miles * ROAD_FACTOR);
}
