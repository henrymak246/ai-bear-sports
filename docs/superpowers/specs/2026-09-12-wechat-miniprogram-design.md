# 小熊微信小程序 设计文档(2026-09-12)

> 目标:自用微信小程序,在手机上直接看当日**竞彩/北单310/亚洲让球**推荐,一键点选组串登记投注,每 5 分钟前台轮询实时比分,完场自动结算盈亏。
> 范围:自用(开发版/体验版,不上架)。不做:会员门控、推送订阅、多用户、上架审核适配、分享评论。

## 1. 合规形态与前置条件

- **自用开发版**:彩票推荐类内容个人主体无法上架(微信审核),开发版/体验版在自己手机微信直接跑,无需过审。
- 前置(用户操作,约 10 分钟):
  1. 注册个人小程序(免费,https://mp.weixin.qq.com → 立即注册 → 小程序 → 个人主体),拿 **AppID**
  2. 安装**微信开发者工具**
  3. 开发者工具中勾选「不校验合法域名」(自用开发版,任意 HTTPS 直连)
- 小程序代码目录:`miniprogram/`(站点仓库内,原生 WXML/WXSS/JS,零构建)。

## 2. 架构(方案A:零后端)

```
微信小程序(手机)
  ├─ Supabase REST ── prediction_days(anon key 只读, 推荐数据)
  │                └─ bets(service key 内嵌, 读写, 投注登记)
  └─ ESPN scoreboard API(免 key, 前台每 5 分钟轮询, 实时比分)
```

- 无自建后端、无运维依赖、本机不开机也能用(读链路全在云端/ESPN)。
- service key 内嵌于自用开发版:仅本人手机持有,泄露风险可接受(拍板记录)。
- 域名:开发版关闭域名校验,`*.supabase.co` 与 `site.api.espn.com` 直连。

## 3. 页面结构(3 个主 Tab + 组串抽屉)

| 页面 | 内容 |
|---|---|
| **推荐页**(首页,顶部三切换) | 🎫竞彩:每场 方向徽章★+双选+SP/让球SP+总进球+比分;🀄北单:北单号+让球+选择+SP3+判定;🌏亚盘:ahPick 场让球观点★+大小观点★+澳门盘口水位。数据=Supabase 当日 payload(matches/plan/max7/hc7/asian7/score3/beidan310)。 |
| **场卡内嵌比分** | 已开赛显示实时比分(红色)+状态(进行中/完场);未开赛显示开赛时间。 |
| **组串模式** | 推荐页底部「组串」按钮进入勾选态:勾选腿→底部栏实时显示 注数/理论奖金(2元×SP连乘)→填金额→保存到 bets。 |
| **我的投注页** | 列表:日期/来源/腿明细/注数/金额/状态(待赛/中/黑/半)/盈亏;顶部累计统计(总投入/总回收/净盈亏/命中率)。 |

## 4. 数据流

### 4.1 推荐数据(只读)
- `GET {SUPABASE_URL}/rest/v1/prediction_days?date=eq.<today>&select=payload`,header 带 anon key。
- 取数组最新一天(倒序第一),payload 结构即站点数据(matches/plan/max7/hc7/asian7/score3/beidan310/zucai310)。

### 4.2 实时比分(前台轮询)
- 联赛码注册表+中文队名→ESPN displayName 映射表,**从 `tools/_live0912.js` 的 LEAGUES/TEAM 移植**为 `miniprogram/utils/espn.js` 数据模块(每日 build 时由脚本重新生成,防止漂移:`tools/gen_mini_espn.js` 从最新 `_live<MMDD>.js` 抽取)。
- 前台 `setInterval(300s)` + `onShow` 立即拉;切后台自动停。
- 每场按 league 拉 scoreboard(dates=今日+次日),队名子串匹配,STATUS_FULL_TIME=完场。
- ESPN 死链联赛(kor.1/jpn.2 等):回退显示 Supabase payload 里的 finalScore(本机人工/500.com 回填),标注"人工回填"。
- 拉取失败:显示"更新失败 @上次成功时间",不清空旧比分,不阻断页面。

### 4.3 投注登记(读写)
- Supabase 新表 **bets**:

| 列 | 类型 | 说明 |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| created_at | timestamptz default now() | 登记时间 |
| bet_date | text | 对应预测日(YYYY-MM-DD) |
| source | text | `jc` 竞彩串 / `bd` 北单310 / `ah` 亚盘 |
| legs | jsonb | [{match, home, away, pick, odds, handicap?, bdNum?, league, espnLeague?, result?}] |
| stakes | int | 注数 |
| unit | numeric | 单注金额(默认 2) |
| amount | numeric | 总投入=stakes×unit×倍数 |
| expect_payout | numeric | 理论全中奖金(2×SP连乘口径) |
| status | text | `pending`/`hit`/`miss`/`half`(默认 pending) |
| actual_payout | numeric | 实际中奖(结算回填,默认 0) |
| profit | numeric | actual_payout - amount |
| settled_at | timestamptz | 结算时间 |
| note | text | 备注(可选) |

- 建表 SQL 落盘 `supabase/bets.sql`;**bets 表不挂 RLS**(仅 service key 可读写,anon key 无权限——与 members/prediction_days 的只读 anon 策略隔离)。

## 5. 自动结算

- 腿判定逻辑移植站点 `stats.js` 核心:judgeDirection/judgeOverUnder/judgeScore + 北单让球后 310 判定(handicap 调整比分)+亚盘(赢/输半/走水)→ `miniprogram/utils/judge.js`(由 `tools/gen_mini_judge.js` 从 stats.js 抽取生成,保持同源)。
- 触发:比分轮询发现某腿场次完场→该腿标 result;全部腿完场→串关结算:断 1 腿=miss(实际中奖 0),全红=hit。**奖金口径(2026-09-12 实证):竞彩串与北单均按 leg.odds 连乘×单注金额,不另乘返奖率(竞彩 SP 与北单 SP 均为净赔率,北单已含 65% 返奖);亚盘按各腿 赢全/赢半/走水/输半/输全 逐腿折算后连乘**,写回 status/actual_payout/profit/settled_at。
- 复式多选(pick 含 "/"):命中其一即该腿红,奖金按命中项 SP。

## 6. 视觉

- 复用站点小熊棕色调(`--brown` 系),卡片式,字号≥13px 适配手机;🐻 品牌元素。
- 竞彩/北单/亚盘三 Tab 的卡片布局与站点 matchTable/北单专栏/亚盘列语义对齐(方向徽章/★信心/SP 内联)。

## 7. 错误处理

- Supabase 拉取失败→页面顶部横幅"推荐数据拉取失败,显示缓存"(wx.setStorage 缓存上次 payload)。
- ESPN 单场联赛拉取失败→仅该联赛场缺比分,其余正常。
- bets 写失败→本地暂存(wx.setStorage 草稿),下次进页重试提示。
- 结算异常(比分缺失超 24h)→标 `pending` 不动,我的投注页提示"待人工核对"。

## 8. 测试与验收

- `miniprogram/utils/judge.js` 单测:`test/mini_judge.test.js`(node 跑,复用 stats.test.js 关键用例+让球 310 用例)。
- 验收清单(开发者工具模拟器+真机):①当日三 Tab 推荐正确渲染 ②勾选组串注数/理论奖金计算与 _bd_settle 口径一致 ③保存后 Supabase bets 表可见 ④开赛场 5 分钟内比分刷新 ⑤完场自动结算状态/盈亏正确 ⑥断网/拉取失败降级正常。

## 9. 实施顺序(计划阶段细化)

1. Supabase 建 bets 表(`supabase/bets.sql`,用户 SQL 编辑器执行)
2. `tools/gen_mini_espn.js` + `tools/gen_mini_judge.js`(从站点同源生成小程序数据/判定模块)
3. 小程序骨架(app.json/app.js/三页面)+推荐页三 Tab
4. 比分轮询模块接入场卡
5. 组串+bets 保存
6. 我的投注页+自动结算
7. 验收清单全过
