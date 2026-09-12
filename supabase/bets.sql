-- 小熊微信小程序 · 投注登记表(2026-09-12)
-- 在 Supabase SQL 编辑器执行。不开 RLS: anon key 无权限, 仅 service key(小程序内嵌)可读写。
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
