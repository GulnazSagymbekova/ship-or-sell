# Промпт: Home+ (опись дома для страховки) — реализация

> Вставь весь этот файл в новую сессию с AI-ассистентом (Claude Code / Cursor), открытую в корне репозитория.
> Ассистент сам прочитает `CLAUDE.md`, `AGENTS.md`, `docs/HOME_PLUS.md` и код.
> Работа идёт **двумя этапами**. После каждого этапа — `npm run build`, `npm test`, коммит, push.

---

Ты реализуешь функцию **Home+** в проекте Ship-or-Sell. Сначала прочитай:
1. `CLAUDE.md` — продукт, контракт данных, приватность, роли;
2. `AGENTS.md` — Next.js 16, читай `node_modules/next/dist/docs/` перед кодом;
3. `docs/HOME_PLUS.md` — продуктовое описание Home+ (что и зачем);
4. код, который будешь переиспользовать: `src/lib/http.ts`, `src/lib/db/access.ts`, `src/lib/storage.ts`, `src/lib/stripe.ts`, `src/lib/paywall.ts`, `src/lib/pricing/index.ts`, `src/app/api/checkout/route.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/supabase/proxy.ts`, `supabase/migrations/0001_init.sql`, `0002_storage.sql`, `src/components/SuccessScreen.tsx`, `src/components/ReportScreen.tsx`.

Прежде чем писать код, кратко перескажи мне план по файлам. Потом делай.

## Что такое Home+

После оплаченного переезда (Move Pass) пользователь сохраняет вещи, которые везёт, как **опись дома для страховки**: фото, бренд, состояние, стоимость замены. Видит итог «Your stuff is worth $18,400» и сравнивает его с лимитом своего полиса.

**Home+ ($4,99/мес, 30 дней бесплатно)** открывает: экспорт описи в CSV для страховой, проверку покрытия, добавление новых вещей.

## Жёсткие правила (нарушать нельзя)

- **Next.js 16**: `params` — Promise (`await params`); **не пиши** `export const runtime` / `export const dynamic` (несовместимо с `cacheComponents`, сборка упадёт); страницы с данными — client-компоненты (`"use client"`), данные — через `fetch('/api/...')`.
- **Не меняй** `src/types.ts`, `supabase/migrations/0001_*`, `0002_*`. Новые типы — в новом файле `src/home-types.ts`. Схема — **только новым файлом** `supabase/migrations/0003_home_plus.sql`.
- **Не меняй таблицу `items`.** Опись — отдельные таблицы: копия вещей переезда (снимок), а не ссылка. Иначе удаление переезда снесёт опись, и сломается контракт команды.
- **RLS на каждой новой таблице.** Скрытие платного — **на сервере**, не только на клиенте.
- **Приватность** (из `CLAUDE.md`): адрес и ZIP в описи не храним; фото — только private bucket и signed URLs; в Stripe metadata — только id, никаких email, имён, ZIP; в логи — ни email, ни фото.
- Используй готовые хелперы: `requireUser`, `parseJson`, `apiError`, `notFound`, `isUuid`, `logError` из `@/lib/http`; `getOwnedMove` из `@/lib/db/access`; `getStripe` из `@/lib/stripe` (возвращает `null`, если ключа нет → `apiError("unavailable")`).
- Чужой или несуществующий id → `404`; ошибка валидации → `400`; нет Home+ → `402`.
- Весь текст интерфейса — на английском, mobile-first, компоненты из `src/components/ui`.
- Новый npm-пакет — только через `npm i` (чтобы попал в `package.json`). Для этапов 1–2 пакеты не нужны.
- Ключи никогда не выводи в чат, терминал или код.
- Перед каждым push: `npm run build` и `npm test` зелёные. Push в `main` = деплой на прод для всей команды.

---

## ЭТАП 1 — опись дома без оплаты (безопасно пушить в `main`)

Цель: функция работает и видна на демо, оплаты пока нет. Платные возможности показаны с кнопкой **«Start free trial — coming soon»** (как Move Pro в `Paywall.tsx`).

### 1.1 Миграция `supabase/migrations/0003_home_plus.sql`

