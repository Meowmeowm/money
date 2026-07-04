-- Monica's Money · Supabase 建表脚本
-- 在 Supabase Dashboard → SQL Editor 里整段执行一次即可。
-- 单人使用：所有表带 user_id（默认 auth.uid()）+ RLS，只有本人能读写。
-- 说明：表间不建外键，方便离线队列按任意顺序补同步。

create table if not exists transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  date date not null,
  type text not null check (type in ('expense','income')),
  amount_cny numeric(12,2) not null,          -- 统一人民币金额（净额，退款后更新）
  original_amount numeric(12,2),              -- 外币原金额
  currency text not null default 'CNY',
  fx_rate numeric(10,4),
  category text not null,
  subcategory text,
  note text not null default '',
  trip_id uuid,
  refund_status text not null default 'none' check (refund_status in ('none','partial','full')),
  refund_amount numeric(12,2) not null default 0,
  template_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  kind text not null check (kind in ('count','balance')),
  total_price numeric(12,2),
  total_count int,
  balance numeric(12,2),
  remaining_count int,
  remaining_balance numeric(12,2),
  expire_date date,
  series_id uuid not null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists card_usages (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  card_id uuid not null,
  used_at date not null,
  count_used int not null default 0,
  amount_used numeric(12,2) not null default 0,
  equivalent_cny numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists templates (
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  key text primary key,
  user_id uuid not null default auth.uid(),
  parent_key text,
  label text not null,
  emoji text not null default '📦',
  type text not null check (type in ('expense','income')),
  sort int not null default 500,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 设置 / 公积金等单例数据用 kv 存
create table if not exists kv (
  key text primary key,
  user_id uuid not null default auth.uid(),
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_tx_date on transactions (date desc);
create index if not exists idx_usage_card on card_usages (card_id);

-- 行级安全：只允许本人访问
alter table transactions enable row level security;
alter table cards enable row level security;
alter table card_usages enable row level security;
alter table trips enable row level security;
alter table templates enable row level security;
alter table categories enable row level security;
alter table kv enable row level security;

do $$
declare t text;
begin
  foreach t in array array['transactions','cards','card_usages','trips','templates','categories','kv'] loop
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
