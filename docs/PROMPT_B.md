# Промпт для участника B — AI и Backend (что осталось: B2 и B3)

> Вставь этот текст в начало новой сессии с AI-ассистентом, после `CLAUDE.md`.
> Он заменяет исходные промпты B2 и B3: в них учтено всё, что уже сделано, и все решения,
> принятые по ходу B1.

---

Ты помогаешь участнику B (AI и Backend) проекта Ship-or-Sell. Контекст — в `CLAUDE.md`, контракт данных — в `src/types.ts` (не менять). B1 закончен и проверен. Твоя задача — B2 и B3.

## Окружение

- Next.js **16.4.6** (не 15), Turbopack, `cacheComponents: true`. Перед кодом сверяйся с `node_modules/next/dist/docs/` (см. `AGENTS.md`).
- Прод: https://ship-or-sell.vercel.app, автодеплой из `main` (`github.com/GulnazSagymbekova/ship-or-sell`).
- Supabase-проект `zgttqstlrqaqdvggolxo`, миграции `supabase/migrations/0001_init.sql` и `0002_storage.sql` применены.
- zod **4**.

## Правила Next 16 в этом проекте (проверено на практике)

- **Нельзя** `export const runtime = ...` в роутах: несовместимо с `cacheComponents`, сборка падает. Node.js — и так по умолчанию.
- По той же причине не используй `export const dynamic` / `revalidate`. `export const maxDuration` — сначала проверь `npm run build`; если ругается, задай таймаут в `vercel.json` (`"functions": { "src/app/api/analyze/route.ts": { "maxDuration": 60 } }`).
- `params` — Promise: `{ params }: { params: Promise<{ id: string }> }`, затем `await params`.
- `middleware` → `src/proxy.ts`, функция `proxy`. Proxy **не** обрабатывает `/api/*` (исключено в matcher).
- Перед push — `npm run build`.

## Авторизация: анонимная (решение команды)

- Входа по email нет, страницы `/login` нет. В Supabase включено **Allow anonymous sign-ins**.
- `src/lib/supabase/proxy.ts` на `/move/*` выдаёт анонимную сессию; `requireUser()` в API делает то же, если сессии нет.
- Анонимный пользователь имеет роль `authenticated`, RLS работает как обычно, `auth.uid()` = его id.
- Следствие: часовые лимиты на пользователя обходятся очисткой кук. Бюджет защищает **глобальный** суточный лимит `AI_DAILY_LIMIT` — он обязателен.

## Что уже есть — используй, не переписывай

| Файл | Что там |
|---|---|
| `src/lib/http.ts` | `requireUser()` → `{ supabase, userId }` или готовый 401; `parseJson(req, zodSchema)` → 400; `apiError(code, message?)`; `notFound()`; `isUuid()`; `logError(route, err)` — пишет только код и сообщение |
| `src/lib/supabase/server.ts` | пользовательский клиент (RLS) |
| `src/lib/supabase/admin.ts` | service-role клиент (обходит RLS) |
| `src/lib/db/mappers.ts` | `toMove`, `toItem`, `itemToRow`, `toEstimate`, `estimateToRow`, `toListing` + `*_COLUMNS` |
| `src/lib/db/estimates.ts` | `loadEstimates(itemIds)`, `loadListings(itemIds)` через admin |
| `src/lib/paywall.ts` | `applyPaywall(move, estimates, items)` → `{ estimates, lockedItemIds, summary }`; `computeSummary` |
| `src/lib/storage.ts` | `PHOTO_BUCKET`, `isPhotoPathOf(path, userId, moveId)`, `getSignedPhotoUrl(s)` |
| `src/lib/zips.ts` | `cityForZip(zip)`, `distanceMiBetween()` |
| `src/lib/db/schema.ts` | Drizzle-схема (только типы; источник правды — SQL-миграции) |
| `src/app/api/moves/**`, `src/app/api/upload` | готовые роуты, образец стиля |

### Ключевые решения по БД (важно для B2/B3)

- **estimates и listings**: RLS разрешает пользователю только `select` и **только после оплаты**. Иначе полные цифры можно достать прямым запросом к PostgREST и обойти paywall. Поэтому **запись и чтение estimates/listings — через admin-клиент**, но **только после** проверки владельца move через пользовательский клиент (`select ... eq("id", moveId)` → нет строки → 404).
- **moves.status**: триггер `guard_move_status` запрещает пользователю ставить или снимать `paid`. Значит:
  - при `analyzing`/`analyzed` **не трогай** статус, если он уже `paid` (иначе триггер бросит ошибку 42501);
  - `paid` ставит только webhook через admin-клиент.
