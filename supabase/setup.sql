-- ============================================
-- AI小熊 · 会员门控 数据库装配（Supabase SQL Editor 一次性执行）
-- 内容：members 表 + 注册触发器 + prediction_days 表 + RLS
-- ============================================

-- 1) members：注册用户档案（approved=站长审核位）
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

-- 本人只能读自己的行（用于前端查 approved）
drop policy if exists "members_select_own" on public.members;
create policy "members_select_own" on public.members
  for select using (auth.uid() = user_id);

-- 2) 注册触发器：auth.users 新用户自动建 members 行（approved=false）
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.members (user_id, email) values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) prediction_days：每日预测数据（payload=完整当日对象）
create table if not exists public.prediction_days (
  date text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.prediction_days enable row level security;

-- 仅审核通过的会员可读；anon（未登录）与未审核用户一律读不到
drop policy if exists "days_select_approved" on public.prediction_days;
create policy "days_select_approved" on public.prediction_days
  for select using (
    exists (
      select 1 from public.members m
      where m.user_id = auth.uid() and m.approved
    )
  );

-- 4) 验证查询（执行后应返回两行 policy 各一条、两表 RLS 均为 enabled）
-- select tablename, rowsecurity from pg_tables where schemaname='public';
-- select policyname, tablename from pg_policies where schemaname='public';
