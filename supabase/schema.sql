-- ============================================================
-- Jarvisplitwise 資料庫結構 — 貼到 Supabase 的 SQL Editor 按 Run 即可
-- 可以重複執行: 新專案會建好全部; 舊專案會把權限規則更新成最新版, 資料不動
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
-- Row Level Security: 知道群組代碼才看得到、改得到那個群組
-- 這是「朋友分帳」用途, 不做帳號登入。前端每個請求都帶 x-group-code header,
-- 資料庫只回傳 / 只允許寫入跟它相符的資料列; 沒帶代碼或代碼錯的請求什麼都看不到。
-- (舊版是 anon 全開: 拿公開的 publishable key 就能列出、改動、刪除所有群組)
-- ------------------------------------------------------------
alter table groups      enable row level security;
alter table members     enable row level security;
alter table expenses    enable row level security;
alter table settlements enable row level security;

-- 這次請求帶的群組代碼 (PostgREST 會把 request headers 放進 request.headers)
create or replace function public.request_group_code() returns text
  language sql stable set search_path = ''
  as $$ select nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-group-code', '') $$;
grant execute on function public.request_group_code() to anon, authenticated;

drop policy if exists anon_all on groups;
drop policy if exists by_group_code on groups;
create policy by_group_code on groups for all to anon, authenticated
  using (code = (select public.request_group_code()))
  with check (code = (select public.request_group_code()));

do $$
declare t text;
begin
  foreach t in array array['members','expenses','settlements'] loop
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('drop policy if exists by_group_code on %I;', t);
    execute format('create policy by_group_code on %I for all to anon, authenticated '
                   'using (group_code = (select public.request_group_code())) '
                   'with check (group_code = (select public.request_group_code()));', t);
    -- 即時同步改走 Realtime broadcast (只送「有變動」通知、不帶資料), 資料表不必放進 realtime publication
    if exists (select 1 from pg_publication_tables
               where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime drop table %I;', t);
    end if;
  end loop;
end $$;
