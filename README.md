# AI小熊 · 体育心得分享

🌐 公网地址：**https://henrymak246.github.io/ai-bear-sports/**（GitHub Pages，`git push` 后约 1 分钟自动更新）
- 🔐 会员门控：注册需邮箱确认 + 站长审核（站长在站内「🛠 管理」面板操作）才可见内容

零依赖静态网站：双击 `index.html` 即可本地查看（无需服务器、无需联网）。Logo：`assets/logo.svg`（AI小熊头像）。

## 页面结构
- **左侧栏 📓 每日红黑**：每天方向命中的红黑圆点与 X红X黑计数 + 累计红黑
- **主区**：命中率仪表盘、当日投资方案、14 日走势、联赛分布、每日预测记录（点开看预测明细/方案历史/复盘）、🎌 **日韩专栏**（每轮 J 联赛/K 联赛各 4 场，id 以「日职」/「韩K」开头，独立累计方向/大小/比分+方案块，并给竞彩方向对照）、🀄 **北单专栏**（id 以「北单」开头的场次单独累计方向/大小/比分+方案块，并给竞彩方向对照）
- **投资方案分两组展示**：🇨🇳 **竞彩方案**（胜平负/让球胜平负/比分，官方SP，直接照买）在前；📊 **标准盘**（亚洲让球 + 大小盘，主流盘口单独结算）在后
- **💧 心水公布记录**（2026-08-10 新增）：社媒风（微博/小红书式）每日推荐帖，**竞彩为主、每日3-4场**，独立累计红黑；当日对象加 `xinshui: { post, picks }`，复盘时给每条 pick 回填 `result: 'hit'|'miss'`（待赛缺省 null）
- **方案详解弹窗**：点任意方案方块（或日卡里的方案历史条）弹窗显示该层详细说明（选股理由/五式依据/风险），点遮罩或 × 关闭

## 文件说明
- `index.html` — 页面（代码，稳定不改）
- `stats.js` — 命中率统计逻辑（改判定规则才动）
- `data/predictions.js` — **每天唯一需要改的文件**（本地主数据，已 gitignore；改完跑 `node tools/sync-data.js` 上传）
- `test/stats.test.js` — 统计逻辑测试：`node test/stats.test.js`

