# AI小熊 · 体育心得分享

🌐 公网地址：**https://henrymak246.github.io/ai-bear-sports/**（GitHub Pages，`git push` 后约 1 分钟自动更新）
- 🔐 会员门控：注册需邮箱确认 + 站长审核（站长在站内「🛠 管理」面板操作）才可见内容

零依赖静态网站：双击 `index.html` 即可本地查看（无需服务器、无需联网）。Logo：`assets/logo.svg`（AI小熊头像）。

## 页面结构
- **左侧栏 📓 每日红黑**：每天方向命中的红黑圆点与 X红X黑计数 + 累计红黑
- **主区**：命中率仪表盘、当日投资方案、14 日走势、联赛分布、每日预测记录（点开看预测明细/方案历史/复盘）、🀄 **北单专栏**（id 以「北单」开头的场次单独累计方向/大小/比分+方案块，并给竞彩方向对照）
- **投资方案分两组展示**：🇨🇳 **竞彩方案**（胜平负/让球胜平负/比分，官方SP，直接照买）在前；📊 **标准盘**（亚洲让球 + 大小盘，主流盘口单独结算）在后
- **方案详解弹窗**：点任意方案方块（或日卡里的方案历史条）弹窗显示该层详细说明（选股理由/五式依据/风险），点遮罩或 × 关闭

## 文件说明
- `index.html` — 页面（代码，稳定不改）
- `stats.js` — 命中率统计逻辑（改判定规则才动）
- `data/predictions.js` — **每天唯一需要改的文件**（本地主数据，已 gitignore；改完跑 `node tools/sync-data.js` 上传）
- `test/stats.test.js` — 统计逻辑测试：`node test/stats.test.js`

## 每日工作流（AI 执行）
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）。**场次规则：每日推荐分两组——竞彩组（当日竞彩可买场次精选，数量随赛程不限）+ 北单组固定每日 7 场（从北单选最有信心场次，id 如 `北单159`）；页面按组自动分开展示**
2. 竞彩 SP 发布后：给当日每场补 `sp: ['主胜','平','客胜']`（北单场另加 `spHandicap: 让球数`），跑 `node tools/sync-data.js` 重传（首更先发预测，SP 后补）
3. 赛后复盘：给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`、给每个方案块填 `result`（hit/miss/half/push）；命中判定与统计由页面自动完成
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
}
```

## 判定规则
- 方向：预测主/平/客胜与实际一致 = ✅
- 大小球：全中✅，半中（赢/输一半）半✅计0.5，走水不计入
- 比分：命中预测数组任一 = ✅
- `放弃` / 未回填场次的项不计入统计
- 方案块：块内全红=hit、全黑=miss、部分红=half、全部走水=push；判定依据写入当日 review