```sql
create table public.homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_move_id uuid references public.moves(id) on delete set null,
  name text not null default 'My home' check (char_length(name) between 1 and 80),
  coverage_limit numeric(10,2) check (coverage_limit is null or coverage_limit >= 0),
  created_at timestamptz not null default now()
);
create index homes_user_idx on public.homes(user_id, created_at desc);

create table public.home_items (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes(id) on delete cascade,
  photo_path text,                         -- копия фото в {userId}/homes/{homeId}/...
  category text not null,
  name text not null check (char_length(name) between 1 and 120),
  brand text,
  material text not null,
  condition smallint not null check (condition between 1 and 5),
  width_in real not null, depth_in real not null, height_in real not null,
  replace_new numeric(10,2) not null check (replace_new >= 0),  -- стоимость замены новой [оценка]
  purchase_price numeric(10,2),
  serial_number text check (serial_number is null or char_length(serial_number) <= 80),
  created_at timestamptz not null default now()
);
create index home_items_home_idx on public.home_items(home_id);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text not null unique,
  status text not null check (status in ('trialing','active','past_due','canceled','incomplete','unpaid')),
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.home_plus_waitlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.homes enable row level security;
alter table public.home_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.home_plus_waitlist enable row level security;

create policy homes_owner on public.homes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.is_home_owner(h uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.homes where id = h and user_id = auth.uid()) $$;

create policy home_items_owner on public.home_items for all to authenticated
  using (public.is_home_owner(home_id)) with check (public.is_home_owner(home_id));

-- подписку пишет только webhook (service_role); пользователь — только читает свою
create policy subscriptions_read_own on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy waitlist_own on public.home_plus_waitlist for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Сверь стиль с `0001_init.sql` (там уже есть `is_move_owner` — сделай `is_home_owner` так же). Применять миграцию — **вручную в Supabase SQL Editor** (так принято в команде, см. `docs/PROMPT_B.md`). Скажи мне, когда нужно её применить.

Добавь таблицы в `src/lib/db/schema.ts` (Drizzle — только для типов, SQL — источник правды).

### 1.2 Типы — `src/home-types.ts`

```ts
import type { Category } from "@/types";