## 每日工作流（AI 执行）
0. **推荐逻辑以 `docs/推荐逻辑.md`（V3.0）为唯一权威**：信号一致性（胆禁反向）、盘口分层（碾压场/均势场）、总进球锚点、发布前自检清单均按此文执行
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）。**场次规则：每日推荐分三组——竞彩组（当日竞彩可买场次精选，数量随赛程不限，不含日韩场次）+ 日韩组每轮 J 联赛/K 联赛各 4 场（id 如 `日职1`、`韩K1`，日韩场次统一归本组）+ 北单组固定每日 7 场（从北单选最有信心场次，id 如 `北单159`）；页面按组自动分开展示**
2. 竞彩 SP 发布后：给当日每场补 `sp: ['主胜','平','客胜']`（北单场另加 `spHandicap: 让球数`），跑 `node tools/sync-data.js` 重传（首更先发预测，SP 后补）
3. 赛后复盘：给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`、给每个方案块填 `result`（hit/miss/half/push）、给心水每条 picks 填 `result`（hit/miss）；命中判定与统计由页面自动完成
4. 同步：`node tools/sync-data.js`（数据在 Supabase，不入 git；页面壳改动才 git commit + push）

## 数据格式要点
```js
{
  date: 'YYYY-MM-DD', dayPillar: '丙午年·…·辛丑日', dayNote: '当日基调摘要',
  matches: [ { id, league, time, home, away, direction, overUnder, score: [], confidence, finalScore: null, note, sp: ['主胜','平','客胜'], spHandicap, scoreSp: [] } ],   // sp/spHandicap 可选：竞彩 SP 三元组、北单让球数；scoreSp 可选：与 score 对齐的比分赔率（页面在比分后括号显示）；缺省页面显示 —
  plan: [                              // 中间首页方案方块，按 market 分组展示（可省略）
    { market: 'jc', name: '🎯 胜平负', pct: '50%', text: '含让球任选最有投资价值场次', detail: '详解全文（可选，\\n 换行；点击方块弹窗展示，缺省时显示 text）' },
    { market: 'jc', name: '⚽ 进球数', pct: '20%', text: '总进球 X球(SP) 及份数' },
    { market: 'jc', name: '🏅 比分', pct: '10%', text: '娱乐层比分组合' },
    { market: 'std', name: '🔵 亚洲让球', pct: '10%', text: '…' },   // jc=竞彩方案，std=标准盘（亚洲让球/大小盘，缺省按 jc）
    { market: 'std', name: '🟣 大小盘', pct: '10%', text: '…' },
    // result: 'hit'|'miss'|'half'|'push'（可选）：复盘回填该块整体战果；半红计0.5、走水与未回填不计入命中率分母
  ],
  planNote: '回避与风险提示（可选）',
  actualBets: [                           // 实际投注票样留档（可选，显示在标准盘下方）
    { img: 'assets/bets/YYYY-MM-DD-1.jpg', note: '票注说明（过关方式/倍数/金额/各关选项/最高奖金）' },
  ],
  analysis: '完整分析全文（可选，\\n 换行）：日柱框架/时段信号/逐场拆解；方案下方和日卡内会出现"MMDD 完整分析"跳转条，点击弹窗展示',
  review: null,                        // 复盘时回填
  xinshui: {                           // 可选：💧心水公布记录（竞彩为主，每日3-4场社媒风推荐帖）
    post: '推荐帖全文（\\n 换行；含对阵/竞彩推荐/比分预测/进球数/综合分析/串关参考/理性提示）',
    picks: [ { label: '001 天狼星 让胜/让平', result: null } ],   // result: 复盘回填 'hit'|'miss'，待赛缺省 null
  },
}
```

### 过关板块（2026-08 新增，均为可选顶层字段）

统一结构 `{ legs: [...], totalOdds: '约N倍', note: '说明' }`；leg 通用字段 `{ play, league, match, pick, odds, reason }`，**复盘时逐 leg 回填 `result: 'hit'|'miss'`**（半赢/走水按 half/push）。各板块差异：

| 字段 | 板块 | leg 特有字段 |
|---|---|---|
| `dream7` | 🎯 梦想7关（竞彩总进球等双选） | `sel: true` = 双选标记（页面显徽章） |
| `hc7` | 🔵 竞彩让球7关 | — |
| `asian7` | 🌏 非竞彩亚盘7场 | — |
| `score3` | 🏅 幸福比分三关 | leg 无 `play` |
| `max7` | 🧩 综合过关7关（混合玩法追最大SP） | `key: true` = 胆（页面显胆徽章） |
| `zucai310` | 🎫 足彩310（胜负彩14场，另有 `rensuan9` 任九字段） | `pick` 用 3/1/0；`key: true` = 胆 |

### 其他新增顶层字段
- `dailyPost: { title, content }` — 📮 每日发布社媒文案（2026-08 起）
- `fivePillars: '五式详解全文（八字/紫微/奇门/六壬/六爻，\\n 换行）'` — 日卡点弹窗展示

### match 级新增字段（2026-08 起，均可选）
- `hhad: ['让胜SP','让平SP','让负SP']` — 竞彩让球胜平负 SP（有 hhad 必有 `spHandicap`）
- `ah: { goals:'0.25', name:'平手/半球', home:'0.98', away:'0.80' }` — 亚盘让球盘口+水位（球探网）
- `ouOdds: { goals:'2.75', name:'2.5/3', over:'0.85', under:'0.87' }` — 亚盘大小球水位
- `ttgSp: '3.60'` — 竞彩总进球 SP（与 overUnder 的 "X球" 预测对应）
- `scoreSp: ['10.0(欧)','SP待开']` — 与 `score` 数组对齐的比分赔率


## 判定规则
- 方向：预测主/平/客胜与实际一致 = ✅
- 大小球：全中✅，半中（赢/输一半）半✅计0.5，走水不计入
- 比分：命中预测数组任一 = ✅
- `放弃` / 未回填场次的项不计入统计
- 方案块：块内全红=hit、全黑=miss、部分红=half、全部走水=push；判定依据写入当日 review
