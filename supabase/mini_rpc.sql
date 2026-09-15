-- 小熊微信小程序 · Supabase 直连通道(2026-09-13, RPC+令牌版)
-- 背景: 新版 sb_secret_ key 被 Supabase 按浏览器 UA 拦截(小程序模拟器/真机微信 UA 均带 Mozilla 前缀,
-- 必然 401 "Secret API keys can only be used in a protected environment"), 小程序端彻底不能用 secret key。
-- 方案: 小程序只用 publishable key 调下列 7 个 security-definer RPC, 函数体内校验私有令牌 p_token。
-- 权限面: 仅暴露"读最新推荐/按日读推荐/投注登记增查改删"六个操作; prediction_days 与 bets 的 RLS/门控不动。
-- 改动此文件后: ①整段重跑本 SQL ②core.js 的 ALLOWED_FNS 同步 ③重新部署云函数 bear_api
--   (真机必走云函数通道, 漏做②③的表现是"模拟器正常、真机点按钮静默无效")。
-- 执行: Supabase SQL 编辑器整段跑一次(含建 bets 表, 幂等)。令牌值同步在 miniprogram/utils/config.js 的 MINI_TOKEN。

-- 1) 投注登记表(与 supabase/bets.sql 同构, 幂等)
create table if not exists bets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bet_date text not null,            -- 对应预测日 YYYY-MM-DD
  source text not null,              -- 'jc' 竞彩串 / 'bd' 北单310 / 'ah' 亚盘
  legs jsonb not null,               -- [{match, home, away, pick, odds, handicap?, bdNum?, league, result?}]
  stakes int not null,               -- 注数
  unit numeric not null default 2,   -- 单注金额(元)
  amount numeric not null,           -- 总投入 = stakes × unit × 倍数
  expect_payout numeric,             -- 理论全中奖金(元)
  status text not null default 'pending',  -- pending/hit/miss/half
  actual_payout numeric not null default 0, -- 实际中奖(结算回填)
  profit numeric not null default 0,        -- actual_payout - amount
  settled_at timestamptz,            -- 结算时间
  note text
);
create index if not exists bets_date_status_idx on bets (bet_date, status);

-- 2) 令牌检查(令牌不对一律 raise, PostgREST 返回 400)
create or replace function mini_check_token(p_token text) returns void
language plpgsql stable as $$
begin
  if p_token is null or p_token <> 'mb1_zH1MKVzRLdgyxdPNessCSa-Gs6otrbU_' then
    raise exception 'mini forbidden';
  end if;
end $$;

-- 3) 最新一天推荐 payload(返回 payload json, 含 date/matches/plan/...)
create or replace function mini_get_today_payload(p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  perform mini_check_token(p_token);
  select to_json(p.payload) into v from prediction_days p order by p.date desc limit 1;
  return v;
end $$;

-- 4) 指定日期推荐 payload(p_date = 'YYYY-MM-DD')
create or replace function mini_get_payload_by_date(p_token text, p_date text)
returns json language plpgsql security definer set search_path = public as $$
declare v json;
begin
  perform mini_check_token(p_token);
  select to_json(p.payload) into v from prediction_days p where p.date = p_date order by p.date desc limit 1;
  return v;
end $$;

-- 5) 投注登记插入(列白名单, 返回插入行)
create or replace function mini_save_bet(p_token text, p_bet jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r bets;
begin
  perform mini_check_token(p_token);
  insert into bets (bet_date, source, legs, stakes, unit, amount, expect_payout, note)
  select b.bet_date, b.source, b.legs, b.stakes, coalesce(b.unit, 2), b.amount, b.expect_payout, b.note
  from jsonb_populate_record(null::bets, p_bet) b
  returning * into r;
  return to_json(r);
end $$;

-- 6) 投注登记列表(最新 200 条, 返回 json 数组)
create or replace function mini_list_bets(p_token text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform mini_check_token(p_token);
  return (select coalesce(json_agg(to_json(b) order by b.created_at desc), '[]'::json)
          from (select * from bets order by created_at desc limit 200) b);
end $$;

-- 7) 投注登记更新(结算回写, 列白名单; p_legs 传 null 则不动 legs)
create or replace function mini_update_bet(p_token text, p_id uuid,
  p_status text, p_actual_payout numeric, p_profit numeric, p_settled_at timestamptz, p_legs jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r bets;
begin
  perform mini_check_token(p_token);
  update bets set status = p_status, actual_payout = p_actual_payout,
    profit = p_profit, settled_at = p_settled_at, legs = coalesce(p_legs, legs)
  where id = p_id returning * into r;
  return to_json(r);
end $$;

-- 8) 投注登记编辑(改腿的 310 选项, 支持复式增删)
--    为什么另起一个函数而不给 mini_update_bet 加参数: 后者是结算回写专用的 7 参函数,
--    加参数会造成 PostgREST 的 overload 解析歧义(api.js 两处按 7 参调), 独立函数零回归。
--    改选项必然改注数与投入(如 '3'→'3/1' 注数 1→2), 故这里一并重算 stakes/amount/expect_payout,
--    并把整票重置为"待结算"(改完重来), 清空结算四列。
--    ★p_legs 刻意不 coalesce: 传 null 就撞 legs not null 报 400(响亮失败);
--      静默保留旧 legs 会和新 stakes/amount 脱节。
create or replace function mini_edit_bet(p_token text, p_id uuid,
  p_legs jsonb, p_stakes int, p_amount numeric, p_expect_payout numeric)
returns json language plpgsql security definer set search_path = public as $$
declare r bets;
begin
  perform mini_check_token(p_token);
  update bets set legs = p_legs, stakes = p_stakes, amount = p_amount,
    expect_payout = p_expect_payout,
    status = 'pending', actual_payout = 0, profit = 0, settled_at = null
  where id = p_id returning * into r;
  return to_json(r);
end $$;

-- 9) 投注登记删除(彻底删除, 不可恢复; 前端删前有确认弹窗)
--    id 不存在时 r 为 NULL → to_json 返回 null(HTTP 200), 客户端按"没抛错即成功"处理:
--    刻意不 raise 'not found' —— 双击删除的第二发会变成 400 红条, 比静默成功更糟。
create or replace function mini_delete_bet(p_token text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare r bets;
begin
  perform mini_check_token(p_token);
  delete from bets where id = p_id returning * into r;
  return to_json(r);
end $$;
