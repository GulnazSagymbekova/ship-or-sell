# Промпт для участника A — Frontend и демо

> Вставь этот текст в начало сессии с AI-ассистентом, после `CLAUDE.md`.
> Это общий промпт на всю работу, не на одну страницу. Дальше проси по одному экрану:
> «сделай `/move/new`», «сделай отчёт» и так далее.

---

Ты помогаешь участнику A (Frontend и демо) проекта Ship-or-Sell. Контекст проекта — в `CLAUDE.md` в корне репозитория, контракт данных — в `src/types.ts`. Типы не меняй и не дублируй: импортируй из `@/types`.

## Что уже есть

- Репозиторий: `github.com/GulnazSagymbekova/ship-or-sell`, ветка `main`.
- Каждый push в `main` автоматически деплоится на **https://ship-or-sell.vercel.app**.
- Supabase (БД, Auth, Storage) настроен, бэкенд делает B.

### Статус API

| Эндпоинт | Статус | Что делать на фронте |
|---|---|---|
| `GET/POST /api/moves` | ✅ готово, проверено | реальные вызовы |
| `GET/DELETE /api/moves/:id` | ✅ готово, проверено | реальные вызовы |
| `POST /api/upload` | ✅ готово, проверено | реальные вызовы |
| `POST /api/analyze` | ⏳ B2 | мок, контракт ниже |
| `POST /api/items`, `PATCH/DELETE /api/items/:id` | ⏳ B2 | мок, контракт ниже |
| `POST /api/estimate` | ⏳ B3 | мок, контракт ниже |
| `POST /api/listings` | ⏳ B2 | мок, контракт ниже |
| `POST /api/checkout` | ⏳ C | мок, контракт ниже |

Делай все вызовы через один модуль `src/lib/api-client.ts`, тогда замена мока на реальный вызов — одна строка.

## Важно про версию Next.js

- В проекте **Next.js 16**, не 15. Перед кодом смотри `node_modules/next/dist/docs/` (см. `AGENTS.md`).
- `middleware` в Next 16 называется `proxy` (`src/proxy.ts` уже есть, не трогай).
- `params` в страницах — Promise: `const { id } = await params`. В client-компоненте — `useParams()`.
- **Не пиши `export const runtime = ...` и `export const dynamic = ...`**: они несовместимы с включённым `cacheComponents`, сборка упадёт.
- `cacheComponents` включён: серверный компонент, который читает cookies или данные на запрос, нужно оборачивать в `<Suspense>`. Проще всего: страницы с данными делать client-компонентами (`"use client"`) и ходить в `/api` через `fetch`.
- Перед каждым push запускай `npm run build`: Vercel собирает так же, и ошибка сборки = сайт не обновится.

## Не трогать

`src/types.ts`, `src/lib/**` (кроме своего `src/lib/api-client.ts`), `src/proxy.ts`, `src/app/api/**`, `src/app/auth/**`, `supabase/**`, `CLAUDE.md`.
Если нужно изменение в API или типах — пиши B.

## Локальный запуск

```powershell
npm install
npm run dev
```

Перед запуском создай `.env.local`. Значения попроси у B лично, не в общем чате и не скриншотом.

## Авторизации нет — вход анонимный

- **Страницы `/login` нет и не нужно.** Пользователь ничего не вводит.
- При первом заходе на `/move` или `/move/*` сервер сам создаёт анонимную сессию Supabase и кладёт её в куки. Все переезды привязаны к ней: в том же браузере пользователь видит свои данные, в другом браузере — пустой список.
- Supabase на клиенте **не используй**. Все данные бери через `/api/*`: куки отправляются сами, `fetch` на тот же домен.
- Если пользователь чистит куки, он теряет доступ к своим переездам. Для демо это нормально.

## Общие правила API

Ошибки приходят в виде `{ error: "<code>", message?: string }`.

| Статус | Что делать |
|---|---|
| 400 | показать `message` |
| 401 | «Something went wrong, refresh the page» (бывает только если Supabase не выдал сессию) |
| 402 | показать paywall «Unlock full report & listings — $19» |
| 404 | «Not found» |
| 409 | показать `message` |
| 429 | показать `message` (это лимит) |
| 503 | «Our AI is busy, try again in a minute» |

## Эндпоинты

### ✅ `POST /api/moves`

```json
{ "fromZip": "10001", "toZip": "78701", "moveType": "diy_truck", "moveDate": "2026-12-01" }
```

- `moveType`: `"diy_truck" | "container" | "full_service"`
- `moveDate`: `"YYYY-MM-DD"`
- ZIP — ровно 5 цифр, проверяй и на клиенте.
- → `201 Move`. Пример ответа:

