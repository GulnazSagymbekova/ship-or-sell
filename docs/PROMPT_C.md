# Промпт для участника C — Pricing / Decision Engine, данные, Stripe, питч

> Вставь этот текст в начало сессии с AI-ассистентом, после `CLAUDE.md`.
> Это общий промпт на всю работу C. Дальше проси по одной задаче: «сделай `estimateMove`»,
> «сделай `/api/checkout`» и так далее.

---

Ты помогаешь участнику C (Pricing / Decision Engine, данные, Stripe, питч) проекта Ship-or-Sell. Контекст проекта — в `CLAUDE.md` в корне репозитория, контракт данных — в `src/types.ts`. Типы **не меняй**: импортируй из `@/types`.

## Что уже есть

- Репозиторий: `github.com/GulnazSagymbekova/ship-or-sell`, ветка `main`. Каждый push в `main` автоматически деплоится на **https://ship-or-sell.vercel.app**.
- Бэкенд (B) готов и проверен на проде: `/api/moves`, `/api/moves/:id`, `/api/upload`, `/api/items`, `/api/items/:id`, `/api/listings`. `/api/analyze` готов, ждёт ключ Claude.
- **Stripe webhook уже написан B** (`src/app/api/stripe/webhook/route.ts`): на `checkout.session.completed` берёт `moveId` из `session.metadata`, пишет строку в `payments` и ставит переезду `status = "paid"`.
- `/api/estimate` ждёт твою функцию `estimateMove` — это сейчас **главная зависимость всей команды**: без неё нет вердиктов и отчёта.

## Твои задачи (по приоритету)

| # | Что | Кому нужно | Статус |
|---|---|---|---|
| 1 | `estimateMove(move, items)` в `src/lib/pricing/index.ts` | B → `/api/estimate`, весь отчёт | ❌ **срочно** |
| 2 | `POST /api/checkout` | A → кнопка оплаты | ❌ |
| 3 | Stripe: ключи test mode, webhook endpoint | вся оплата | ❌ |
| 4 | `src/data/zips.json` — полный справочник | расстояние и города | ⚠️ сейчас заглушка B на 10 ZIP |
| 5 | `src/data/category-defaults.json` — уточнить | ручное добавление вещей | ⚠️ сейчас заглушка B, рабочая |
| 6 | Питч | жюри | — |

Если не успеваешь с точными формулами — сначала запушь **простую рабочую версию** `estimateMove`, потом улучшай. Контракт важнее точности.

## Важно про версию Next.js

- В проекте **Next.js 16**, не 15. Перед кодом смотри `node_modules/next/dist/docs/` (см. `AGENTS.md`).
- **Не пиши `export const runtime = ...` и `export const dynamic = ...`** в роутах: несовместимо с включённым `cacheComponents`, сборка упадёт. Node.js и так по умолчанию.
- `params` в роутах — Promise: `{ params }: { params: Promise<{ id: string }> }`, затем `await params`.
- Перед каждым push запускай `npm run build`: Vercel собирает так же, и ошибка сборки = сайт не обновится у всей команды.
- Новый npm-пакет → он должен попасть в `package.json` (`npm i <pkg>`), иначе сборка на Vercel упадёт.

## Не трогать

`src/types.ts`, `src/lib/http.ts`, `src/lib/supabase/**`, `src/lib/db/**`, `src/lib/paywall.ts`, `src/proxy.ts`, `src/app/api/**` (кроме своего `src/app/api/checkout/`), `supabase/**`, `CLAUDE.md`.
Если нужно изменение в чужом коде — пиши B.

## Локальный запуск

```powershell
git pull
npm install
npm run dev
```

`.env.local` попроси у B лично. **Ключи никогда не вставляй в чат, в терминал и не показывай на скриншотах.** Свои Stripe-ключи добавляешь в `.env.local` и в Vercel сама.

## Авторизации нет — вход анонимный

