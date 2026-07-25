# 每日足球预测记录网站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `Desktop\足球预测站\` 建成零依赖静态单页网站，记录每日竞彩预测、赛后回填赛果、自动统计命中率。

**Architecture:** `index.html`（渲染层）+ `stats.js`（统计纯函数库，浏览器/Node 双环境）+ `data/predictions.js`（唯一每日变更的数据文件）。代码与数据分离，统计逻辑抽成独立文件以便 Node 做 TDD 对拍。

**Tech Stack:** 原生 HTML/CSS/JS（无框架无 CDN）、Node（仅跑测试）、git（版本追踪，spec 第 10 节已获用户确认）。

**Spec:** `Desktop\足球预测站\docs\superpowers\specs\2026-07-26-daily-prediction-site-design.md`

---

### Task 0: 环境检查与 git 初始化

**Files:**
- Create: `Desktop\足球预测站\.gitignore`（不需要，跳过）

- [ ] **Step 1: 确认 Node 可用**

Run: `node --version`
Expected: 输出 v14 或更高版本号。若不存在，后续测试步骤改用浏览器控制台手动对拍，并在最终汇报中说明。

- [ ] **Step 2: git init 并提交已有 spec**

```bash
cd "/c/Users/Administrator/Desktop/足球预测站" && git init && git add docs/ && git commit -m "docs: 设计文档（每日足球预测记录网站）"
```

Expected: 输出 `1 file changed`，`git log --oneline` 有一条提交。

---

### Task 1: stats.js 统计纯函数库（TDD）

**Files:**
- Test: `Desktop\足球预测站\test\stats.test.js`
- Create: `Desktop\足球预测站\stats.js`

- [ ] **Step 1: 写失败测试**

创建 `test\stats.test.js`：

```js
const assert = require('assert');
const S = require('../stats.js');

// judgeDirection
assert.strictEqual(S.judgeDirection('主胜', '3-1'), 1);
assert.strictEqual(S.judgeDirection('主胜', '1-3'), 0);
assert.strictEqual(S.judgeDirection('平', '2-2'), 1);
assert.strictEqual(S.judgeDirection('客胜', '0-2'), 1);
assert.strictEqual(S.judgeDirection('放弃', '3-1'), null);
assert.strictEqual(S.judgeDirection('主胜', null), null);

// judgeOverUnder（含 .25/.75 双段结算）
assert.strictEqual(S.judgeOverUnder('大2.5', '2-1'), 1);    // 3球 > 2.5 全中
assert.strictEqual(S.judgeOverUnder('小2.5', '2-1'), 0);
assert.strictEqual(S.judgeOverUnder('大3', '2-1'), null);   // 整盘走水，不计入
assert.strictEqual(S.judgeOverUnder('大3.25', '2-1'), 0.5); // 大3走水+大3.5输 = 输一半计0.5
assert.strictEqual(S.judgeOverUnder('大3.25', '3-1'), 1);   // 全中
assert.strictEqual(S.judgeOverUnder('小2.75', '2-1'), 0.5); // 小2.5输+小3走 = 输一半计0.5
assert.strictEqual(S.judgeOverUnder('大2.75', '2-1'), 0.5); // 大2.5赢+大3走 = 赢一半
assert.strictEqual(S.judgeOverUnder('放弃', '2-1'), null);

// judgeScore
assert.strictEqual(S.judgeScore(['3-0', '3-1'], '3-1'), 1);
assert.strictEqual(S.judgeScore(['3-0', '3-1'], '2-0'), 0);
assert.strictEqual(S.judgeScore([], '3-1'), null);

// computeDayStats：1场全中 + 1场待回填 + 1场方向错大小球中
const day = {
  date: '2026-07-26',
  matches: [
    { id: 'A', league: '瑞典超', direction: '主胜', overUnder: '大2.5', score: ['3-0'], finalScore: '3-0' },
    { id: 'B', league: '韩K联', direction: '客胜', overUnder: '放弃', score: ['0-1'], finalScore: null },
    { id: 'C', league: '韩K联', direction: '主胜', overUnder: '小2.5', score: ['1-0'], finalScore: '0-1' },
  ],
};
const ds = S.computeDayStats(day);
assert.deepStrictEqual(ds.direction, { score: 1, total: 2 });
assert.deepStrictEqual(ds.overUnder, { score: 2, total: 2 });
assert.deepStrictEqual(ds.score, { score: 1, total: 2 });
assert.strictEqual(ds.pending, 1);
assert.strictEqual(ds.matches, 3);

// computeOverall + byLeague
const days = [day, {
  date: '2026-07-25',
  matches: [{ id: 'D', league: '瑞典超', direction: '主胜', overUnder: '小2.5', score: ['2-0'], finalScore: '2-0' }],
}];
const ov = S.computeOverall(days);
assert.strictEqual(ov.direction.total, 3);
assert.strictEqual(ov.direction.score, 2);
assert.ok(Math.abs(ov.direction.rate - 2 / 3) < 1e-9);
assert.strictEqual(ov.days, 2);
assert.strictEqual(ov.matches, 4);
assert.strictEqual(ov.pending, 1);
const swe = ov.byLeague.find(l => l.league === '瑞典超');
assert.strictEqual(swe.total, 2);
assert.strictEqual(swe.rate, 1);

// computeTrend：日期升序、仅含有判定场次的日、近n日截断
const trend = S.computeTrend(days, 14);
assert.strictEqual(trend.length, 2);
assert.strictEqual(trend[0].date, '2026-07-25');
assert.strictEqual(trend[1].date, '2026-07-26');
assert.strictEqual(trend[0].rate, 1);
assert.strictEqual(trend[1].rate, 0.5);

console.log('stats.test.js 全部通过 ✓');
```

