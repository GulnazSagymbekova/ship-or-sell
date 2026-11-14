# Ship-or-Sell — общий контекст

> Вставлять в начало каждой новой сессии с AI-ассистентом (этот файл — `CLAUDE.md` в корне репозитория).

## Продукт

Веб-приложение для взрослых в США, которые переезжают в другой штат.
Пользователь вводит ZIP отправки и назначения, дату и тип переезда, загружает фото мебели.
AI распознаёт каждую вещь. По каждой вещи считаем:

- сколько стоит **перевезти**,
- сколько выручишь при **продаже**,
- сколько стоит **купить замену** на новом месте.

Выдаём вердикт `SHIP` / `SELL` / `TOSSUP` и для вещей на продажу генерируем объявление для Facebook Marketplace.

## Стек

- Next.js 16 (App Router; в репо next@16.4.6 — см. AGENTS.md) + TypeScript + Tailwind + shadcn/ui
- Supabase: Postgres, Auth (magic link), Storage
- Drizzle ORM
- Claude API (`claude-sonnet-5-5`)
- Stripe Checkout (test mode)
- Деплой: Vercel

UI mobile-first, весь текст интерфейса на английском (пользователи — США).

## Конфиденциальность (обязательно)

- RLS включён на **всех** таблицах
- private bucket для фото, доступ только через signed URLs (TTL 600 с)
- удаление EXIF/GPS через `sharp` при загрузке
- секретные ключи (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — только на сервере, без префикса `NEXT_PUBLIC_`
- в логи не пишем email, фото и ответы AI
- **что уходит в AI:**
  - распознавание (`/api/analyze`) — только изображение;
  - объявление (`/api/listings`) — атрибуты вещи (category, name, brand, material, condition, размеры), цены из `Estimate`, название города отправки и дата переезда;
  - **никогда:** email, имя, userId, ZIP, точный адрес

## Контракт данных — `src/types.ts`

Не менять без согласования с командой.

```ts
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
```

## Эндпоинты

| Метод | Путь | Вход | Выход |
|---|---|---|---|
| GET | `/api/moves` | — | `Move[]` (переезды текущего пользователя, новые сверху) |
| POST | `/api/moves` | данные анкеты | `Move` |
| GET | `/api/moves/:id` | — | `MoveDetails` |
| DELETE | `/api/moves/:id` | — | удаляет переезд, вещи и фото |
| POST | `/api/upload` | multipart, 1 фото | `{ photoPath }` |
| POST | `/api/analyze` | `{ moveId, photoPath }` | `Item[]` |
| POST | `/api/items` | `{ moveId, photoPath, category, name }` | `Item` (ручное добавление) |
| PATCH | `/api/items/:id` | частичный `Item` | `Item` |
| DELETE | `/api/items/:id` | — | `204` |
| POST | `/api/estimate` | `{ moveId }` | `EstimateResult` |
| POST | `/api/listings` | `{ itemId }` | `Listing` |
| POST | `/api/checkout` | `{ moveId }` | `{ url }` |
| POST | `/api/stripe/webhook` | событие Stripe | `200` |
| GET | `/auth/callback` | `?code=` от magic link | редирект на `next` или `/move` |

Общие правила: чужой или несуществующий id → `404` (не `403`); ошибка валидации → `400`; превышен лимит → `429`.

## Решения по продукту

### Paywall

- **Бесплатно:** распознавание, редактирование, вердикты **всех** вещей, итоговая сводка (`summary`) и полные цифры **3 вещей** с наибольшей экономией.
- **Платно — $19 разово за переезд** («Unlock full report & listings»): цифры остальных вещей и объявления для Marketplace.
- **Скрытие — на сервере**, не только blur на клиенте: у вещей из `lockedItemIds` сервер отдаёт `shipCost`, `resaleLow`, `resaleHigh`, `replaceCost`, `savings` = 0. Иначе цифры видны в DevTools. Клиент размывает карточки из `lockedItemIds`.
- Оплата проверяется в `POST /api/estimate`, `GET /api/moves/:id` (что скрывать) и `POST /api/listings` (402 без оплаты).
- Объявления доступны для вещей с вердиктом `SELL` и `TOSSUP`.
- Объяснение под вердиктом («Shipping costs more than buying a similar one in Austin») клиент собирает по шаблону из цифр и `toCity`. У скрытых вещей — общая фраза.

### Ручное добавление и удаление вещей

- Если AI пропустил вещь, пользователь добавляет её к **тому же фото**: `POST /api/items` с `photoPath`.
  Размеры, объём и вес берутся из типичных значений категории (`src/data/category-defaults.json`, готовит C).
  `userEdited = true`, `aiConfidence = 1`, `condition = 3`, `sentimental = false`.
- `DELETE /api/items/:id` удаляет вещь; `estimates` и `listings` удаляются каскадом. Фото остаётся (на нём могут быть другие вещи).
- Оценки пересчитываются кнопкой «Calculate» на экране review (`POST /api/estimate`). Если пользователь вернулся с отчёта и что-то поменял, отчёт без повторного Calculate не открывается.

### `sentimental`

- `sentimental = true` → вердикт всегда `SHIP`. Цифры (`shipCost`, `resale*`, `replaceCost`, `savings`) считаются как обычно, чтобы пользователь видел цену решения.
- `savings` такой вещи **не входит** в итоговую экономию.
- В UI бейдж «Keeping — sentimental».

### Лимиты (защита бюджета на AI)

- до **20 фото** на переезд и до **60 вещей** на переезд;
- до **30** вызовов `/api/analyze` на пользователя в час;
- до **20** генераций объявлений на пользователя в час (кэш не считается);
- глобальный стоп-кран: `AI_DAILY_LIMIT` (по умолчанию 500 вызовов Claude в сутки) → дальше `DEMO_FALLBACK` или `503`.
- Счётчики — в таблице `ai_calls` в Postgres, **не в памяти**: на Vercel каждый вызов может попасть в новый инстанс.

## Роли

- **A** — Frontend и демо
- **B** — AI и Backend
- **C** — Pricing / Decision Engine, данные, Stripe, питч

## Кто что поставляет

| Что | Кто | Кому |
|---|---|---|
| `src/data/zips.json` (ZIP → lat, lng, city, state) | C | B (`/api/moves`, город для объявления) |
| `src/data/category-defaults.json` (типичные W/D/H, вес по категории) | C | B (`POST /api/items`) |
| `estimateMove(move, items): Estimate[]` в `src/lib/pricing` — чистая функция, учитывает `sentimental` | C | B (`/api/estimate`) |
| Все API-роуты, схема, RLS, AI-модули | B | A |
| Stripe Checkout (`/api/checkout`), $19, `metadata.moveId`, success_url → `/move/{id}/success` | C | A |
| Экраны, моки по типам выше, `/login` | A | — |
| Stripe webhook | B + C | — |

## Структура репозитория

Весь код — в `src/` (`@/*` → `./src/*`): `src/app`, `src/components`, `src/lib/{ai,db,pricing}`, `src/data`, `src/types.ts`.
В корне: `supabase/migrations`, `tests`, `docs`, `public`.

@AGENTS.md