Пользователь ничего не вводит: сервер сам создаёт анонимную сессию Supabase. Email у нас **нет** — и в Stripe его не передаём (Stripe сам спросит на своей странице).

---

## 1. `estimateMove` — `src/lib/pricing/index.ts`

```ts
import type { Estimate, Item, Move } from "@/types";

export function estimateMove(move: Move, items: Item[]): Estimate[];
```

### Требования

- **Чистая функция**: без `fetch`, без БД, без `Date.now()`, без `Math.random()`. Одинаковый вход → одинаковый выход. Синхронная.
- Возвращает ровно по одному `Estimate` на каждый `Item` (`itemId = item.id`), в том же порядке.
- Все деньги — в долларах, **округлены до целого**, ≥ 0.
- `confidence` — 0..1 (можно опираться на `item.aiConfidence` и на то, насколько близки варианты).

### Что приходит на вход

- `move.distanceMi` — дорожная дистанция в милях (haversine × 1.2), **может быть `null`** (ZIP нет в справочнике) → возьми разумное значение по умолчанию, например 1000.
- `move.moveType`: `"diy_truck" | "container" | "full_service"` — разная цена перевозки за кубический фут / фунт.
- `item.volumeCuFt`, `item.weightLb`, размеры, `category`, `material`, `brand`, `condition` (1..5), `sentimental`.

### Что считать

| Поле | Смысл |
|---|---|
| `shipCost` | сколько стоит перевезти вещь: доля в стоимости переезда по объёму/весу и дистанции, с учётом `moveType` |
| `resaleLow`, `resaleHigh` | сколько выручишь при продаже: быстро / максимум. Зависит от категории, материала, бренда, состояния. ДСП (particleboard) почти не стоит ничего, массив и известные бренды держат цену |
| `replaceCost` | сколько стоит купить похожую вещь на новом месте (б/у или бюджетную новую) |
| `verdict` | `SHIP` / `SELL` / `TOSSUP` |
| `savings` | сколько денег сберегает рекомендованный вариант (≥ 0) |

### Правила вердикта (согласовано с B — paywall и сводка уже на них завязаны)

Пусть `resaleMid = (resaleLow + resaleHigh) / 2`, `sellNet = replaceCost − resaleMid` (сколько реально потратишь, если продашь здесь и купишь там), `diff = shipCost − sellNet`.

- `diff > порог` → **SELL**, `savings = diff`
- `diff < −порог` → **SHIP**, `savings = −diff`
- иначе → **TOSSUP**, `savings = |diff|`
- порог — например `max(25, 0.1 × shipCost)`; подбери сама.
- **`item.sentimental === true` → вердикт всегда `SHIP`**, но все цифры (`shipCost`, `resale*`, `replaceCost`, `savings`) считаются как обычно, чтобы пользователь видел цену решения.

Почему так: B использует `savings`, чтобы выбрать **3 бесплатные вещи с наибольшей экономией**, а сводка считается так: `totalSavings = Σ savings по SELL без sentimental`, `shipAllCost = Σ shipCost`, `optimalCost = shipAllCost − totalSavings`. Если поменяешь смысл `savings` — предупреди B.

### Тест

Сделай `tests/pricing.test.ts` (или простой скрипт) хотя бы на кейсы: дешёвая вещь из ДСП на 2000 миль → SELL; дорогой массив на 200 миль → SHIP; sentimental → SHIP; `distanceMi = null` не падает; пустой `items` → `[]`.

---

## 2. `POST /api/checkout` — `src/app/api/checkout/route.ts`

`{ moveId }` → `{ url }`

1. Пакет: `npm i stripe` (возможно, B уже поставил — проверь `package.json`).
2. Используй готовые хелперы B:
   ```ts
   import { requireUser, parseJson, apiError, notFound, isUuid, logError } from "@/lib/http";
   import { getOwnedMove } from "@/lib/db/access";
   ```
   - `requireUser()` → `{ supabase, userId }` или готовый 401;
   - `getOwnedMove(supabase, moveId)` → `Move | null` (чужой или несуществующий → `notFound()`).
