import zipsJson from "@/data/zips.json";

/**
 * Поиск места переезда по городу или ZIP (для подсказок в форме).
 * Справочник src/data/zips.json (~42 тыс. ZIP, 2,9 МБ) остаётся на сервере — в браузер уходят
 * только найденные варианты. Город превращается в ZIP его «центра»: ближайший к среднему
 * координат всех ZIP этого города. По нему же считается дистанция переезда.
 */

export interface Place {
  zip: string;
  city: string;
  state: string;
  /** "Austin, TX" или "78701 — Austin, TX" (если искали по цифрам) */
  label: string;
}

interface ZipInfo {
  lat: number;
  lng: number;
  city: string;
  state: string;
}

interface CityEntry {
  /** город в нижнем регистре — для поиска */
  key: string;
  /** слова названия в нижнем регистре: "new york" → ["new", "york"] */
  words: string[];
  city: string;
  state: string;
  /** ZIP, ближайший к центру города */
  zip: string;
  /** сколько ZIP у города — грубая замена численности населения для ранжирования */
  size: number;
}

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};
const STATE_CODES = new Set(Object.values(STATE_NAMES));

const ZIPS = zipsJson as unknown as Record<string, ZipInfo>;

let cityIndex: CityEntry[] | null = null;
let zipKeys: string[] | null = null;

const norm = (s: string) => s.toLowerCase().replace(/[.']/g, "").replace(/\s+/g, " ").trim();

function buildIndex() {
  const groups = new Map<string, { city: string; state: string; zips: [string, ZipInfo][] }>();
  const keys: string[] = [];
  for (const [zip, info] of Object.entries(ZIPS)) {
    if (!/^\d{5}$/.test(zip) || !info?.city || !info?.state) continue;
    keys.push(zip);
    const k = `${info.city}|${info.state}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { city: info.city, state: info.state, zips: [] }));
    g.zips.push([zip, info]);
  }
  const cities: CityEntry[] = [];
  for (const g of groups.values()) {
    const lat = g.zips.reduce((s, [, i]) => s + i.lat, 0) / g.zips.length;
    const lng = g.zips.reduce((s, [, i]) => s + i.lng, 0) / g.zips.length;
    let best = g.zips[0];
    let bestD = Infinity;
    for (const z of g.zips) {
      const d = (z[1].lat - lat) ** 2 + (z[1].lng - lng) ** 2;
      if (d < bestD || (d === bestD && z[0] < best[0])) {
        best = z;
        bestD = d;
      }
    }
    const key = norm(g.city);
    cities.push({ key, words: key.split(" "), city: g.city, state: g.state, zip: best[0], size: g.zips.length });
  }
  // Крупные города первыми — при равном совпадении Austin, TX выше Austin, MN.
  cities.sort((a, b) => b.size - a.size || a.key.localeCompare(b.key));
  keys.sort();
  cityIndex = cities;
  zipKeys = keys;
}

/** "austin, tx" | "austin tx" | "austin, texas" → { city: "austin", state: "TX" } */
function parseQuery(q: string): { city: string; state: string | null } {
  const comma = q.indexOf(",");
  if (comma >= 0) {
    const city = q.slice(0, comma).trim();
    const st = q.slice(comma + 1).trim();
    if (!st) return { city, state: null };
    const code = st.length === 2 ? st.toUpperCase() : STATE_NAMES[st];
    return { city, state: code && STATE_CODES.has(code) ? code : null };
  }
  const words = q.split(" ");
  const last = words[words.length - 1];
  if (words.length > 1 && last.length === 2 && STATE_CODES.has(last.toUpperCase())) {
    return { city: words.slice(0, -1).join(" "), state: last.toUpperCase() };
  }
  return { city: q, state: null };
}

export function searchPlaces(query: string, limit = 8): Place[] {
  const q = norm(query ?? "");
  if (q.length < 2) return [];
  if (!cityIndex || !zipKeys) buildIndex();

  // Цифры — поиск по началу ZIP (от 3 цифр).
  if (/^\d+$/.test(q)) {
    if (q.length < 3 || q.length > 5) return [];
    const out: Place[] = [];
    for (const zip of zipKeys!) {
      if (!zip.startsWith(q)) continue;
      const i = ZIPS[zip];
      out.push({ zip, city: i.city, state: i.state, label: `${zip} — ${i.city}, ${i.state}` });
      if (out.length >= limit) break;
    }
    return out;
  }

  const { city, state } = parseQuery(q);
  if (city.length < 2) return [];
  const scored: { c: CityEntry; score: number }[] = [];
  for (const c of cityIndex!) {
    if (state && c.state !== state) continue;
    let score: number;
    // Точное совпадение и совпадение по началу — один уровень (внутри — крупные первыми):
    // "brook" → Brooklyn, NY выше крошечного Brook, IN.
    if (c.key.startsWith(city)) score = 0;
    else if (c.words.some((w) => w.startsWith(city))) score = 1;
    else if (city.length >= 3 && c.key.includes(city)) score = 2;
    else continue;
    scored.push({ c, score });
  }
  // Стабильная сортировка: внутри одного score сохраняется порядок «крупные первыми».
  scored.sort((a, b) => a.score - b.score);
  return scored
    .slice(0, limit)
    .map(({ c }) => ({ zip: c.zip, city: c.city, state: c.state, label: `${c.city}, ${c.state}` }));
}
