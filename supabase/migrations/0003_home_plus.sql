-- Home+: опись дома для страховки. Применять вручную в Supabase SQL Editor (как 0001/0002).
-- Опись — СНИМОК вещей оплаченного переезда, а не ссылка на items: удаление переезда
-- не трогает опись (source_move_id → null). Адрес и ZIP здесь не храним.

create table public.homes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  source_move_id  uuid references public.moves (id) on delete set null,
  name            text not null default 'My home' check (char_length(name) between 1 and 80),
  coverage_limit  numeric(10,2) check (coverage_limit is null or coverage_limit >= 0),
  created_at      timestamptz not null default now()
);
create index homes_user_idx on public.homes (user_id, created_at desc);
create unique index homes_source_move_uq on public.homes (source_move_id) where source_move_id is not null;

create table public.home_items (
  id              uuid primary key default gen_random_uuid(),
  home_id         uuid not null references public.homes (id) on delete cascade,
  photo_path      text,                                   -- копия фото: {userId}/homes/{homeId}/...
  category        text not null,
  name            text not null check (char_length(name) between 1 and 120),
  brand           text,
  material        text not null,
  condition       smallint not null check (condition between 1 and 5),
  width_in        real not null,
  depth_in        real not null,
  height_in       real not null,
  replace_new     numeric(10,2) not null check (replace_new >= 0),   -- стоимость новой [оценка]
  purchase_price  numeric(10,2) check (purchase_price is null or purchase_price >= 0),
  serial_number   text check (serial_number is null or char_length(serial_number) <= 80),
  created_at      timestamptz not null default now()
);
create index home_items_home_idx on public.home_items (home_id);

create table public.subscriptions (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id      text not null unique,
  stripe_subscription_id  text not null unique,
  status                  text not null check (status in ('trialing','active','past_due','canceled','incomplete','unpaid')),
  current_period_end      timestamptz not null,
  updated_at              timestamptz not null default now()
);

create table public.home_plus_waitlist (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function public.is_home_owner(hid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.homes h where h.id = hid and h.user_id = auth.uid());
$$;

alter table public.homes              enable row level security;
alter table public.home_items         enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.home_plus_waitlist enable row level security;

create policy homes_owner on public.homes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy home_items_owner on public.home_items for all to authenticated
  using (public.is_home_owner(home_id)) with check (public.is_home_owner(home_id));

-- Подписку пишет только webhook (service_role). Пользователь — только читает свою.
create policy subscriptions_read_own on public.subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy waitlist_own on public.home_plus_waitlist for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
