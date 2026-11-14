-- Ship-or-Sell: схема и RLS.
-- Источник правды для БД. src/lib/db/schema.ts (Drizzle) повторяет эту схему для типов.
-- Применять: Supabase SQL Editor или `supabase db push`.

create extension if not exists pgcrypto;

-- ───────────────────────── tables ─────────────────────────

create table public.moves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  from_zip     text not null check (from_zip ~ '^[0-9]{5}$'),
  to_zip       text not null check (to_zip ~ '^[0-9]{5}$'),
  distance_mi  real,
  move_type    text not null check (move_type in ('diy_truck', 'container', 'full_service')),
  move_date    date not null,
  status       text not null default 'draft'
               check (status in ('draft', 'analyzing', 'analyzed', 'paid')),
  created_at   timestamptz not null default now()
);
create index moves_user_created_idx on public.moves (user_id, created_at desc);

create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  move_id     uuid not null references public.moves (id) on delete cascade,
  path        text not null unique,               -- {userId}/{moveId}/{uuid}.jpg
  created_at  timestamptz not null default now()
);
create index photos_move_idx on public.photos (move_id);

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  move_id        uuid not null references public.moves (id) on delete cascade,
  photo_path     text not null references public.photos (path) on delete cascade,
  category       text not null check (category in (
                   'sofa','sectional','armchair','bed_frame','mattress','dresser',
                   'nightstand','dining_table','dining_chair','coffee_table','desk',
                   'office_chair','bookshelf','tv_stand','wardrobe','rug','lamp','other')),
  name           text not null,
  brand          text,
  material       text not null,
  condition      smallint not null check (condition between 1 and 5),
  width_in       real not null check (width_in >= 0),
  depth_in       real not null check (depth_in >= 0),
  height_in      real not null check (height_in >= 0),
  volume_cu_ft   real not null check (volume_cu_ft >= 0),
  weight_lb      real not null check (weight_lb >= 0),
  sentimental    boolean not null default false,
  user_edited    boolean not null default false,
  ai_confidence  real not null check (ai_confidence between 0 and 1),
  created_at     timestamptz not null default now()
);
create index items_move_idx on public.items (move_id);
create index items_photo_idx on public.items (photo_path);

create table public.estimates (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null unique references public.items (id) on delete cascade,
  ship_cost     numeric(10,2) not null,
  resale_low    numeric(10,2) not null,
  resale_high   numeric(10,2) not null,
  replace_cost  numeric(10,2) not null,
  verdict       text not null check (verdict in ('SHIP', 'SELL', 'TOSSUP')),
  savings       numeric(10,2) not null,
  confidence    real not null check (confidence between 0 and 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null unique references public.items (id) on delete cascade,
  title        text not null,
  description  text not null,
  price_quick  numeric(10,2) not null,
  price_max    numeric(10,2) not null,
  created_at   timestamptz not null default now()
);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  move_id            uuid not null references public.moves (id) on delete cascade,
  stripe_session_id  text not null unique,         -- идемпотентность webhook
  amount_cents       integer not null,
  created_at         timestamptz not null default now()
);
create index payments_move_idx on public.payments (move_id);

create table public.ai_calls (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('analyze', 'listing')),
  created_at  timestamptz not null default now()
);
create index ai_calls_user_kind_created_idx on public.ai_calls (user_id, kind, created_at);
create index ai_calls_created_idx on public.ai_calls (created_at);   -- суточный глобальный лимит

-- ───────────────────────── helpers ─────────────────────────

-- Владелец переезда. security definer + пустой search_path — стандартный приём Supabase,
-- чтобы политики не делали вложенный RLS-обход и были быстрыми.
create or replace function public.is_move_owner(mid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.moves m where m.id = mid and m.user_id = auth.uid());
$$;

create or replace function public.is_item_owner(iid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.items i join public.moves m on m.id = i.move_id
    where i.id = iid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_item_paid(iid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.items i join public.moves m on m.id = i.move_id
    where i.id = iid and m.user_id = auth.uid() and m.status = 'paid'
  );
$$;

-- Статус "paid" ставит только webhook (service_role). Пользователь не может ни выставить,
-- ни снять его напрямую через PostgREST, и не может создать переезд сразу в "paid".
create or replace function public.guard_move_status()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'draft';
  elsif (new.status = 'paid') is distinct from (old.status = 'paid') then
    raise exception 'status "paid" is managed by the payment webhook' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'user_id is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger moves_guard_status
  before insert or update on public.moves
  for each row execute function public.guard_move_status();

-- Не больше 20 фото на переезд. Блокируем строку move, чтобы параллельные загрузки
-- не проскочили лимит.
create or replace function public.limit_photos_per_move()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.moves where id = new.move_id for update;
  if (select count(*) from public.photos where move_id = new.move_id) >= 20 then
    raise exception 'photo limit reached' using errcode = 'P0429';
  end if;
  return new;
end;
$$;
create trigger photos_limit
  before insert on public.photos
  for each row execute function public.limit_photos_per_move();

-- ───────────────────────── RLS ─────────────────────────

alter table public.moves     enable row level security;
alter table public.photos    enable row level security;
alter table public.items     enable row level security;
alter table public.estimates enable row level security;
alter table public.listings  enable row level security;
alter table public.payments  enable row level security;
alter table public.ai_calls  enable row level security;

-- moves: только свои
create policy moves_select on public.moves for select to authenticated
  using (auth.uid() = user_id);
create policy moves_insert on public.moves for insert to authenticated
  with check (auth.uid() = user_id);
create policy moves_update on public.moves for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy moves_delete on public.moves for delete to authenticated
  using (auth.uid() = user_id);

-- photos, items: через владельца move
create policy photos_all on public.photos for all to authenticated
  using (public.is_move_owner(move_id)) with check (public.is_move_owner(move_id));
create policy items_all on public.items for all to authenticated
  using (public.is_move_owner(move_id)) with check (public.is_move_owner(move_id));

-- estimates, listings: ЧИТАТЬ можно только после оплаты.
-- Иначе пользователь достал бы полные цифры прямым запросом к PostgREST с своим JWT
-- и обошёл бы paywall. Запись и чтение до оплаты — только сервер (service_role)
-- после проверки владельца через пользовательский клиент.
create policy estimates_select_paid on public.estimates for select to authenticated
  using (public.is_item_paid(item_id));
create policy listings_select_paid on public.listings for select to authenticated
  using (public.is_item_paid(item_id));

-- payments: только чтение владельцем; запись — только service_role из webhook
create policy payments_select on public.payments for select to authenticated
  using (public.is_move_owner(move_id));

-- ai_calls: свои, только select и insert
create policy ai_calls_select on public.ai_calls for select to authenticated
  using (auth.uid() = user_id);
create policy ai_calls_insert on public.ai_calls for insert to authenticated
  with check (auth.uid() = user_id);

-- anon не получает ничего: политики выше только для роли authenticated.