export interface Home {
  id: string; name: string; sourceMoveId: string | null;
  coverageLimit: number | null; createdAt: string;
}
export interface HomeItem {
  id: string; homeId: string; photoPath: string | null;
  category: Category; name: string; brand: string | null; material: string;
  condition: 1 | 2 | 3 | 4 | 5; widthIn: number; depthIn: number; heightIn: number;
  replaceNew: number; purchasePrice: number | null; serialNumber: string | null;
}
export interface HomeDetails {
  home: Home;
  items: HomeItem[];
  photoUrls: Record<string, string>;   // signed URL, TTL 600 с
  totalValue: number;                  // Σ replaceNew
  coverageGap: number | null;          // totalValue − coverageLimit; null, если лимит не задан
  homePlus: { active: boolean; status: string | null; billingEnabled: boolean };
}
```

### 1.3 Стоимость замены новой — `src/lib/pricing/home.ts` (чистая функция + тест)

`replaceNewCost(item: Item, estimate: Estimate): number`. Для страховой нужна цена **новой** вещи. В `estimateMove` `replaceCost` — это «похожая б/у или бюджетная новая». Прочитай, как считается `replaceCost` в `src/lib/pricing/index.ts`, и посчитай ту же вещь **без скидки за состояние и без поправки на б/у**. Если так не получается чисто — `Math.round(estimate.replaceCost * 1.3)` с комментарием `[допущение]`. Результат — целые доллары, ≥ 0, детерминированно.

Ещё две чистые функции: `homeTotals(items, coverageLimit) → { totalValue, coverageGap }` и `homeItemsToCsv(items): string`. CSV: заголовки `Item,Category,Brand,Material,Condition,Width in,Depth in,Height in,Replacement value (USD),Purchase price (USD),Serial number`. Экранируй кавычки и запятые. В CSV **нет** фото-ссылок, адреса и id. Перед строками — строка `"Ship-or-Sell home inventory, generated YYYY-MM-DD. Values are estimates, not an appraisal."`.

Тесты — `tests/home.test.ts` (запуск: `npm test`, это `tsx --test`): CSV с запятой и кавычкой в названии; пустая опись → только заголовки; `coverageGap` при `null`-лимите → `null`; `replaceNewCost ≥ replaceCost`.

### 1.4 Доступ — `src/lib/homeplus.ts`

- `HOME_PLUS_BILLING_ENABLED = process.env.HOME_PLUS_BILLING === "true"` (только на сервере).
- `hasHomePlus(supabase, userId): Promise<boolean>` — строка в `subscriptions` со `status in ('trialing','active')` и `current_period_end > now()`.
- `getOwnedHome(supabase, homeId)` — по образцу `getOwnedMove`.

### 1.5 API

| Метод | Путь | Логика |
|---|---|---|
| POST | `/api/homes` | `{ moveId }`. Переезд свой, иначе 404. `status === "paid"`, иначе 402 (опись — бонус к оплаченному отчёту). Если дом из этого переезда уже есть → вернуть его (идемпотентно). Иначе: создать `homes`; для вещей переезда, **кроме вердикта SELL** (sentimental — всегда), создать `home_items` с `replace_new = replaceNewCost(...)`. Фото **скопировать** в Storage: `{userId}/homes/{homeId}/{имя файла}` (`storage.from(PHOTO_BUCKET).copy`) — первая папка = userId, иначе не пустит RLS bucket. Одно фото может быть у нескольких вещей — копируй один раз. Оценки читай сервером (RLS на `estimates` до оплаты закрыт — посмотри, как это сделано в `/api/moves/[id]`). → `{ homeId }` |
| GET | `/api/homes` | мои дома → `Home[]` |
| GET | `/api/homes/:id` | `HomeDetails` |
| PATCH | `/api/homes/:id` | `{ name?, coverageLimit? }` (zod, `coverageLimit` 0…10 000 000 или null) |
| DELETE | `/api/homes/:id` | удалить дом, вещи **и файлы** `{userId}/homes/{homeId}/*` |
| GET | `/api/homes/:id/export` | без Home+ → `402`. С Home+ → CSV, заголовки `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="home-inventory.csv"`, `Cache-Control: no-store` |
| POST | `/api/home-plus/waitlist` | записать в `home_plus_waitlist` (upsert) → `204` |

**Проверка покрытия** (`coverageGap`) отдаётся всем: это крючок. Платные — экспорт (этап 1) и добавление новых вещей (этап 2).

### 1.6 Сессия на `/home`

Анонимная сессия сейчас создаётся только на `/move/*` (`src/lib/supabase/proxy.ts`, `needsSession`). Добавь туда `/home` и `/home/*` — одна строка. Это чужой файл (B): напиши в коммите отдельной строкой, что поменял.

### 1.7 Экраны (A-часть)

- **`SuccessScreen`** (после оплаты) и низ **`ReportScreen`** при `status === "paid"`: карточка **«Keep this as your home inventory»**. Текст: «Insurers ask for a list of your belongings after theft or damage. Save the items you're shipping — free.» Кнопка `Save home inventory` → `POST /api/homes` → переход на `/home/{id}`.
- **`/home`** — список домов. **`/home/[id]`**:
  - крупно: `Your stuff is worth $18,400`, подпись `Estimated replacement value — not an appraisal`;
  - поле `Your policy covers $___` → зелёная плашка «You're covered» или красная «You may be underinsured by $3,400»; маленькая ссылка-источник: NAIC recommends keeping a home inventory (https://content.naic.org/article/consumer-insight-understanding-your-homeowners-or-renters-policy);
  - сетка вещей с фото и ценой;
  - блок **Home+**: `Export for your insurer (CSV)`, `Add new purchases`, `Quarterly reminders` — **$4.99/mo, 30 days free**. Пока `billingEnabled === false`: кнопка `Join the waitlist` → `/api/home-plus/waitlist` → «You're on the list».
  - внизу `Delete this inventory` (alert-dialog, как `DeleteMoveButton`).
- Состояния загрузки, ошибки и пустое — готовые `LoadingState`, `ErrorState`, `EmptyState`.

### 1.8 Сдача этапа 1

1. `npm run lint`, `npm test`, `npm run build` — без ошибок.
2. Применить `0003_home_plus.sql` в Supabase SQL Editor.
3. Проверить руками в инкогнито: переезд → тестовая оплата `4242 4242 4242 4242` → Save home inventory → `/home/{id}` показывает сумму и вещи → лимит меняет плашку → экспорт отвечает 402 → waitlist работает → удаление чистит фото. Второй браузер не видит чужой дом (404).
4. Коммит `feat(home+): home inventory from paid move, coverage check, waitlist` → push в `main`.

---

## ЭТАП 2 — подписка Stripe (в `main` — только после демо или под флагом)

Весь код этапа 2 работает только при `HOME_PLUS_BILLING=true`. Без флага поведение — как в этапе 1, поэтому пушить безопасно. **До заморозки демо флаг на проде не включать.**

### 2.1 Аккаунт с email

Подписка длится месяцами, анонимная сессия теряется вместе с куками. Перед оплатой Home+ пользователь привязывает email:
- `POST /api/account/link-email` `{ email }` (zod email) → на сервере `supabase.auth.updateUser({ email }, { emailRedirectTo: `${appUrl}/auth/callback?next=/home/${homeId}` })`. `user_id` не меняется, все переезды остаются.
- UI: шаг «Save your inventory to your email» → «Check your inbox».
- `/api/home-plus/checkout` для анонимного пользователя (`user.is_anonymous`) отвечает `409` `link_email_required`.
- Сделай на `/auth/callback` фолбэк вместо несуществующего `/login` (например, `/home`) — это файл B, отметь в коммите.
- Настройки Supabase (скажи мне сделать вручную): Authentication → Providers → Email включён; URL Configuration → Redirect URLs: `https://ship-or-sell.vercel.app/auth/callback` и `http://localhost:3000/auth/callback`.
- Обнови `src/app/privacy/page.tsx`: email храним только для входа и подписки Home+.

### 2.2 Stripe

- Я создам в Stripe (test mode) продукт **Home+** с ценой $4,99/мес и пришлю `STRIPE_HOME_PLUS_PRICE_ID`. Скажи, куда добавить (`.env.local`, Vercel), но значения в код не вписывай.
- `POST /api/home-plus/checkout` `{ homeId }` → `stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price: STRIPE_HOME_PLUS_PRICE_ID, quantity: 1 }], subscription_data: { trial_period_days: 30, metadata: { userId } }, metadata: { userId, homeId }, client_reference_id: userId, success_url: `${appUrl}/home/${homeId}?subscribed=1`, cancel_url: `${appUrl}/home/${homeId}` })` → `{ url }`. Уже активна → `409`.
- `POST /api/billing/portal` → `stripe.billingPortal.sessions.create({ customer, return_url })` → `{ url }`. Кнопка `Manage subscription` на `/home/[id]`. В Stripe Dashboard включить Customer Portal (отмена, смена карты).

### 2.3 Webhook — расширить `src/app/api/stripe/webhook/route.ts`

Текущую ветку Move Pass (`metadata.moveId`) **не ломай**: сначала смотри на `session.mode`.

| Событие | Действие (admin-клиент, upsert по `user_id`) |
|---|---|
| `checkout.session.completed`, `mode === "subscription"` | достать подписку `stripe.subscriptions.retrieve(session.subscription)` → upsert `subscriptions` (`userId` из metadata) |
| `customer.subscription.created` / `updated` | upsert `status`, `current_period_end` (`userId` из `subscription.metadata`) |
| `customer.subscription.deleted` | `status = 'canceled'`. **Опись не удаляем** |
| `invoice.payment_failed` | `status = 'past_due'` |

Webhook идемпотентен (повтор события ничего не ломает). Неизвестное событие → `200`. Добавь эти события в Stripe Dashboard → Webhooks (прод-эндпоинт) и в `stripe listen` локально. Где у Stripe 23 лежит `current_period_end` (в объекте подписки или в её items) — **проверь по типам установленного пакета**, не угадывай.

### 2.4 Новые вещи (платно)

`POST /api/homes/:id/items` — фото → переиспользуй загрузку (`/api/upload`-логику, EXIF-очистку через `sharp`) и распознавание (`src/lib/ai/vision.ts`) с путём `{userId}/homes/{homeId}/...`. Без Home+ → `402`. Лимит — **50 фото в месяц на пользователя**, через тот же механизм `ai_calls` / `checkAndRecord` (`src/lib/ratelimit.ts`); если для этого нужен новый `AiKind`, согласуй с B. `replaceNew` для новой вещи: AI-атрибуты → `estimateMove`-логика → `replaceNewCost`.

### 2.5 Сдача этапа 2

1. lint, test, build зелёные.
2. Локально с `stripe listen`: оплата Home+ тестовой картой → `subscriptions.status = 'trialing'` → экспорт CSV скачивается → в Portal отменить → `canceled` → экспорт снова `402`, опись на месте.
3. Коммит `feat(home+): Stripe subscription, email linking, billing portal` → push. Флаг `HOME_PLUS_BILLING=true` в Vercel — **только после демо** и после проверки на проде.

---

## В конце каждого этапа пришли мне

- список изменённых и новых файлов;
- что сделать руками (SQL, Supabase, Stripe, Vercel env);
- что поменял в чужих файлах (`proxy.ts`, webhook, `auth/callback`) — чтобы я предупредил B;
- что не успел или в чём не уверен.
