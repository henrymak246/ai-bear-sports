# 方案层命中率统计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给首页方案块（plan[]）追踪红黑结果，新增「方案层命中」汇总面板，按 6 类方案统计命中率。

**Architecture:** 数据侧 `plan[]` 每项加可选 `result` 字段（复盘手动回填）；`stats.js` 新增纯函数 `planTypeOf()`/`planStats()` 负责归组与统计；`index.html` 新增面板渲染 + 方块/弹窗结果徽标。规格见 `docs/superpowers/specs/2026-07-27-plan-layer-hitrate-design.md`。

**Tech Stack:** 零依赖静态站点（原生 HTML/CSS/JS），Node 对拍测试（`node test/stats.test.js`），无构建步骤。

**项目根目录：** `C:/Users/Administrator/Desktop/足球预测站`

**关键背景（执行者需知）：**
- `stats.js` 是 UMD 纯函数库：浏览器挂 `StatsLib`，Node `require` 直接用；新增函数必须加进末尾的 return 导出列表
- `index.html` 全部渲染逻辑在文件底部一个 IIFE `<script>` 里，字符串拼 HTML，辅助函数 `esc()`（转义）、`pct()`（率→百分比）
- 数据数组 `PREDICTION_DAYS` 倒序（最新在前）；`market` 缺省按 `'jc'`
- 现有 `.dot`/`.dot.red`/`.dot.black` 是 11px 圆点样式，直接复用
- `dist/` 在 `.gitignore` 里、是 Cloudflare 本地发布包，不提交，但最后要同步刷新
- git 提交信息沿用现有风格（`feat:` / `data:` / `docs:` 前缀 + 中文描述）；**`git push` 不在本计划内，由用户确认后另行执行**

---

### Task 1: stats.js — planTypeOf + planStats（TDD）

**Files:**
- Modify: `stats.js`（在 `computeTrend` 之后、return 导出之前插入新函数；导出列表追加）
- Test: `test/stats.test.js`（在 `console.log` 之前追加用例）

- [ ] **Step 1: 先写失败测试**

在 `test/stats.test.js` 末尾 `console.log('stats.test.js 全部通过 ✓');` 之前插入：

