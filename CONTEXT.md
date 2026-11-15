# Ship-or-Sell — общий контекст

> Вставлять в начало каждой новой сессии с AI-ассистентом. Файл `CONTEXT.md` в корне репозитория.
> Подробно для людей (тарифы, финансовая логика, запуск) — [README.md](README.md). Здесь — правила и контракт для тех, кто пишет код.

## Продукт

Веб-приложение для взрослых в США, которые переезжают в другой штат. Прод: https://ship-or-sell.vercel.app.

1. Анкета: откуда и куда (**город или ZIP** с подсказками, `/api/places`), дата, тип переезда (`diy_truck` / `container` / `full_service`).
2. Фото комнат → AI распознаёт каждую вещь (категория, бренд, материал, состояние, размеры, вес).
3. По каждой вещи: сколько стоит **перевезти**, сколько выручишь при **продаже**, сколько стоит **замена** на новом месте → вердикт `SHIP` / `SELL` / `TOSSUP`.
4. **План переезда (Move Money Plan)**: какой грузовик или контейнер нужен, какие вещи продать, чтобы спуститься на ступень ниже, сколько наличных освобождается и когда (до переезда, день переезда, первая неделя, первый месяц). Инвариант: план **никогда не хуже**, чем «везти всё» (`freedCash ≥ 0`).
5. Объявления для Facebook Marketplace для вещей на продажу.
6. Опись дома для страховки из оплаченного переезда (**Home+**).

## Тарифы

| Тариф | Цена | Где в коде |
|---|---|---|
| Free | $0 | вердикты всех вещей, сводка, полные цифры 3 вещей с наибольшей экономией |
| Move Pass | $29 разово за переезд | `UNLOCK_PRICE_CENTS` в `src/lib/stripe.ts` |
| Move Pro | $79 разово (апгрейд с Pass — $50) | `src/lib/tier.ts`; страница `/move/:id/pro` (бюджет по датам, проверка мувера, опись с ценами) |
| Home+ | $4.99/мес, 30 дней бесплатно | `src/lib/homeplus.ts`; страницы `/home`, `/home/:id`; включается флагом `HOME_PLUS_BILLING=true` |

- Тариф переезда (`MoveTier`: `free` / `pass` / `pro`) сервер считает **по сумме оплат** в `payments` (`tierFromPayments`), отдельной колонки нет.
- Цены Stripe создаются прямо в Checkout (`price_data`): продукты и Price ID в Dashboard не нужны.
- Клиентские цены для текста — `PASS_PRICE` / `PRO_PRICE` в `src/client/money.ts`. Меняешь цену — меняй в обоих местах.

## Стек

- **Next.js 16.4.6** (App Router) + TypeScript + Tailwind 4 + shadcn/ui. Перед кодом читай `AGENTS.md` и `node_modules/next/dist/docs/`.
- **Supabase**: Postgres + RLS, **анонимный** Auth (без email и без `/login`), приватный Storage `photos`.
- Drizzle ORM — только типы (`src/lib/db/schema.ts`); источник правды — SQL в `supabase/migrations/`.
- Claude API (`claude-sonnet-5-5`) через `@anthropic-ai/sdk`: распознавание и объявления.
- Stripe 23 (test mode): Checkout (разовые оплаты и подписка), Webhook, Billing Portal.
- Деплой: Vercel, авто-деплой из `main`. Каждая ветка получает Preview.

UI mobile-first, весь текст интерфейса на английском (пользователи — США).

### Подводные камни Next.js 16 (ломали сборку)

- **Не писать** `export const runtime` / `export const dynamic` в роутах: несовместимо с `cacheComponents`, сборка падает.
- `params` в роутах и страницах — `Promise`: `const { id } = await params`.
- Middleware называется `src/proxy.ts` (`export function proxy`), логика сессии — `src/lib/supabase/proxy.ts`.
- Страница, которая использует `useSearchParams`, оборачивается в `<Suspense>`.
- Страницы с данными — client-компоненты, данные — через `src/lib/api-client.ts`.

## Конфиденциальность (обязательно)