3. Уже `status === "paid"` → `apiError("conflict", "Already unlocked")`.
4. Stripe Checkout Session:
   - `mode: "payment"`, одна позиция: `price_data` в `usd`, `unit_amount: UNLOCK_PRICE_CENTS` (2900 = $29), `product_data.name: UNLOCK_PRODUCT_NAME` — обе константы в `src/lib/stripe.ts`;
   - **`metadata: { moveId }`** — без этого webhook не узнает, какой переезд оплачен;
   - `success_url`: `${process.env.NEXT_PUBLIC_APP_URL}/move/${moveId}/success?session_id={CHECKOUT_SESSION_ID}`;
   - `cancel_url`: `${process.env.NEXT_PUBLIC_APP_URL}/move/${moveId}`;
   - никаких email, имени, ZIP в метаданных.
5. Ответ: `NextResponse.json({ url: session.url })`.
6. Ключ `STRIPE_SECRET_KEY` — только на сервере, без `NEXT_PUBLIC_`.

После оплаты статус меняет **webhook**, не страница success. Webhook может прийти через пару секунд после редиректа — скажи A, чтобы `/move/{id}/success` опрашивала `GET /api/moves/:id` раз в 1–2 с, пока `move.status !== "paid"` (максимум ~20 с).

---

## 3. Stripe (test mode)

1. [dashboard.stripe.com](https://dashboard.stripe.com) → включи **Test mode**.
2. Developers → API keys → **Secret key** `sk_test_…` → в `.env.local` и в Vercel как `STRIPE_SECRET_KEY` (тип Secret).
3. **Локально** webhook: Stripe CLI
   ```powershell
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```
   CLI покажет `whsec_…` → это `STRIPE_WEBHOOK_SECRET` для `.env.local`.
4. **Прод**: Developers → Webhooks → Add endpoint
   - URL: `https://ship-or-sell.vercel.app/api/stripe/webhook`
   - события: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - его Signing secret `whsec_…` → в Vercel как `STRIPE_WEBHOOK_SECRET` (тип Secret), затем Redeploy.
5. Тестовая карта: `4242 4242 4242 4242`, любая будущая дата, любой CVC.
6. Проверка: после оплаты `GET /api/moves/:id` → `move.status === "paid"`, `lockedItemIds` пустой, `/api/listings` больше не отвечает 402.

---

## 4. `src/data/zips.json`

Формат (сохранить ровно такой, B уже читает его):

```json
{
  "78701": { "lat": 30.2711, "lng": -97.7437, "city": "Austin", "state": "TX" }
}
```

- Ключ — строка из 5 цифр **с ведущими нулями** (`"02108"`, не `2108`).
- Нужен полный (или хотя бы все крупные города) справочник ZIP США. Возьми открытый датасет с подходящей лицензией и укажи источник в `docs/`.
- Если файл большой (>5 МБ) — оставь только нужные поля, без пробелов.
- Ключ `_comment_` из заглушки можно убрать.

## 5. `src/data/category-defaults.json`

Формат (сейчас там рабочая заглушка B, можно уточнить цифры):

```json
{
  "sofa": { "widthIn": 84, "depthIn": 36, "heightIn": 34, "weightLb": 140 }
}
```

Должны быть все 18 категорий из `Category` в `src/types.ts`, включая `"other"`.

## 6. Питч

- Боль: переезд в другой штат, мебель — дорого везти, жалко продавать, непонятно что выгоднее.
- Решение: фото → AI распознаёт вещи → по каждой: везти / продать / решай сама, с цифрами → готовое объявление для Marketplace.
- Монетизация: Move Pass $29 разово за переезд (Pro $79 — «coming soon»), бесплатно — вердикты всех вещей, сводка и полные цифры 3 вещей.
- Конкуренты: только статичные таблицы средних цен, без анализа твоих вещей по фото.
- Демо: на https://ship-or-sell.vercel.app в режиме инкогнито, тестовая карта Stripe.
