# Home+ — опись дома для страховки ($4,99/мес)

Связано с [finance.md](finance.md): Home+ — единственный **настоящий recurring** в модели (5% пользователей, отток 3%/мес → ~$150 LTV на подписчика).

## 1. Что это для пользователя

После переезда у пользователя уже есть то, что страховые просят и чего почти ни у кого нет: **список вещей с фото, брендом, состоянием, размерами и ценой замены**. NAIC (регулятор страхования США) прямо советует делать такую опись. Home+ превращает отчёт о переезде в постоянную опись дома.

| Функция | Зачем | Что уже есть в коде |
|---|---|---|
| **Опись дома**: все вещи с фото и стоимостью | основа для страховки арендатора или владельца | `items`, фото в private bucket, AI-распознавание |
| **Итог «сколько стоят твои вещи»** + проверка покрытия: «вещей на $18 400, а полис покрывает $15 000» | главный «ага-момент», причина платить | `replaceCost` из `estimateMove` (нужна доработка, см. п. 4) |
| **Экспорт PDF/CSV для страховой** | при краже, пожаре или потопе отправить за 1 минуту | — |
| **Режим «страховой случай»**: отметить пострадавшие вещи → готовый пакет | ради этого люди и держат подписку | — |
| **Добавить новую покупку**: фото → AI → в опись (+ чек и серийный номер) | опись не устаревает | `/api/upload`, `/api/analyze` |
| **Напоминание раз в квартал** «обнови опись» | удержание, меньше оттока | — |
| **Следующий переезд в один клик** | вещи уже в описи, сразу считаем ship/sell | `estimateMove` |

**Где предлагаем:** на `/move/[id]/success` после оплаты Move Pass и внизу отчёта — «Keep this inventory — protect your stuff. 30 days free, then $4.99/mo».

## 2. Что мешает сейчас (в порядке важности)

1. **Анонимный вход.** Пользователь, который почистил куки, теряет всё. Для подписки на месяцы и годы это недопустимо. Решение: при оформлении Home+ превращать анонимного пользователя в постоянного через `supabase.auth.updateUser({ email })`. `user_id` сохраняется, все переезды остаются. Это первый email в продукте: обновить privacy-страницу и правило «email у нас нет» в `CLAUDE.md`.
2. **Вещь привязана к переезду** (`items.move_id NOT NULL`). Опись живёт дольше переезда. Нужна сущность «дом».
3. **Stripe — только разовый платёж.** Нужен режим подписки и обработка её жизненного цикла.
4. **`replaceCost` — это цена «похожей б/у или бюджетной новой вещи»** для решения ship/sell. Страховой нужна **стоимость замены новой** (RCV). Это отдельное поле.

## 3. Как добавить — по слоям

### База: `supabase/migrations/0003_home_plus.sql` (B)

```sql
-- дом = опись; создаётся из переезда или с нуля
create table homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_move_id uuid references moves(id) on delete set null,
  name text not null default 'My home',
  coverage_limit numeric(10,2),          -- лимит полиса, вводит пользователь
  created_at timestamptz not null default now()
);

-- подписка Stripe
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text not null unique,
  status text not null,                   -- trialing | active | past_due | canceled
  current_period_end timestamptz not null,
  updated_at timestamptz not null default now()
);

-- вещь может принадлежать переезду и/или дому
alter table items alter column move_id drop not null;
alter table items add column home_id uuid references homes(id) on delete cascade;
alter table items add constraint items_owner_chk check (move_id is not null or home_id is not null);
alter table items add column purchase_price numeric(10,2);
alter table items add column purchase_date date;
alter table items add column serial_number text;
alter table items add column receipt_path text;   -- фото чека, тот же private bucket
alter table items add column replace_new numeric(10,2); -- RCV для страховой

-- RLS на всё, как везде
alter table homes enable row level security;
alter table subscriptions enable row level security;
create policy homes_owner on homes using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subs_read_own on subscriptions for select using (user_id = auth.uid());
-- items: политика расширяется — владелец через moves ИЛИ через homes
-- subscriptions пишет только webhook (admin-клиент), пользователю — только select
```

⚠️ Это меняет контракт `Item` в `src/types.ts` (`moveId: string | null`, `homeId`). По правилам `CLAUDE.md` — только по согласованию всей команды. Если менять контракт страшно до демо: вместо `home_id` копировать вещи в отдельную таблицу `home_items`. Это дублирование, зато старый код не трогаем.

### Stripe (C)

- В Dashboard: продукт **Home+**, цена $4,99/мес → `STRIPE_HOME_PLUS_PRICE_ID` в `.env.local` и Vercel.
- `POST /api/home-plus/checkout` → `stripe.checkout.sessions.create({ mode: "subscription", line_items: [{ price, quantity: 1 }], subscription_data: { trial_period_days: 30, metadata: { userId } }, metadata: { userId, homeId } })`. Как и сейчас — **никаких email и ZIP в metadata**, Stripe сам спросит email.
- `POST /api/billing/portal` → `stripe.billingPortal.sessions.create(...)`: отмена и смена карты в один клик. Без этого подписке не доверяют.

