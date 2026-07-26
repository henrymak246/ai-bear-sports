# AI小熊 · 足球预测日记

零依赖静态网站：双击 `index.html` 即可查看（无需服务器、无需联网）。Logo：`assets/logo.svg`（AI小熊头像）。

## 页面结构
- **左侧栏 📓 每日红黑**：每天方向命中的红黑圆点与 X红X黑计数 + 累计红黑
- **主区**：命中率仪表盘、当日投资方案、14 日走势、联赛分布、每日预测记录（点开看预测明细/方案历史/复盘）
- **投资方案分两组展示**：🇨🇳 **竞彩方案**（胜平负/让球胜平负/比分，官方SP，直接照买）在前；📊 **标准盘**（亚洲让球 + 大小盘，主流盘口单独结算）在后
- **方案详解弹窗**：点任意方案方块（或日卡里的方案历史条）弹窗显示该层详细说明（选股理由/五式依据/风险），点遮罩或 × 关闭

## 文件说明
- `index.html` — 页面（代码，稳定不改）
- `stats.js` — 命中率统计逻辑（改判定规则才动）
- `data/predictions.js` — **每天唯一需要改的文件**
- `test/stats.test.js` — 统计逻辑测试：`node test/stats.test.js`

## 每日工作流（AI 执行）
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）
2. 赛后复盘：只需给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`；命中判定与统计由页面自动完成
3. 提交：`git add data/predictions.js && git commit -m "data: YYYY-MM-DD 预测/复盘"`

## 数据格式要点
```js
{
  date: 'YYYY-MM-DD', dayPillar: '丙午年·…·辛丑日', dayNote: '当日基调摘要',
  matches: [ { id, league, time, home, away, direction, overUnder, score: [], confidence, finalScore: null, note } ],
  plan: [                              // 中间首页方案方块，按 market 分组展示（可省略）
    { market: 'jc', name: '🟢 胜平负 · 底仓', pct: '40%', text: '一句话方案', detail: '详解全文（可选，\\n 换行；点击方块弹窗展示，缺省时显示 text）' },
    { market: 'jc', name: '🟡 让球+单关 · 增益', pct: '25%', text: '…' },
    { market: 'jc', name: '🔴 比分 · 梦想', pct: '10%', text: '…' },
    { market: 'std', name: '🔵 亚洲让球', pct: '10%', text: '…' },   // jc=竞彩方案，std=标准盘（亚洲让球/大小盘，缺省按 jc）
    { market: 'std', name: '🟣 大小盘', pct: '15%', text: '…' },
  ],
  planNote: '回避与风险提示（可选）',
  review: null,                        // 复盘时回填
}
```

## 判定规则
- 方向：预测主/平/客胜与实际一致 = ✅
- 大小球：全中✅，半中（赢/输一半）半✅计0.5，走水不计入
- 比分：命中预测数组任一 = ✅
- `放弃` / 未回填场次的项不计入统计