```js
// ---- planTypeOf：方案块归 6 类 ----
assert.strictEqual(S.planTypeOf('std', '🔵 亚洲让球'), '亚洲让球');
assert.strictEqual(S.planTypeOf('std', '🟣 大小盘'), '大小盘');
assert.strictEqual(S.planTypeOf('jc', '🎯 胜平负'), '胜平负');
assert.strictEqual(S.planTypeOf('jc', '🟢 让球+胜平负 · 底仓'), '胜平负');
assert.strictEqual(S.planTypeOf(undefined, '🎯 胜平负'), '胜平负'); // market 缺省按 jc
assert.strictEqual(S.planTypeOf('jc', '⚽ 进球数'), '进球数');
assert.strictEqual(S.planTypeOf('jc', '🏅 比分'), '比分');
assert.strictEqual(S.planTypeOf('jc', '🎯 过关专栏'), '过关串关');
assert.strictEqual(S.planTypeOf('jc', '6串1 娱乐'), '过关串关');

// ---- planStats：半红0.5 / 走水不计 / 未回填不计 / 固定6类顺序 ----
const planDays = [
  { date: '2026-07-27', plan: [
    { market: 'jc', name: '🎯 胜平负', result: 'hit' },
    { market: 'std', name: '🟣 大小盘', result: 'push' },
    { market: 'jc', name: '⚽ 进球数' }, // 未回填 result，不计入
  ]},
  { date: '2026-07-26', plan: [
    { market: 'jc', name: '🟢 让球+胜平负 · 底仓', result: 'half' },
    { market: 'jc', name: '🟡 让球+单关 · 增益', result: 'miss' },
    { market: 'jc', name: '🔴 比分 · 梦想', result: 'miss' },
    { market: 'std', name: '🔵 亚洲让球', result: 'hit' },
  ]},
];
const ps = S.planStats(planDays);
assert.deepStrictEqual(ps.map(function (s) { return s.type; }),
  ['胜平负', '进球数', '比分', '过关串关', '亚洲让球', '大小盘']);
const spf = ps[0]; // 胜平负：hit1 + half1 + miss1
assert.strictEqual(spf.hit, 1);
assert.strictEqual(spf.half, 1);
assert.strictEqual(spf.miss, 1);
assert.strictEqual(spf.push, 0);
assert.strictEqual(spf.total, 3);
assert.ok(Math.abs(spf.rate - 1.5 / 3) < 1e-9);
assert.deepStrictEqual(spf.last14.map(function (p) { return p.date; }),
  ['2026-07-26', '2026-07-26', '2026-07-27']); // 日期升序
assert.deepStrictEqual(spf.last14.map(function (p) { return p.result; }),
  ['half', 'miss', 'hit']);
const daxiao = ps.find(function (s) { return s.type === '大小盘'; });
assert.strictEqual(daxiao.push, 1);
assert.strictEqual(daxiao.total, 0);   // 走水不计入分母
assert.strictEqual(daxiao.rate, null);
assert.strictEqual(ps.find(function (s) { return s.type === '进球数'; }).total, 0); // 未回填不计
assert.strictEqual(ps.find(function (s) { return s.type === '亚洲让球'; }).rate, 1);
assert.doesNotThrow(function () { S.planStats([{ date: '2026-07-25' }]); }); // 无 plan 字段不报错
assert.doesNotThrow(function () { S.planStats([]); });
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: FAIL，`TypeError: S.planTypeOf is not a function`

- [ ] **Step 3: 实现 planTypeOf + planStats**

在 `stats.js` 的 `computeTrend` 函数之后（`return { parseScore, ...` 之前）插入：

```js
  // ---- 方案层命中统计 ----
  // 6 类固定顺序；归组规则（自上而下优先）：
  //   std 盘：名称含「大小」→ 大小盘，其余 → 亚洲让球
  //   竞彩（market 缺省按 jc）：含「比分」→ 比分；含「进球」→ 进球数；含「过关/串」→ 过关串关；其余 → 胜平负
  var PLAN_TYPES = ['胜平负', '进球数', '比分', '过关串关', '亚洲让球', '大小盘'];

  function planTypeOf(market, name) {
    var m = market || 'jc';
    var n = String(name || '');
    if (m === 'std') return n.indexOf('大小') !== -1 ? '大小盘' : '亚洲让球';
    if (n.indexOf('比分') !== -1) return '比分';
    if (n.indexOf('进球') !== -1) return '进球数';
    if (n.indexOf('过关') !== -1 || n.indexOf('串') !== -1) return '过关串关';
    return '胜平负';
  }

  // 汇总每天 plan[] 的 result（hit/half/miss/push，缺省不计）：
  // total=hit+half+miss（走水 push 不计入分母）；rate=(hit+0.5*half)/total，total=0 时为 null
  // last14：已回填块按日期升序、最多 14 条，供面板画迷你圆点
  function planStats(days) {
    var acc = {};
    PLAN_TYPES.forEach(function (t) {
      acc[t] = { hit: 0, half: 0, miss: 0, push: 0, blocks: [] };
    });
    (days || []).forEach(function (day) {
      (Array.isArray(day.plan) ? day.plan : []).forEach(function (p) {
        if (!p || ['hit', 'half', 'miss', 'push'].indexOf(p.result) === -1) return;
        var type = planTypeOf(p.market, p.name);
        acc[type][p.result] += 1;
        acc[type].blocks.push({ date: day.date, result: p.result });
      });
    });
    return PLAN_TYPES.map(function (t) {
      var b = acc[t];
      var total = b.hit + b.half + b.miss;
      var blocks = b.blocks.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
      return {
        type: t,
        hit: b.hit, half: b.half, miss: b.miss, push: b.push,
        total: total,
        rate: total === 0 ? null : (b.hit + 0.5 * b.half) / total,
        last14: blocks.slice(-14),
      };
    });
  }
```

同时把 return 导出列表改为：

```js
  return { parseScore, judgeDirection, judgeOverUnder, judgeScore, computeDayStats, computeOverall, computeTrend, planTypeOf, planStats };
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: 输出 `stats.test.js 全部通过 ✓`

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add stats.js test/stats.test.js
git commit -m "feat: stats.js 新增 planTypeOf/planStats 方案层命中统计（含测试）"
```

---

### Task 2: index.html — 「方案层命中」汇总面板

**Files:**
- Modify: `index.html`（CSS 区、main 区 HTML、底部 IIFE 各一处）

- [ ] **Step 1: 加面板 HTML**

找到（index.html 约 216 行）：

```html
    <div class="cards" id="statCards"></div>
    <div id="planBlocks"></div>
```

在 `<div id="planBlocks"></div>` 之后插入：

```html

    <div class="panel" id="planStatsPanel">
      <h2>🎯 方案层命中<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:8px">按方案类型累计 · 半红计0.5 · 走水不计</span></h2>
      <div id="planStatsBody"></div>
    </div>
```

- [ ] **Step 2: 加 CSS**

找到（约 53-54 行）：

```css
  .dot.red { background:var(--coral); }
  .dot.black { background:#3A3A3A; }
```

在其后插入：

```css
  .dot.half { background:var(--honey); }
  .dot.push { background:var(--muted); }
```

再找到（约 157 行）：

```css
  .panel h2 { font-size:15px; margin-bottom:12px; color:var(--brown); }
```

在其后插入：

```css
  .ps-row { display:flex; align-items:center; gap:10px; padding:7px 2px; border-bottom:1px dashed var(--line); font-size:13px; }
  .ps-row:last-child { border-bottom:none; }
  .ps-name { width:76px; flex:none; font-weight:700; color:var(--brown); }
  .ps-cnt { flex:1; color:var(--brown-soft); font-size:12.5px; }
  .ps-cnt .r { color:var(--coral); font-weight:700; }
  .ps-cnt .b { color:#3A3A3A; font-weight:700; }
  .ps-cnt .h { color:var(--honey-dark); font-weight:700; }
  .ps-cnt .p { color:var(--muted); }
  .ps-dots { display:flex; gap:4px; flex-wrap:wrap; }
  .ps-rate { width:64px; flex:none; text-align:right; font-weight:800; color:var(--honey-dark); }
  .ps-rate.na { color:var(--muted); font-weight:400; font-size:11.5px; }
```

- [ ] **Step 3: 加渲染函数**

在底部 IIFE 中找到这一行（约 399 行）：

```js
  // ---- 小熊成绩单 ----
```

在其**之前**插入：

```js
  // ---- 方案层命中面板（6类固定顺序；样本<3 显示「样本不足」） ----
  renderPlanStats(days);
  function renderPlanStats(days) {
    var body = document.getElementById('planStatsBody');
    var stats = StatsLib.planStats(days);
    var any = stats.some(function (s) { return s.total > 0 || s.push > 0; });
    if (!any) {
      body.innerHTML = '<div class="wait" style="font-size:12.5px">方案复盘回填后，这里会出现每层命中统计 🐾</div>';
      return;
    }
    body.innerHTML = stats.map(function (s) {
      var cnt = (s.total === 0 && s.push === 0)
        ? '<span class="wait">暂无数据</span>'
        : '<span class="r">' + s.hit + '红</span> <span class="b">' + s.miss + '黑</span>' +
          (s.half > 0 ? ' <span class="h">' + s.half + '半</span>' : '') +
          (s.push > 0 ? ' <span class="p">' + s.push + '走水</span>' : '');
      var enough = s.total >= 3;
      var rateTxt = enough ? Math.round(s.rate * 100) + '%' : (s.total === 0 ? '—' : '样本不足');
      var dots = s.last14.map(function (p) {
        var cls = p.result === 'hit' ? 'red' : p.result === 'miss' ? 'black' : p.result === 'half' ? 'half' : 'push';
        return '<span class="dot ' + cls + '" title="' + esc(p.date) + '"></span>';
      }).join('');
      return '<div class="ps-row"><span class="ps-name">' + s.type + '</span>' +
        '<span class="ps-cnt">' + cnt + '</span><span class="ps-dots">' + dots + '</span>' +
        '<span class="ps-rate' + (enough ? '' : ' na') + '">' + rateTxt + '</span></div>';
    }).join('');
  }

```

- [ ] **Step 4: 验证**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: 仍输出 `stats.test.js 全部通过 ✓`（index.html 改动不影响测试，此步防手滑）

再肉眼核对插入位置：面板在 `#planBlocks` 之后、`📈 近14日方向命中率` 面板之前；JS 插入点在 IIFE 内、`esc()` 定义之后（`esc` 与 `StatsLib` 均可直接用）。

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 主区新增「方案层命中」汇总面板（6类计数+命中率+近14日圆点）"
```

---

### Task 3: index.html — 方案块结果徽标（方块 / 日卡 mini-tier / 详解弹窗）

**Files:**
- Modify: `index.html`（底部 IIFE 三处渲染点 + 一个辅助函数）

- [ ] **Step 1: 加辅助函数 planBadge**

在 IIFE 中找到（约 252-253 行）：

```js
  function pct(r) { return r === null ? '—' : Math.round(r * 100) + '%'; }
```

在其后插入：

```js
  function planBadge(t) {
    var map = { hit: ' 🔴', miss: ' ⚫', half: ' 🌗', push: ' ➖' };
    return (t && t.result && map[t.result]) || '';
  }
```

- [ ] **Step 2: 首页方案方块加徽标**

找到 `buildPlanBody` 里这行（约 331 行）：

```js
            '<div class="pb-head">' + esc(x.t.name) + '</div>' +
```

改为：

```js
            '<div class="pb-head">' + esc(x.t.name) + planBadge(x.t) + '</div>' +
```

- [ ] **Step 3: 详解弹窗标题加徽标**

找到 `renderPlanModals` 里这行（约 367 行）：

```js
          '<h3>' + esc(t.name) + '<span class="m-pct">' + esc(t.pct) + '</span><span class="m-date">' + esc(day.date) + ' · ' + ((t.market || 'jc') === 'std' ? '标准盘' : '竞彩') + '</span></h3>' +
```

改为：

```js
          '<h3>' + esc(t.name) + planBadge(t) + '<span class="m-pct">' + esc(t.pct) + '</span><span class="m-date">' + esc(day.date) + ' · ' + ((t.market || 'jc') === 'std' ? '标准盘' : '竞彩') + '</span></h3>' +
```

- [ ] **Step 4: 日卡 mini-tier 加徽标**

找到 `dayCard` 里这行（约 462 行）：

```js
            '<b>' + ((t.market || 'jc') === 'std' ? '📊 ' : '🇨🇳 ') + esc(t.name) + ' ' + esc(t.pct) + '</b><br>' + esc(t.text) + '</div></a>';
```

改为：

```js
            '<b>' + ((t.market || 'jc') === 'std' ? '📊 ' : '🇨🇳 ') + esc(t.name) + ' ' + esc(t.pct) + planBadge(t) + '</b><br>' + esc(t.text) + '</div></a>';
```

- [ ] **Step 5: 验证**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js`
Expected: `stats.test.js 全部通过 ✓`

grep 核对三处 `planBadge(` 调用都在：

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && grep -n "planBadge" index.html`
Expected: 4 行（1 处定义 + 3 处调用）

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 方案方块/日卡/详解弹窗显示结果徽标（🔴⚫🌗➖）"
```

---

### Task 4: 数据回填（7/26 result）+ README 同步 + dist 刷新

**Files:**
- Modify: `data/predictions.js`（2026-07-26 的 6 个 plan 项）
- Modify: `README.md`（数据格式要点 + 每日工作流 + 判定规则）
- 本地刷新: `dist/`（.gitignore 内，不提交）

回填依据（来自 7/26 当日 review）：
- 底仓：206让胜✓(4-1净胜3) / 211让胜✗(1-1) / 212马尔默✗(1-2) → 部分红 `half`
- 增益：205布洛马+1让胜✓(1-1) / 209布兰✗ → `half`
- 比分·梦想：3 个比分全黑 → `miss`
- 亚洲让球：布洛马+1.25 全赢✓ / 桑纳菲+1.5 全黑✗(0-3) → `half`
- 大小盘：206大✓(5球) / 204小✗(3球) → `half`
- 过关专栏：三胆2/3，串关错一即黑 → `miss`

- [ ] **Step 1: 回填 6 个 result**

在 `data/predictions.js` 中做 6 处编辑（都在 2026-07-26 对象的 plan 数组里，注意别改到 7/27）：

① 找 `{ market: 'jc', name: '🟢 让球+胜平负 · 底仓', pct: '40%',`
   改为 `{ market: 'jc', name: '🟢 让球+胜平负 · 底仓', pct: '40%', result: 'half',`

② 找 `{ market: 'jc', name: '🟡 让球+单关 · 增益', pct: '25%',`
   改为 `{ market: 'jc', name: '🟡 让球+单关 · 增益', pct: '25%', result: 'half',`

③ 找 `{ market: 'jc', name: '🔴 比分 · 梦想', pct: '10%',`
   改为 `{ market: 'jc', name: '🔴 比分 · 梦想', pct: '10%', result: 'miss',`

④ 找 `{ market: 'std', name: '🔵 亚洲让球', pct: '10%',`
   改为 `{ market: 'std', name: '🔵 亚洲让球', pct: '10%', result: 'half',`

⑤ 找 `{ market: 'std', name: '🟣 大小盘', pct: '15%',`
   改为 `{ market: 'std', name: '🟣 大小盘', pct: '15%', result: 'half',`

⑥ 找 `{ market: 'jc', name: '🎯 过关专栏', pct: '3胆6关',`
   改为 `{ market: 'jc', name: '🎯 过关专栏', pct: '3胆6关', result: 'miss',`

注意：④ 的锚串在文件里只出现一次（7/27 的亚洲让球行是 `pct: '10%', text: '202 罗森博格…'` 但 name 同为 `'🔵 亚洲让球'`——检查确认 7/27 行写法为 `{ market: 'std', name: '🔵 亚洲让球', pct: '10%', text: '202 罗森博格 -0.75（1.85）（6份）'`，与 7/26 行 `{ market: 'std', name: '🔵 亚洲让球', pct: '10%', text: '205 布洛马波卡纳+1.25（6份）；215 桑纳菲尤尔+1.5（4份）'`，`pct: '10%',` 之后 text 不同，因此锚串必须带上 text 前缀区分：④ 用 `{ market: 'std', name: '🔵 亚洲让球', pct: '10%', text: '205 布洛马` 作为锚。⑤⑥ 同理唯一。编辑前先 Read 确认。

- [ ] **Step 2: 验证回填后统计口径**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node -e "const d=require('./data/predictions.js');const S=require('./stats.js');const ps=S.planStats(d);ps.forEach(s=>console.log(s.type, s.hit+'红'+s.miss+'黑'+s.half+'半'+s.push+'走', 'total='+s.total, 'rate='+(s.rate===null?'null':s.rate.toFixed(3))));"`

Expected 输出（7/27 未回填，全部来自 7/26）：

```
胜平负 0红0黑2半0走 total=2 rate=0.500
进球数 0红0黑0半0走 total=0 rate=null
比分 0红1黑0半0走 total=1 rate=0.000
过关串关 0红1黑0半0走 total=1 rate=0.000
亚洲让球 0红0黑1半0走 total=1 rate=0.500
大小盘 0红0黑1半0走 total=1 rate=0.500
```

（注：胜平负类只含底仓+增益两块；过关专栏归「过关串关」类单独计，不重复计入胜平负。）

- [ ] **Step 3: README 同步**

在 `README.md` 做三处编辑：

① 「每日工作流（AI 执行）」第 2 条：

找 `2. 赛后复盘：只需给每场填 \`finalScore\`（如 \`"3-1"\`）、给当日填 \`review\`；命中判定与统计由页面自动完成`

改为 `2. 赛后复盘：给每场填 \`finalScore\`（如 \`"3-1"\`）、给当日填 \`review\`、给每个方案块填 \`result\`（hit/miss/half/push）；命中判定与统计由页面自动完成`

② 「数据格式要点」plan 注释行：

找 `    { market: 'std', name: '🟣 大小盘', pct: '10%', text: '…' },`

在其后插入一行：

```
    // result: 'hit'|'miss'|'half'|'push'（可选）：复盘回填该块整体战果；半红计0.5、走水与未回填不计入「方案层命中」统计
```

③ 「判定规则」末尾追加一行：

找 `` - `放弃` / 未回填场次的项不计入统计 ``

在其后插入：

```
- 方案块：块内全红=hit、全黑=miss、部分红=half、全部走水=push；判定依据写入当日 review
```

- [ ] **Step 4: 刷新 dist 发布包（本地，不提交）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
cp index.html dist/index.html
cp stats.js dist/stats.js
cp data/predictions.js dist/data/predictions.js
```

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add data/predictions.js README.md
git commit -m "data: 0726 方案块 result 回填（2半1黑/1黑/1半/1半）+ README 同步方案层口径"
```

- [ ] **Step 6: 最终验证**

Run: `cd "C:/Users/Administrator/Desktop/足球预测站" && node test/stats.test.js && git status --short && git log --oneline -5`
Expected: 测试通过；工作区干净；最新 4 个提交为本计划的 feat/data 提交（再往前是 `5a5ea1b` 设计文档提交）

请用户双击 `index.html` 或访问 https://henrymak246.github.io/ai-bear-sports/ （push 后）目检：主区出现「🎯 方案层命中」面板、7/26 方块带徽标。**push 需用户确认后执行。**

---

## Self-Review 记录

- 规格覆盖：① result 字段 → Task 4；② planTypeOf/planStats → Task 1；③ 面板+徽标+样本不足 → Task 2/3；④ 测试+回填+README → Task 1/4。last14 由规格「每日对象」细化为「逐块 {date, result}」——块级圆点更直观且与块级回填粒度一致
- 占位符：无 TBD/TODO，所有代码完整
- 类型一致：`planStats` 返回数组元素 `{type, hit, half, miss, push, total, rate, last14:[{date,result}]}`，Task 2 UI 消费字段完全一致；`planBadge` 读取 `t.result` 与 Task 4 回填值域一致（hit/half/miss/push）