- [ ] **Step 2: 运行确认失败**

Run: `cd "/c/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: FAIL，`Cannot find module '../stats.js'`

- [ ] **Step 3: 实现 stats.js**

创建 `stats.js`：

```js
/* stats.js — 命中率统计纯函数库（浏览器 <script> 与 Node require 双环境可用） */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatsLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function parseScore(finalScore) {
    if (!finalScore) return null;
    const m = String(finalScore).trim().match(/^(\d+)\s*[-:：]\s*(\d+)$/);
    if (!m) return null;
    return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
  }

  // 方向命中：pred ∈ 主胜/平/客胜/放弃；返回 1/0/null(不计入)
  function judgeDirection(pred, finalScore) {
    if (!pred || pred === '放弃') return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const actual = s.home > s.away ? '主胜' : s.home < s.away ? '客胜' : '平';
    return pred === actual ? 1 : 0;
  }

  function parseOverUnder(pred) {
    if (!pred) return null;
    const m = String(pred).trim().match(/^([大小])\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return { side: m[1], line: parseFloat(m[2]) };
  }

  // 单段判定：1 中 / 0 不中 / null 走水
  function judgeSegment(side, line, goals) {
    if (goals === line) return null;
    const overWin = goals > line;
    return (side === '大') === overWin ? 1 : 0;
  }

  // 大小球命中：.25/.75 拆双段；返回 1 / 0.5 / 0 / null(放弃或整盘走水)
  function judgeOverUnder(pred, finalScore) {
    const p = parseOverUnder(pred);
    const s = parseScore(finalScore);
    if (!p || !s) return null;
    const goals = s.home + s.away;
    const quarter = Math.round(p.line * 100) % 50 === 25; // .25/.75 → 双段
    const lines = quarter ? [p.line - 0.25, p.line + 0.25] : [p.line];
    const results = lines.map(l => judgeSegment(p.side, l, goals));
    const valid = results.filter(r => r !== null);
    if (valid.length === 0) return null;             // 整盘走水，不计入统计
    if (valid.length !== results.length) return 0.5; // 含走水段 → 半中（赢/输一半）
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

  // 比分命中：预测数组中任一与实比分完全一致
  function judgeScore(predArr, finalScore) {
    if (!Array.isArray(predArr) || predArr.length === 0) return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const norm = s.home + '-' + s.away;
    return predArr.some(p => String(p).replace(/[:：]/g, '-') === norm) ? 1 : 0;
  }

  // 单日统计：score=命中分（含0.5），total=计入场次数，pending=待回填数
  function computeDayStats(day) {
    const acc = {
      direction: { score: 0, total: 0 },
      overUnder: { score: 0, total: 0 },
      score: { score: 0, total: 0 },
      pending: 0,
      matches: (day.matches || []).length,
    };
    (day.matches || []).forEach(m => {
      if (!m.finalScore) { acc.pending += 1; return; }
      const d = judgeDirection(m.direction, m.finalScore);
      if (d !== null) { acc.direction.score += d; acc.direction.total += 1; }
      const o = judgeOverUnder(m.overUnder, m.finalScore);
      if (o !== null) { acc.overUnder.score += o; acc.overUnder.total += 1; }
      const b = judgeScore(m.score, m.finalScore);
      if (b !== null) { acc.score.score += b; acc.score.total += 1; }
    });
    return acc;
  }

  function rate(bucket) { return bucket.total === 0 ? null : bucket.score / bucket.total; }

  // 多日汇总 + 联赛分布（按方向命中）
  function computeOverall(days) {
    const sum = {
      direction: { score: 0, total: 0 },
      overUnder: { score: 0, total: 0 },
      score: { score: 0, total: 0 },
      matches: 0, pending: 0, byLeague: {},
    };
    days.forEach(day => {
      const d = computeDayStats(day);
      ['direction', 'overUnder', 'score'].forEach(k => { sum[k].score += d[k].score; sum[k].total += d[k].total; });
      sum.matches += d.matches;
      sum.pending += d.pending;
      (day.matches || []).forEach(m => {
        const lg = m.league || '其他';
        if (!sum.byLeague[lg]) sum.byLeague[lg] = { score: 0, total: 0 };
        const hit = judgeDirection(m.direction, m.finalScore);
        if (hit !== null) { sum.byLeague[lg].score += hit; sum.byLeague[lg].total += 1; }
      });
    });
    return {
      days: days.length,
      matches: sum.matches,
      pending: sum.pending,
      direction: { score: sum.direction.score, total: sum.direction.total, rate: rate(sum.direction) },
      overUnder: { score: sum.overUnder.score, total: sum.overUnder.total, rate: rate(sum.overUnder) },
      score: { score: sum.score.score, total: sum.score.total, rate: rate(sum.score) },
      byLeague: Object.entries(sum.byLeague)
        .map(([league, b]) => ({ league, score: b.score, total: b.total, rate: rate(b) }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // 近 n 日方向命中率走势（日期升序，仅含有判定场次的日）
  function computeTrend(days, n) {
    return days
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(day => {
        const d = computeDayStats(day);
        return { date: day.date, hit: d.direction.score, total: d.direction.total, rate: rate(d.direction) };
      })
      .filter(p => p.total > 0)
      .slice(-(n || 14));
  }

  return { parseScore, judgeDirection, judgeOverUnder, judgeScore, computeDayStats, computeOverall, computeTrend };
});
```

- [ ] **Step 4: 运行确认通过**

Run: `cd "/c/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: 输出 `stats.test.js 全部通过 ✓`

- [ ] **Step 5: Commit**

```bash
cd "/c/Users/Administrator/Desktop/足球预测站" && git add stats.js test/stats.test.js && git commit -m "feat: 命中率统计纯函数库（TDD）"
```

---

### Task 2: 首条真实数据（2026-07-26 六场重点预测）

**Files:**
- Create: `Desktop\足球预测站\data\predictions.js`

- [ ] **Step 1: 写数据文件**

创建 `data\predictions.js`：

```js
/* data/predictions.js — 每日预测数据（唯一每日变更的文件）
   规则：新一天的对象插到数组最前（倒序）；赛后回填 finalScore/directionHit 等由页面自动判定，只需回填 finalScore 与当日 review。 */
const PREDICTION_DAYS = [
  {
    date: '2026-07-26',
    dayPillar: '丙午年·乙未月·辛丑日',
    dayNote: '丑未冲+韩K联无妄/三刑，爆冷基因重，韩K联整体降仓',
    matches: [
      { id: '周日206', league: '瑞典超', time: '20:00', home: '天狼星', away: 'IFK哥德堡',
        direction: '主胜', overUnder: '大3.25', score: ['3-0', '3-1'], confidence: 4,
        finalScore: null, note: '五式3/3一致；六壬金局助主+末传六合；哥德堡客场场均失2.86+双赛' },
      { id: '周日211', league: '瑞典超', time: '22:30', home: '盖斯', away: '哈尔姆斯塔德',
        direction: '主胜', overUnder: '小3', score: ['2-0', '2-1'], confidence: 4,
        finalScore: null, note: '盖斯主场7场仅失2球；客队连续2轮0球→破荒因子，小球降谨慎' },
      { id: '周日217', league: '巴西甲', time: '05:30+1', home: '弗拉门戈', away: '圣保罗',
        direction: '主胜', overUnder: '大2.5', score: ['2-0', '3-0'], confidence: 4,
        finalScore: null, note: '旅→大有卦；圣保罗客场场均仅0.9球；H2H均势防冷让-1谨慎' },
      { id: '周日201', league: '韩K联', time: '18:30', home: '首尔FC', away: '蔚山现代',
        direction: '主胜', overUnder: '放弃', score: ['2-1', '1-0'], confidence: 2,
        finalScore: null, note: '无妄卦+丑戌未三刑，冷门量化≥2预警，方向降一档' },
      { id: '周日205', league: '瑞典超', time: '20:00', home: '布洛马波卡纳', away: '哈马比',
        direction: '客胜', overUnder: '放弃', score: ['0-1', '1-2'], confidence: 3,
        finalScore: null, note: '哈马比客场场均仅1.0球+周中双赛，穿盘存疑' },
      { id: '周日215', league: '挪超', time: '23:00', home: '桑纳菲尤尔', away: '博德闪耀',
        direction: '客胜', overUnder: '放弃', score: ['0-2', '1-2'], confidence: 3,
        finalScore: null, note: '革卦冷门预警；主队主场场均失0.83，让+1.5谨慎' },
    ],
    plan: '底仓40%：天狼星胜×盖斯胜2串1(25)+弗拉门戈胜单关(15)；增益25%：布洛马受让+1(15)+马尔默胜(10)；大小球25%：206大3.25(15)+204小2.5(10)；比分梦想10%：天狼星3-0/盖斯2-0/弗拉门戈2-0',
    review: null,
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = PREDICTION_DAYS;
```

- [ ] **Step 2: Node  sanity 检查**

Run: `cd "/c/Users/Administrator/Desktop/足球预测站" && node -e "const d=require('./data/predictions.js');const S=require('./stats.js');const ov=S.computeOverall(d);console.log(JSON.stringify({days:ov.days,matches:ov.matches,pending:ov.pending,dirRate:ov.direction.rate}))"`
Expected: `{"days":1,"matches":6,"pending":6,"dirRate":null}`

- [ ] **Step 3: Commit**

```bash
cd "/c/Users/Administrator/Desktop/足球预测站" && git add data/predictions.js && git commit -m "data: 2026-07-26 六场重点预测（待回填）"
```

---

### Task 3: index.html 单页应用

**Files:**
- Create: `Desktop\足球预测站\index.html`

- [ ] **Step 1: 写 index.html**

创建 `index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>五式足球预测 · 每日记录</title>
<style>
  :root { --bg:#0b1220; --panel:#131c2e; --line:#24314d; --txt:#e2e8f0; --muted:#8b98ad; --cyan:#22d3ee; --gold:#f59e0b; --green:#34d399; --red:#f87171; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { background:var(--bg); color:var(--txt); font-family:"Microsoft YaHei","PingFang SC",sans-serif; padding:24px; max-width:1100px; margin:0 auto; }
  header h1 { font-size:24px; }
  .sub { color:var(--muted); font-size:13px; margin-top:6px; }
  .error { background:#7f1d1d; color:#fecaca; padding:12px 16px; border-radius:8px; margin:16px 0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin:20px 0; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; }
  .card .num { font-size:28px; font-weight:700; color:var(--cyan); }
  .card .lbl { color:var(--muted); font-size:13px; margin-top:4px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:16px; margin-bottom:16px; }
  .panel h2 { font-size:15px; margin-bottom:12px; color:var(--gold); }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { padding:7px 8px; border-bottom:1px solid var(--line); text-align:left; }
  th { color:var(--muted); font-weight:600; }
  .sec-title { margin:18px 0 12px; font-size:15px; color:var(--gold); }
  .day-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; margin-bottom:12px; overflow:hidden; }
  .day-head { padding:14px 16px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; }
  .day-head:hover { background:#182440; }
  .day-title { font-weight:700; }
  .day-meta { color:var(--muted); font-size:12px; margin-top:4px; }
  .badge { font-size:12px; padding:3px 10px; border-radius:999px; border:1px solid var(--line); }
  .badge.good { color:var(--green); border-color:var(--green); }
  .badge.pending { color:var(--gold); border-color:var(--gold); }
  .day-body { display:none; padding:0 16px 16px; }
  .day-card.open .day-body { display:block; }
  .hit { color:var(--green); } .miss { color:var(--red); } .half { color:var(--gold); } .wait { color:var(--muted); }
  .stars { color:var(--gold); }
  .plan, .review { font-size:13px; color:var(--muted); margin-top:10px; line-height:1.7; white-space:pre-wrap; }
  .plan b, .review b { color:var(--txt); }
  footer { color:var(--muted); font-size:12px; text-align:center; margin-top:24px; }
  svg text { fill:var(--muted); font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>⚽ 五式足球预测 · 每日记录</h1>
  <p class="sub" id="dataInfo">加载中…</p>
</header>
<div id="errorBanner" class="error" hidden></div>

<div class="cards" id="statCards"></div>

<div class="panel">
  <h2>近14日方向命中率走势</h2>
  <svg id="trendChart" viewBox="0 0 720 220" width="100%"></svg>
</div>

<div class="panel">
  <h2>联赛分布（方向命中）</h2>
  <table id="leagueTable"></table>
</div>

<h2 class="sec-title">每日记录</h2>
<div id="dailyList"></div>

<footer>⚠️ 仅供娱乐参考，不构成投资建议 · 数据由 AI 每日维护</footer>

<script src="data/predictions.js"></script>
<script src="stats.js"></script>
<script>
(function () {
  var banner = document.getElementById('errorBanner');
  if (typeof PREDICTION_DAYS === 'undefined' || !Array.isArray(PREDICTION_DAYS)) {
    banner.hidden = false;
    banner.textContent = '⚠️ 数据文件 data/predictions.js 缺失或格式错误，请检查后刷新。';
    document.getElementById('dataInfo').textContent = '数据加载失败';
    return;
  }
  var days = PREDICTION_DAYS;
  document.getElementById('dataInfo').textContent =
    '共 ' + days.length + ' 天记录 · 最新：' + (days[0] ? days[0].date : '—');

  function pct(r) { return r === null ? '—' : Math.round(r * 100) + '%'; }
  function frac(b) { return b.score + '/' + b.total; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---- 仪表盘卡片 ----
  var ov = StatsLib.computeOverall(days);
  function card(num, lbl) { return '<div class="card"><div class="num">' + num + '</div><div class="lbl">' + lbl + '</div></div>'; }
  document.getElementById('statCards').innerHTML =
    card(pct(ov.direction.rate), '方向命中率（' + frac(ov.direction) + '）') +
    card(pct(ov.overUnder.rate), '大小球命中率（' + frac(ov.overUnder) + '）') +
    card(pct(ov.score.rate), '比分命中率（' + frac(ov.score) + '）') +
    card(ov.matches, '总场次（待回填 ' + ov.pending + '）');

  // ---- 近14日走势 ----
  renderTrend(StatsLib.computeTrend(days, 14));
  function renderTrend(points) {
    var svg = document.getElementById('trendChart');
    if (points.length < 2) { svg.innerHTML = '<text x="20" y="110">复盘满 2 天后显示走势</text>'; return; }
    var W = 720, H = 220, padL = 40, padR = 16, padT = 16, padB = 34;
    var iw = W - padL - padR, ih = H - padT - padB;
    function x(i) { return padL + iw * i / (points.length - 1); }
    function y(r) { return padT + ih * (1 - r); }
    var html = '';
    [0, 0.5, 1].forEach(function (g) {
      html += '<line x1="' + padL + '" y1="' + y(g) + '" x2="' + (W - padR) + '" y2="' + y(g) + '" stroke="#24314d" stroke-dasharray="4"/>' +
              '<text x="6" y="' + (y(g) + 4) + '">' + Math.round(g * 100) + '%</text>';
    });
    html += '<polyline points="' + points.map(function (p, i) { return x(i) + ',' + y(p.rate); }).join(' ') +
            '" fill="none" stroke="#22d3ee" stroke-width="2"/>';
    points.forEach(function (p, i) {
      html += '<circle cx="' + x(i) + '" cy="' + y(p.rate) + '" r="4" fill="#22d3ee"/>' +
              '<text x="' + (x(i) - 14) + '" y="' + (y(p.rate) - 10) + '">' + Math.round(p.rate * 100) + '%</text>' +
              '<text x="' + (x(i) - 22) + '" y="' + (H - 10) + '">' + p.date.slice(5) + '</text>';
    });
    svg.innerHTML = html;
  }

  // ---- 联赛分布 ----
  var lt = document.getElementById('leagueTable');
  if (ov.byLeague.length === 0) {
    lt.innerHTML = '<tr><td class="wait">暂无已复盘场次</td></tr>';
  } else {
    lt.innerHTML = '<tr><th>联赛</th><th>命中/场次</th><th>命中率</th></tr>' + ov.byLeague.map(function (l) {
      return '<tr><td>' + esc(l.league) + '</td><td>' + l.score + '/' + l.total + '</td><td>' + pct(l.rate) + '</td></tr>';
    }).join('');
  }

  // ---- 每日记录 ----
  var list = document.getElementById('dailyList');
  if (days.length === 0) {
    list.innerHTML = '<div class="panel wait">暂无记录，等待首次预测写入。</div>';
    return;
  }
  list.innerHTML = days.map(dayCard).join('');
  Array.prototype.forEach.call(document.querySelectorAll('.day-head'), function (el) {
    el.addEventListener('click', function () { el.parentElement.classList.toggle('open'); });
  });

  function dayCard(day) {
    var ds = StatsLib.computeDayStats(day);
    var badge = ds.pending > 0
      ? '<span class="badge pending">待回填 ' + ds.pending + ' 场</span>'
      : '<span class="badge good">方向 ' + ds.direction.score + '/' + ds.direction.total + '</span>';
    return '<div class="day-card">' +
      '<div class="day-head"><div><div class="day-title">' + esc(day.date) + '</div>' +
      '<div class="day-meta">' + esc(day.dayPillar || '') + (day.dayNote ? ' · ' + esc(day.dayNote) : '') + ' · ' + ds.matches + ' 场</div></div>' +
      badge + '</div>' +
      '<div class="day-body">' + matchTable(day) +
      (day.plan ? '<div class="plan"><b>投资方案：</b>' + esc(day.plan) + '</div>' : '') +
      (day.review ? '<div class="review"><b>复盘结论：</b>' + esc(day.review) + '</div>' : '') +
      '</div></div>';
  }

  function mark(v) {
    if (v === null) return '<span class="wait">—</span>';
    if (v === 1) return '<span class="hit">✅</span>';
    if (v === 0.5) return '<span class="half">半✅</span>';
    return '<span class="miss">❌</span>';
  }

  function matchTable(day) {
    var rows = day.matches.map(function (m) {
      var pending = !m.finalScore;
      var judge = pending ? '<span class="wait">—</span>'
        : mark(StatsLib.judgeDirection(m.direction, m.finalScore)) + ' ' +
          mark(StatsLib.judgeOverUnder(m.overUnder, m.finalScore)) + ' ' +
          mark(StatsLib.judgeScore(m.score, m.finalScore));
      return '<tr><td>' + esc(m.id) + '</td><td>' + esc(m.league) + ' ' + esc(m.time) + '</td>' +
        '<td>' + esc(m.home) + ' vs ' + esc(m.away) + '</td>' +
        '<td>' + esc(m.direction) + ' / ' + esc(m.overUnder) + ' / ' + esc((m.score || []).join(' ')) +
        ' <span class="stars">' + '★'.repeat(m.confidence || 0) + '</span></td>' +
        '<td>' + (pending ? '<span class="wait">待回填</span>' : esc(m.finalScore)) + '</td>' +
        '<td>' + judge + '</td></tr>';
    }).join('');
    return '<table><tr><th>编号</th><th>联赛/时间</th><th>对阵</th><th>预测（方向/大小/比分）</th><th>赛果</th><th>判定（方向/大小/比分）</th></tr>' + rows + '</table>';
  }
})();
</script>
</body>
</html>
```

- [ ] **Step 2: 注入一天已复盘假数据，浏览器验证完整渲染**

在 `data\predictions.js` 数组**末尾**临时追加（验证后要删）：

```js
,
  {
    date: '2026-07-25',
    dayPillar: '丙午年·乙未月·庚子日',
    dayNote: '测试用假数据',
    matches: [
      { id: '测试01', league: '瑞典超', time: '20:00', home: '甲队', away: '乙队',
        direction: '主胜', overUnder: '大2.5', score: ['3-0'], confidence: 3, finalScore: '3-0', note: '全中样例' },
      { id: '测试02', league: '韩K联', time: '18:30', home: '丙队', away: '丁队',
        direction: '主胜', overUnder: '小2.5', score: ['1-0'], confidence: 2, finalScore: '0-1', note: '方向错/大小中样例' },
    ],
    plan: '测试方案', review: '测试复盘结论。',
  }
```

用浏览器打开 `index.html`（`start "" "C:\Users\Administrator\Desktop\足球预测站\index.html"`），人工核对：
- 仪表盘：方向命中率 33%（1/3）、大小球 100%（2/2）、比分 50%（1/2）、总场次 8、待回填 6
- 走势：2 个点（07-25 100%、07-26 0%）
- 联赛表：瑞典超 2/2=100%、韩K联 0/1=0%
- 每日记录：07-25 卡显示"方向 1/2"绿徽章，展开有 ✅/❌/复盘结论；07-26 卡显示"待回填 6 场"金徽章
- 假数据判定行：测试01 三个 ✅；测试02 ❌✅❌

- [ ] **Step 3: 删除假数据并确认还原**

从 `data\predictions.js` 删除 Step 2 注入的假日期对象（含前导逗号），然后：

Run: `cd "/c/Users/Administrator/Desktop/足球预测站" && git diff --stat data/predictions.js`
Expected: 无输出（与上次提交一致，证明已还原）；浏览器刷新确认恢复"待回填 6 场"

- [ ] **Step 4: Commit**

```bash
cd "/c/Users/Administrator/Desktop/足球预测站" && git add index.html && git commit -m "feat: 单页应用（仪表盘+走势+联赛分布+每日记录）"
```

---

### Task 4: README 与最终验证

**Files:**
- Create: `Desktop\足球预测站\README.md`

- [ ] **Step 1: 写 README（每日更新工作流）**

创建 `README.md`：

```markdown
# 五式足球预测 · 每日记录站

零依赖静态网站：双击 `index.html` 即可查看（无需服务器、无需联网）。

## 文件说明
- `index.html` — 页面（代码，稳定不改）
- `stats.js` — 命中率统计逻辑（改判定规则才动）
- `data/predictions.js` — **每天唯一需要改的文件**
- `test/stats.test.js` — 统计逻辑测试：`node test/stats.test.js`

## 每日工作流（AI 执行）
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）
2. 赛后复盘：只需给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`；命中判定与统计由页面自动完成
3. 提交：`git add data/predictions.js && git commit -m "data: YYYY-MM-DD 预测/复盘"`

## 判定规则
- 方向：预测主/平/客胜与实际一致 = ✅
- 大小球：全中✅，半中（赢/输一半）半✅计0.5，走水不计入
- 比分：命中预测数组任一 = ✅
- `放弃` / 未回填场次的项不计入统计
```

- [ ] **Step 2: Commit**

```bash
cd "/c/Users/Administrator/Desktop/足球预测站" && git add README.md && git commit -m "docs: README 每日更新工作流"
```

- [ ] **Step 3: 最终验证清单**

- `node test/stats.test.js` → `全部通过 ✓`
- 浏览器打开 `index.html` → 显示 1 天记录、6 场待回填、无红色错误横幅
- `git log --oneline` → 5 条提交（spec/stats/data/index/README）

---

## Self-Review 记录

- **Spec 覆盖**：架构（T1-T3）、数据模型（T2）、三区块（T3）、工作流（T4 README）、错误处理（T3 errorBanner/空数据/待回填）、测试（T1+T3 Step2 对拍清单）、首条数据（T2）、git（T0）——全覆盖
- **Placeholder 扫描**：无 TBD；所有代码完整给出
- **类型一致性**：`judgeDirection/judgeOverUnder/judgeScore` 返回 1/0.5/0/null 在 T1 定义、T3 的 `mark()` 中一致消费；`computeDayStats` 返回 `{direction,overUnder,score,pending,matches}` 在 T1 测试与 T3 `dayCard` 中字段名一致；数据文件字段（id/league/time/home/away/direction/overUnder/score/confidence/finalScore/note/plan/review/dayPillar/dayNote）与 T3 渲染字段一致