- **photos**: `items.photo_path` — внешний ключ на `photos.path`. Вставить item с несуществующим photoPath нельзя: проверка существования фото уже есть на уровне БД.
- **ai_calls**: RLS — `select`/`insert` только своих строк. Для **глобального** суточного счётчика нужен admin-клиент (`count` по `created_at > now() - 1 day`) или security-definer функция в новой миграции `0003_*.sql`.
- Новые изменения схемы — новыми файлами `supabase/migrations/000N_*.sql`, применять в SQL Editor. Старые миграции не править.

## B2 · распознавание и объявления

Модель `claude-sonnet-5-5`, пакет `@anthropic-ai/sdk` (`npm i @anthropic-ai/sdk`), ключ `ANTHROPIC_API_KEY` (в `.env.local` и в Vercel как Secret).

1. **`src/lib/ai/prompts.ts`** — `VISION_PROMPT` и `LISTING_PROMPT`, текст ниже, без изменений.
2. **`src/lib/ai/vision.ts`**: `analyzePhoto(imageBase64)` → массив вещей без `id/moveId/photoPath/sentimental/userEdited`.
   - tool use с `tool_choice: { type: "tool", name: "report_items" }`, JSON-схема только с полями, которые определяет AI: `category` (enum из `Category`), `name`, `brand` (string|null), `material`, `condition` (1–5), `widthIn`, `depthIn`, `heightIn`, `volumeCuFt`, `weightLb`, `aiConfidence` (0..1).
   - Валидация через zod; при невалидном ответе — один повтор.
   - Таймаут 25 с.
   - В запрос — **только изображение**. Никаких email, userId, ZIP, путей.
3. **`src/lib/ratelimit.ts`**: `checkAndRecord(userId, kind)`.
   - Часовой лимит на пользователя: `analyze` ≤ 30, `listing` ≤ 20 (своими строками `ai_calls` через пользовательский клиент).
   - Глобальный суточный: всего вызовов Claude ≤ `AI_DAILY_LIMIT` (по умолчанию 500), через admin или SQL-функцию.
   - Запись в `ai_calls` — **до** вызова Claude. Без in-memory счётчиков.
   - Превышение часового → 429. Суточного → `DEMO_FALLBACK` (если `true`) или 503.
4. **`POST /api/analyze`** `{ moveId, photoPath }` → `Item[]`
   - `requireUser`, zod, move через пользовательский клиент (нет → 404).
   - `isPhotoPathOf(photoPath, userId, moveId)` и строка в `photos` с этим path → иначе 404.
   - Лимиты (п. 3). Если в move уже 60 вещей → 429.
   - Статус `analyzing` на время вызова (если не `paid`), после — `draft` или прежний.
   - Скачать фото из Storage пользовательским клиентом (`storage.from(PHOTO_BUCKET).download(path)`), base64, `analyzePhoto`.
   - Сохранить вещи: `photoPath`, `sentimental=false`, `userEdited=false`; не больше чем до 60 на move — лишние отбросить и вернуть 429, если отброшено что-то.
   - Ответ — сохранённые `Item[]` (`toItem`).
5. **`PATCH /api/items/:id`**: zod partial, `userEdited = true`. Запрещено менять `id`, `moveId`, `photoPath`, `aiConfidence` (`.strict()` схема без этих полей). Чужой id → 404.
6. **`POST /api/items`** `{ moveId, photoPath, category, name }` → `Item`.
   - Размеры и вес из `src/data/category-defaults.json` (готовит C; пока его нет — сделай заглушку с типичными значениями для всех 18 категорий в формате `{ "<category>": { "widthIn", "depthIn", "heightIn", "weightLb" } }` и предупреди C).
   - `volumeCuFt = W×D×H/1728×1.1`, `condition = 3`, `aiConfidence = 1`, `userEdited = true`, `sentimental = false`.
   - Лимит 60 вещей на move → 429.
7. **`DELETE /api/items/:id`** → 204. Estimate и listing удаляются каскадом, фото остаётся.
8. **`src/lib/ai/listing.ts`**: `generateListing(item, estimate, fromCity, moveDate)` → `Listing`, tool use, `LISTING_PROMPT`.
   - В AI уходят только: category, name, brand, material, condition, размеры, цены из Estimate, **название** города отправки (`cityForZip`) и дата переезда. Никогда — ZIP, userId, email.
   - `priceQuick = resaleLow`, `priceMax = resaleHigh`, округление до $5.
9. **`POST /api/listings`** `{ itemId }` → `Listing`
   - item через пользовательский клиент (нет → 404), move → `status !== "paid"` → 402.
   - estimate через admin; нет оценки → 409; verdict не `SELL`/`TOSSUP` → 409.
   - Кэш: если listing уже есть (admin) — вернуть, лимит не тратить.
   - Иначе лимит `listing`, генерация, сохранение через admin (upsert по `item_id`).