### Webhook (B + C) — расширить `src/app/api/stripe/webhook/route.ts`

| Событие | Действие |
|---|---|
| `checkout.session.completed` с `mode === "subscription"` | upsert в `subscriptions`; текущая ветка с `moveId` остаётся для Move Pass |
| `customer.subscription.updated` | обновить `status`, `current_period_end` |
| `customer.subscription.deleted` | `status = "canceled"` — **опись не удаляем**, только выключаем платные функции |
| `invoice.payment_failed` | `status = "past_due"` |

### Доступ (B)

`src/lib/homeplus.ts` → `hasHomePlus(supabase, userId)` = `status in ('trialing','active') and current_period_end > now()`. Проверка — **на сервере**, как с paywall переезда.

| Бесплатно (крючок) | Home+ |
|---|---|
| Создать дом из переезда, видеть опись и итог стоимости | экспорт PDF/CSV, страховой случай, проверка покрытия, новые вещи после переезда, чеки и серийники, напоминания |

### API (B)

| Метод | Путь | Что делает |
|---|---|---|
| POST | `/api/homes` | `{ moveId }` → создать дом из переезда (вещи SHIP/TOSSUP + sentimental; проданные — нет) |
| GET | `/api/homes/:id` | опись, сумма `replace_new`, лимит покрытия, разница |
| PATCH | `/api/homes/:id` | `coverage_limit`, `name` |
| POST | `/api/homes/:id/items` | новая вещь (переиспользует upload + analyze) |
| GET | `/api/homes/:id/export?format=pdf\|csv` | 402 без Home+ |
| POST | `/api/homes/:id/claim` | `{ itemIds }` → пакет для страховой (PDF) |

### Цена замены новой (C)

Новая чистая функция рядом с `estimateMove`: `replaceNewCost(item): number` — категория × материал × бренд, **без** скидки на состояние. Можно взять верхнюю границу текущей модели `replaceCost` с коэффициентом. Помечать **[оценка]**: это не оценка страховой.

### Экраны (A)

- Карточка Home+ на `SuccessScreen` и внизу `ReportScreen`.
- `/home/[id]`: большая цифра «Your stuff is worth $18,400», поле «Your policy covers $___» → красная или зелёная плашка, сетка вещей, кнопки Export / Add item / Report a claim.
- Экран привязки email (magic link) перед оплатой Home+.

## 4. Приватность — отдельно и громко

Опись дома с фото и ценами — **карта для вора**. Поэтому:
- адрес не храним вообще, только название дома;
- фото и чеки — private bucket + signed URLs (как сейчас), EXIF/GPS вырезаем;
- экспорт генерируется по запросу и нигде не хранится;
- «Delete my home» удаляет всё, включая файлы;
- в AI уходит только изображение — правило из `CLAUDE.md` не меняется.

## 5. Деньги и лимиты

- AI на новую вещь ≈ $0,03–0,05 → лимит **50 новых фото в месяц** на подписчика (≈ $2 в худшем случае при выручке $4,99).
- Stripe с $4,99: 2,9% + $0,30 = $0,44 → чистыми ≈ $4,55/мес.
- Что мерить после запуска: доля Pass → Home+ (в модели 5% всех пользователей), отток в месяц (в модели 3%), доля экспортов. Экспорт — главный признак пользы.

## 6. План по времени

**До демо (заморозка в 07:00) — не строить подписку.** Реалистично за 1–2 часа:
1. Карточка Home+ на success-экране с «Coming soon — join waitlist» (как Move Pro). Клик пишет событие, это первая метрика спроса. (A)
2. Бесплатный **экспорт описи в CSV** из готового отчёта: жюри видит реальную ценность без новой схемы и Stripe. (A + B)
3. Слайд: «Home+ — recurring слой, $150 LTV, NAIC рекомендует опись». (C)

**После хакатона, ~1–2 недели:**

| Шаг | Кто | Оценка |
|---|---|---|
| Анонимный → постоянный аккаунт (email, magic link) | B | 1–2 дня |
| Миграция 0003 + RLS + типы | B | 1 день |
| Stripe subscription + webhook + portal | C + B | 2 дня |
| API домов + экспорт PDF | B | 2 дня |
| `replaceNewCost` | C | 0,5 дня |
| Экраны `/home`, проверка покрытия, claim | A | 3 дня |
| Напоминания (email раз в квартал, Supabase cron) | B | 0,5 дня |

## Источники

- NAIC — рекомендация делать опись имущества: https://content.naic.org/article/consumer-insight-understanding-your-homeowners-or-renters-policy
- Supabase — перевод анонимного пользователя в постоянного: https://supabase.com/docs/guides/auth/auth-anonymous
- Stripe — подписки через Checkout и Customer Portal: https://docs.stripe.com/billing/subscriptions/build-subscriptions , https://docs.stripe.com/customer-management