- RLS включён на **всех** таблицах; чужое → `404`.
- Фото — private bucket, путь `{userId}/{moveId}/{uuid}.jpg` (опись: `{userId}/homes/{homeId}/…`), только signed URL (TTL 600 с). EXIF/GPS удаляются `sharp` при загрузке.
- Секреты (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — только на сервере, без `NEXT_PUBLIC_`. Ключи никогда не вставлять в чат, терминал, скриншоты и код.
- Service-role клиент (`src/lib/supabase/admin.ts`) — только в webhook, для `estimates`/`listings` (RLS прячет их до оплаты) и глобального лимита AI. И только **после** проверки владельца пользовательским клиентом.
- В логи — только имя роута, код и сообщение (`logError`): без email, фото, ответов AI.
- **Что уходит в AI:**
  - распознавание (`/api/analyze`) — только изображение;
  - объявление (`/api/listings`) — атрибуты вещи, цены из `Estimate`, город отправки и дата;
  - **никогда:** email, имя, userId, ZIP, адрес.
- **Stripe metadata** — только id (`moveId`, `plan`, `userId`, `homeId`). Email Stripe спрашивает сам.
- В описи дома (Home+) адрес и ZIP не храним.

## Контракт данных

- `src/types.ts` — переезд: `Move`, `Item`, `Estimate`, `Listing`, `MoveSummary`, `EstimateResult`, `MoveDetails`, `MovePlan`, `PlanItem`, `MoveTier`, `CheckoutPlan`.
- `src/home-types.ts` — опись: `Home`, `HomeItem`, `HomeDetails`.

Правила:
- **Не менять существующие поля без согласования с командой.** Можно только добавлять (новые поля — необязательные, `?`).
- Скрытие платного — **на сервере**: у вещей из `lockedItemIds` API отдаёт нули в `shipCost`, `resaleLow`, `resaleHigh`, `replaceCost`, `savings`. Клиент только размывает карточки. У неоплаченного плана `items` — без закрытых вещей, `tips` пустые (`applyPlanPaywall` в `src/lib/paywall.ts`).
- Таблица `items` не меняется ради Home+: опись — **копия** вещей в `home_items` (удаление переезда не трогает опись).

## Эндпоинты

| Метод | Путь | Вход | Выход |
|---|---|---|---|
| GET / POST | `/api/moves` | — / анкета (`fromZip`, `toZip`, `moveType`, `moveDate`) | `Move[]` / `Move` |
| GET / DELETE | `/api/moves/:id` | — | `MoveDetails` (+ `plan`, `tier`) / удаляет переезд, вещи, фото |
| POST | `/api/upload` | multipart, 1 фото | `{ photoPath }` |
| POST | `/api/analyze` | `{ moveId, photoPath }` | `Item[]` |
| POST | `/api/items` | `{ moveId, photoPath, category, name }` | `Item` (ручное добавление) |
| PATCH / DELETE | `/api/items/:id` | частичный `Item` | `Item` / `204` |
| POST | `/api/estimate` | `{ moveId }` | `EstimateResult` (+ `plan`) |
| POST | `/api/listings` | `{ itemId }` | `Listing` (402 без оплаты) |
| POST | `/api/checkout` | `{ moveId, plan?: "pass" \| "pro" }` | `{ url }` |
| POST | `/api/stripe/webhook` | событие Stripe | `200` |
| GET | `/api/places?q=` | город или ZIP | `Place[]` (до 8), публичный, кэш 24 ч |
| GET / POST | `/api/homes` | — / `{ moveId }` | `Home[]` / `{ homeId }` (только из оплаченного переезда, идемпотентно) |
| GET / PATCH / DELETE | `/api/homes/:id` | — / `{ name?, coverageLimit? }` | `HomeDetails` / `Home` / `204` (с фото) |
| GET | `/api/homes/:id/export` | — | CSV для страховой (402 без Home+) |
| POST | `/api/home-plus/checkout` | `{ homeId }` | `{ url }` (подписка; 503 без флага) |
| POST | `/api/home-plus/waitlist` | — | `204` |
| POST | `/api/billing/portal` | `{ homeId }` | `{ url }` Stripe Billing Portal |

Общие правила: чужой или несуществующий id → `404` (не `403`); ошибка валидации → `400`; нужна оплата → `402`; уже оплачено → `409`; превышен лимит → `429`; нет ключа или сервиса → `503`. Хелперы: `requireUser`, `parseJson`, `apiError`, `notFound`, `isUuid`, `logError` из `src/lib/http.ts`; `getOwnedMove` / `getOwnedHome`.

## Оплаты и webhook

- Статус `paid` ставит **только webhook** после проверки подписи, не redirect и не страница success. Идемпотентно по `payments.stripe_session_id`.
- Триггер в БД: менять `moves.status` на `paid` и обратно может только `service_role`.
- Подписка Home+: webhook обрабатывает `checkout.session.completed` (mode `subscription`), `customer.subscription.created/updated/deleted`, `invoice.payment_failed` и пишет `subscriptions`. В Stripe 23 `current_period_end` лежит на **subscription items**. Отмена подписки опись **не удаляет**.
- Тестовая карта: `4242 4242 4242 4242`, любая будущая дата, любой CVC.

## Решения по продукту

- **Ручное добавление и удаление:** если AI пропустил вещь, она добавляется к тому же фото; размеры — из `src/data/category-defaults.json`; `userEdited = true`, `aiConfidence = 1`, `condition = 3`. Удаление вещи каскадом удаляет `estimates` и `listings`, фото остаётся.
- Оценки пересчитываются кнопкой **Calculate** (`POST /api/estimate`). После правок отчёт без повторного Calculate не открывается.
- **`sentimental = true`** → вердикт всегда `SHIP`, цифры считаются как обычно, но в итоговую экономию не входят.
- Объявления доступны для `SELL` и `TOSSUP`.
- Опись дома: вещи переезда **кроме** вердикта `SELL` (sentimental — всегда), цена — стоимость **новой** вещи (`replaceNewCost` в `src/lib/pricing/home.ts`).
- **Демо-режим** `DEMO_FALLBACK=true`: если Claude недоступен, `/api/analyze` и `/api/listings` отдают заготовки из `src/data/demo/` (по порядку фото: bed → table → dresser → sofa).

## Лимиты (защита бюджета на AI)

- до 20 фото и 60 вещей на переезд;
- 30 вызовов `/api/analyze` и 20 генераций объявлений на пользователя в час (кэш не считается);
- `AI_DAILY_LIMIT` (по умолчанию 500 вызовов Claude в сутки) на весь сервис → дальше `DEMO_FALLBACK` или `503`.
- Счётчики — в таблице `ai_calls` в Postgres, не в памяти.

## Переменные окружения

| Переменная | Тип | Зачем |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | публичные | клиент Supabase (URL вида `https://<ref>.supabase.co`, не адрес дашборда) |
| `SUPABASE_SERVICE_ROLE_KEY` | секрет | admin-клиент |
| `DATABASE_URL` | секрет | Drizzle (Transaction pooler, порт 6543) |
| `ANTHROPIC_API_KEY` | секрет | Claude |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | секреты | оплаты и webhook |
| `NEXT_PUBLIC_APP_URL` | публичная | базовый URL для redirect из Stripe |
| `AI_DAILY_LIMIT` | настройка | глобальный лимит Claude в сутки |
| `DEMO_FALLBACK` | настройка | заготовленные ответы, если Claude недоступен (на проде `true`) |
| `HOME_PLUS_BILLING` | настройка | `true` — настоящая подписка Home+, иначе waitlist |
| `NEXT_PUBLIC_USE_MOCKS`, `NEXT_PUBLIC_MOCK_FAIL_RATE` | публичные | фронтенд без бэкенда |

В Vercel секреты — тип **Secret**, остальное — **Config**. Переменные Supabase должны быть включены и для **Preview**, иначе превью веток отдают 500.

## Как работаем

- Ветка `feat/...` → PR → зелёная сборка Vercel → Merge. Пуш в `main` = деплой на прод для всей команды.
- Перед пушем: `npm test`, `npm run build` (и `npm run lint`).
- Миграции `supabase/migrations/000N_*.sql` применяются **вручную** в Supabase SQL Editor по порядку. Существующие миграции не меняются — только новый файл.
- Новый npm-пакет — только через `npm i`, чтобы попал в `package.json`.
- Чужой файл (другой роли) меняешь — пиши об этом отдельной строкой в коммите.

## Роли

- **A** — фронтенд и демо
- **B** — AI и бэкенд (API, схема, RLS, AI-модули, webhook)
- **C** — финансовая логика (`src/lib/pricing`), данные (`zips.json`, `category-defaults.json`), Stripe Checkout, питч

## Известные ограничения

- Вход анонимный: если почистить куки, переезды и опись теряются. Перед продакшен-запуском Home+ нужна привязка email (`supabase.auth.updateUser({ email })`, `user_id` сохраняется) и обновление `/privacy`.
- `/privacy` — заглушка.
- Customer Portal Stripe должен быть сохранён в Dashboard (Settings → Billing → Customer portal), иначе «Manage subscription» падает.

## Структура репозитория

Весь код — в `src/` (`@/*` → `./src/*`):

```
src/app/            страницы (App Router) и API (app/api/*)
src/components/     экраны; components/ui — shadcn/ui
src/lib/ai/         Claude: распознавание, объявления, промпты, демо-режим
src/lib/pricing/    index.ts (оценка вещи), plan.ts (план переезда), home.ts (опись)
src/lib/db/         Drizzle-схема, доступ, маппинг
src/lib/            http, paywall, tier, stripe, homeplus, places, zips, ratelimit, storage, supabase/*
src/client/         клиентские утилиты (деньги, ошибки, подписи)
src/data/           zips.json, category-defaults.json, demo/
src/types.ts        контракт переезда
src/home-types.ts   контракт описи
supabase/migrations/  SQL-схема, RLS, Storage
tests/                юнит-тесты (node:test + tsx)
docs/                 метрики, источники данных, сценарий питча
```

@AGENTS.md
