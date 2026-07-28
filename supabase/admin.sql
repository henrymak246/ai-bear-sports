-- ============================================
-- AI小熊 · 站长后台 数据库迁移（Supabase SQL Editor 一次性执行）
-- 前置：setup.sql 已执行。本脚本：members.is_admin + is_admin() + 管理员读策略 + 4 个管理 RPC
-- 设计要点：members 表保持无任何前端写策略；写操作只走 security definer RPC（函数体内鉴权）
-- ============================================

-- 1) members 加管理员标记（无前端写路径，只能 service key 改）
alter table public.members add column if not exists is_admin boolean not null default false;

-- 2) is_admin()：RLS 策略与 RPC 共用判定。security definer 绕 RLS——
--    策略里直接子查询 members 会无限递归（经典陷阱），必须走函数
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists(select 1 from public.members where user_id = auth.uid() and is_admin and approved);
$$;
-- 注意：is_admin() 保持默认 PUBLIC execute（策略表达式需对 anon/authenticated 可调用；
-- 只返回布尔、不泄露数据，可安全暴露）
-- 同时要求 approved：被撤销资格的管理员立即失去全部管理权限

-- 3) 管理员可读 members 全部行（与 members_select_own 是 OR 叠加：普通会员仍只能读自己）
drop policy if exists "members_select_admin" on public.members;
create policy "members_select_admin" on public.members
  for select using (public.is_admin());

-- 4) list_members()：全部会员（仅管理员）
create or replace function public.list_members()
returns table(user_id uuid, email text, approved boolean, is_admin boolean, created_at timestamptz)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  return query select m.user_id, m.email, m.approved, m.is_admin, m.created_at
    from public.members m order by m.created_at desc;
end;
$$;

-- 5) approve_member(target)：通过审核（仅管理员）
create or replace function public.approve_member(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  update public.members set approved = true where user_id = target;
end;
$$;

-- 6) revoke_member(target)：撤销审核（仅管理员；不能撤自己，防锁死）
create or replace function public.revoke_member(target uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  if target = auth.uid() then raise exception 'cannot revoke yourself'; end if;
  update public.members set approved = false where user_id = target;
end;
$$;

-- 7) list_days()：数据同步状态（matches = 当日 payload.matches 数组长度，缺失/非数组计 0）
create or replace function public.list_days()
returns table(date text, updated_at timestamptz, matches int)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'permission denied'; end if;
  return query select d.date, d.updated_at,
    case when jsonb_typeof(d.payload->'matches') = 'array'
         then jsonb_array_length(d.payload->'matches') else 0 end as matches
    from public.prediction_days d order by d.date desc;
end;
$$;

-- 8) 授权：anon 一律不可调（PostgreSQL 默认授 EXECUTE 给 PUBLIC，必须连 PUBLIC 一起收）；
--    authenticated 可调但非管理员被函数体首行拦截
revoke execute on function public.list_members() from public, anon, authenticated;
revoke execute on function public.approve_member(uuid) from public, anon, authenticated;
revoke execute on function public.revoke_member(uuid) from public, anon, authenticated;
revoke execute on function public.list_days() from public, anon, authenticated;
grant execute on function public.list_members() to authenticated;
grant execute on function public.approve_member(uuid) to authenticated;
grant execute on function public.revoke_member(uuid) to authenticated;
grant execute on function public.list_days() to authenticated;

-- 9) 站长赋权不在此执行（由本机 tools/set-admin.js 用 service key 完成）：
-- update public.members set is_admin = true, approved = true where email = '站长邮箱';
