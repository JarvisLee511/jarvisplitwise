-- ============================================================
-- FairShare 資料庫結構 — 貼到 Supabase 的 SQL Editor 執行一次即可
-- ============================================================

create table if not exists groups (
  code        text primary key,
  name        text not null,
  currency    text not null default 'NT$',
  created_at  timestamptz not null default now()
);

create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null references groups(code) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null references groups(code) on delete cascade,
  description text not null,
  amount_cents bigint not null,
  paid_by     uuid not null,
  split_type  text not null,
  participants jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists settlements (
  id          uuid primary key default gen_random_uuid(),
  group_code  text not null references groups(code) on delete cascade,
  from_member uuid not null,
  to_member   uuid not null,
  amount_cents bigint not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_members_group     on members(group_code);
create index if not exists idx_expenses_group    on expenses(group_code);
create index if not exists idx_settlements_group on settlements(group_code);

-- ------------------------------------------------------------
-- Row Level Security
-- 這是「朋友分帳」用途, 不做帳號登入; 知道群組代碼 = 有權存取。
-- 因此開放匿名 (anon) 讀寫。代碼是隨機 6 碼, 等同群組密碼。
-- 若要更嚴格 (例如禁止刪別人資料), 可日後加 policy。
-- ------------------------------------------------------------
alter table groups      enable row level security;
alter table members     enable row level security;
alter table expenses    enable row level security;
alter table settlements enable row level security;

do $$
declare t text;
begin
  foreach t in array array['groups','members','expenses','settlements'] loop
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('create policy anon_all on %I for all to anon using (true) with check (true);', t);
  end loop;
end $$;

-- 開啟即時同步 (Realtime): 讓任何人新增/刪除時其他人畫面自動更新
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table settlements;