10. **`DEMO_FALLBACK=true`**: если Claude недоступен или исчерпан суточный лимит — отдавать сохранённые ответы из `src/data/demo/*.json`.

### Продуктовые промпты — `src/lib/ai/prompts.ts`

```ts
export const VISION_PROMPT = `You are a furniture appraiser helping someone plan an interstate move in the US.
Identify every distinct piece of furniture or large household item in the photo
(ignore small decor, clothes, people, pets, documents).

For each item return:
- category: one of the allowed enum values; use "other" if nothing fits
- name: short buyer-friendly name, e.g. "3-seat grey fabric sofa"
- brand: only if clearly identifiable from design or visible label (e.g. IKEA KALLAX), else null
- material: main material, e.g. "solid oak", "particleboard", "leather", "fabric"
- condition: 1 = broken/heavily worn, 3 = normal signs of use, 5 = like new
- widthIn, depthIn, heightIn: estimated dimensions in inches, using typical sizes for the
  category and visible reference objects (doors ~80in tall, outlets ~12in above floor)
- volumeCuFt: packed volume in cubic feet (≈ W×D×H / 1728, add 10% for padding)
- weightLb: estimated weight in pounds based on material and size
- aiConfidence: 0..1, lower it if the item is partially hidden, blurry or ambiguous

Be realistic, not generous. Particleboard furniture is light and has low resale value;
solid wood and known brands hold value. Never invent items that are not visible.`;

export const LISTING_PROMPT = `Write a Facebook Marketplace listing for a used furniture item.
The seller is moving out of state and wants a fast, local pickup sale.

Rules:
- title: max 70 characters, starts with the item type, includes brand if known and a key
  feature (color, size, material). No emojis, no ALL CAPS.
- description: 4–6 short lines in plain American English:
  1) what it is + brand/material, 2) dimensions (W x D x H in inches),
  3) honest condition, 4) "Moving out of state — must go by <date>",
  5) pickup only in <city>, buyer brings help to carry if heavy,
  6) "Message me if it's still listed — it's available."
- Be honest about wear; never claim "like new" unless condition is 5.
- Do not include phone numbers, emails, exact addresses or the seller's name.`;
```

## B3 · интеграция и устойчивость

1. **`POST /api/estimate`** `{ moveId }` → `EstimateResult`
   - move и items — пользовательским клиентом (нет move → 404; нет вещей → 409).
   - `estimateMove(move, items)` из `src/lib/pricing` (делает C; чистая функция, правило sentimental → SHIP внутри).
   - Сохранить **полные** цифры: upsert в `estimates` по `item_id` через **admin** (`estimateToRow`).
   - Статус → `analyzed`, но **не понижать** `paid`.
   - Ответ — `applyPaywall(move, estimates, items)` (уже готов в `src/lib/paywall.ts`).
2. **`DELETE /api/moves/:id`** — ✅ уже готов (B1).
3. **Stripe webhook** (вместе с C) — `src/app/api/stripe/webhook/route.ts`:
   - тело — `await req.text()` (сырое, для подписи), проверка подписи `STRIPE_WEBHOOK_SECRET`;
   - на `checkout.session.completed`: `moveId` из `session.metadata`; insert в `payments` (`stripe_session_id` unique → повтор = уже обработано, ответить 200); `moves.status = "paid"`;
   - всё через admin-клиент (сессии пользователя нет). Без `export const runtime`.
4. Проверить лимиты: 31-й `/api/analyze` за час → 429.
5. Пройти все роуты: везде `requireUser`, везде zod, admin только где описано выше, чужой moveId / itemId / photoPath → 404, `/api/listings` без оплаты → 402.
6. Собрать 4 демо-фото (диван, комод, стол, кровать), прогнать через `/api/analyze`, сохранить ответы в `src/data/demo/` для `DEMO_FALLBACK`.

## От кого что ждём

| Что | Кто | Статус |
|---|---|---|
| `src/data/zips.json` | C | сейчас заглушка на 10 ZIP от B, C заменяет полным справочником |
| `src/data/category-defaults.json` | C | нужен для `POST /api/items`; до этого — заглушка от B |
| `estimateMove(move, items)` в `src/lib/pricing` | C | нужен для B3.1 |
| `/api/checkout` | C | — |

## Открытые хвосты

- **Secret key Supabase засветился на скриншоте** → создать новый secret key, обновить `.env.local` и Vercel, старый удалить.
- `DATABASE_URL` в `.env.local` — ещё пример, заполнить из Supabase → Connect → Transaction pooler. Роутами не используется.
- В Vercel `NEXT_PUBLIC_SUPABASE_URL` должен быть `https://zgttqstlrqaqdvggolxo.supabase.co` (тип Config), затем Redeploy.
- В 401 из `requireUser` сейчас уходит текст ошибки Supabase (для отладки). Перед демо можно убрать.