```json
{ "id": "a61b…", "userId": "9a5f…", "fromZip": "10001", "toZip": "78701", "distanceMi": 1815, "moveType": "diy_truck", "moveDate": "2026-12-01", "status": "draft" }
```

### ✅ `GET /api/moves`

→ `Move[]`, новые сверху.

### ✅ `GET /api/moves/:id`

→ `MoveDetails` (см. `src/types.ts`):

- `photoUrls[photoPath]` — signed URL, живёт 10 минут. Если `<img>` выдал `onError`, перезапроси `/api/moves/:id`.
- `lockedItemIds`: у этих вещей цифры = 0, карточку размывай и показывай «Unlock full report — $19». Вердикт у них настоящий — показывай его.
- `summary === null`, пока не было расчёта.
- `listings` пустой, пока не оплачено.
- `fromCity` и `toCity` могут быть `null`, тогда показывай ZIP.

### ✅ `DELETE /api/moves/:id`

→ `204`. Удаляет переезд, вещи и фото.

### ✅ `POST /api/upload`

`multipart/form-data`, поля: `file` (ровно 1 файл), `moveId` → `201 { photoPath }`

- **Обязательно сжимай фото на клиенте** перед отправкой: canvas → JPEG, длинная сторона ≤ 1600px, quality ~0.85. У Vercel лимит тела запроса 4.5 МБ, оригинал с телефона не пройдёт.
- `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`: iPhone тогда сам переведёт HEIC в JPEG.
- Загружай файлы по одному, последовательно, с прогрессом «3 / 7».
- Лимит 20 фото на переезд: на 21-м придёт `429`.

### ⏳ `POST /api/analyze` — мок до готовности B2

`{ moveId, photoPath }` → `Item[]` (вещи, найденные на этом фото).

- Вызывай после каждой загрузки фото. Занимает 5–20 секунд: показывай «Spotting your furniture…».
- `429` — лимит распознаваний в час или 60 вещей на переезд.

### ⏳ `POST /api/items` — ручное добавление (мок)

`{ moveId, photoPath, category, name }` → `Item`. Для случая «AI пропустил вещь на этом фото».

### ⏳ `PATCH /api/items/:id` (мок)

Частичный `Item`: `name`, `category`, `brand`, `material`, `condition`, размеры, `sentimental` → `Item`.
Нельзя менять: `id`, `moveId`, `photoPath`, `aiConfidence`.

### ⏳ `DELETE /api/items/:id` (мок)

→ `204`. Фото остаётся, на нём могут быть другие вещи.

### ⏳ `POST /api/estimate` (мок)

`{ moveId }` → `EstimateResult`: `{ estimates, lockedItemIds, summary }`.

- Кнопка **Calculate** на экране review.
- Если пользователь вернулся с отчёта и что-то поменял, отчёт без повторного Calculate не открывается.

### ⏳ `POST /api/listings` (мок)

`{ itemId }` → `Listing`.

- Только для вердиктов `SELL` и `TOSSUP` и только после оплаты.
- `402` — не оплачено, `409` — вердикт `SHIP`.
- Кнопка **Copy** для title и description: пользователь вставит их в Facebook Marketplace.

### ⏳ `POST /api/checkout` — делает C (мок)

`{ moveId }` → `{ url }`. Делай `location.href = url`. После оплаты Stripe вернёт на `/move/{id}/success`.

## Объяснение под вердиктом

Собирай на клиенте по шаблону из цифр и `toCity`, например:

- SELL: «Shipping costs $X more than buying a similar one in Austin»
- SHIP: «Cheaper to bring it than to replace it in Austin»
- TOSSUP: «About the same either way — your call»
- `sentimental`: бейдж «Keeping — sentimental»
- у вещей из `lockedItemIds`: общая фраза без цифр, например «Unlock to see the numbers»

## Экраны (mobile-first, весь текст на английском)

1. `/` — лендинг с кнопкой **Get started** → `/move/new`
2. `/move` — список переездов, кнопка удаления
3. `/move/new` — анкета: from ZIP, to ZIP, дата, тип переезда → `POST /api/moves` → `/move/{id}`
4. `/move/{id}` — загрузка фото → распознавание → список вещей (review): правка, «Add missed item», удаление, переключатель sentimental, кнопка **Calculate**
5. Отчёт: `summary` вверху (сколько сэкономишь, сколько вещей продать), карточки с вердиктами `SHIP` / `SELL` / `TOSSUP`, размытие `lockedItemIds`, кнопка оплаты, после оплаты — объявления
6. `/move/{id}/success` — после оплаты Stripe: «Payment received» → назад к отчёту (это вместе с C)

## Демо

- Подготовь 4 фото для демо: диван, комод, стол, кровать.
- Перед показом прогони сценарий на https://ship-or-sell.vercel.app в режиме инкогнито — так видно, как его увидит жюри.
