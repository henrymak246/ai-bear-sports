-- ============================================
-- AI小熊 · 会员门控 数据库装配（Supabase SQL Editor 一次性执行）
-- 内容：members 表 + 注册触发器 + prediction_days 表 + RLS
-- 依赖 Supabase 默认授权（public schema 表自动授权 anon/authenticated，RLS 为唯一闸门）
-- 执行后记得：Authentication 关闭 Confirm email；在 members 表把站长账号 approved 打勾
-- 增量迁移：站长后台（is_admin + 管理 RPC）见同目录 admin.sql（在 setup.sql 之后执行）
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
  insert into public.members (user_id, email) values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 触发器函数不对外暴露调用
revoke execute on function public.handle_new_user() from anon, authenticated;

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

-- RLS 不覆盖 TRUNCATE，显式收回（PostgREST 本不可达，纵深防御）
revoke truncate on public.members, public.prediction_days from anon, authenticated;

-- 3.5) 表级授权（部分项目缺省授权未生效时需显式执行；RLS 仍是唯一闸门）
grant select on public.members to anon, authenticated;
grant select on public.prediction_days to anon, authenticated;
grant all on public.members, public.prediction_days to service_role;

-- 4) 验证查询（执行后应返回两行 policy 各一条、两表 RLS 均为 enabled）
-- select tablename, rowsecurity from pg_tables where schemaname='public';
-- select policyname, tablename from pg_policies where schemaname='public';
