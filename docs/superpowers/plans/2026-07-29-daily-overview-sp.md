# 每日预测总览置顶 + SP 标记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「每日预测记录」移到主区最顶并改名「每日预测总览」（当日默认展开），明细表加 SP（胜/平/负）列且预测方向对应项高亮。

**Architecture:** 纯前端壳改动（index.html 布局移位 + matchTable 加列 + 3 条 CSS）；数据侧仅新增可选字段 `sp`/`spHandicap`（predictions.js 逐步回填，README 工作流记录）。不动 stats.js、不动门控。规格：`docs/superpowers/specs/2026-07-29-daily-overview-sp-design.md`。

**Tech Stack:** 原生 HTML/CSS/JS（index.html 单文件）。

---

### Task 1: index.html — 置顶 + 改名 + 默认展开 + SP 列

**Files:**
- Modify: `index.html`（布局移位、matchTable、dayCard、CSS）

- [ ] **Step 1: 布局移位 + 改名**

现状（`index.html:270-291` 区域）：`<main>` 内依次是 `#statCards`、`#planBlocks`、三个统计面板，最后是：

```html
    <h2 class="sec-title">📅 每日预测记录</h2>
    <div id="dailyList"></div>
```

把这两行**剪切**，粘贴为 `<main>` 的第一个子元素（`<div class="cards" id="statCards"></div>` 之前），标题改名：

```html
    <h2 class="sec-title">📊 每日预测总览</h2>
    <div id="dailyList"></div>
```

即 `<main>` 起始变为：

```html
  <main>
    <h2 class="sec-title">📊 每日预测总览</h2>
    <div id="dailyList"></div>
    <div class="cards" id="statCards"></div>
    <div id="planBlocks"></div>
```

底部不再保留这两行（其余面板原样不动）。

- [ ] **Step 2: 当日（days[0]）默认展开**

现状（约 758 行）：

```js
  list.innerHTML = days.map(dayCard).join('');
```

改为：

```js
  list.innerHTML = days.map(function (d, i) { return dayCard(d, i === 0); }).join('');
```

现状（约 763 行）：

```js
  function dayCard(day) {
```

改为：

```js
  function dayCard(day, isToday) {
```

dayCard 内 return 首行（约 775 行）：

```js
    return '<div class="day-card" id="day-' + esc(day.date) + '">' +
```

改为：

```js
    return '<div class="day-card' + (isToday ? ' open' : '') + '" id="day-' + esc(day.date) + '">' +
```

- [ ] **Step 3: matchTable 加 SP 列**

现状 matchTable（约 794-809 行）的 rows map 开头：

```js
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
```

改为（SP 列插在「预测」与「赛果」之间）：

```js
  function matchTable(day) {
    var rows = day.matches.map(function (m) {
      var pending = !m.finalScore;
      var judge = pending ? '<span class="wait">—</span>'
        : mark(StatsLib.judgeDirection(m.direction, m.finalScore)) + ' ' +
          mark(StatsLib.judgeOverUnder(m.overUnder, m.finalScore)) + ' ' +
          mark(StatsLib.judgeScore(m.score, m.finalScore));
      var spCell = '<span class="wait">—</span>';
      if (Array.isArray(m.sp) && m.sp.length === 3) {
        var hotIdx = m.direction === '主胜' ? 0 : m.direction === '平' ? 1 : m.direction === '客胜' ? 2 : -1;
        var spTxt = m.sp.map(function (v, i) {
          return i === hotIdx ? '<b class="sp-hot">' + esc(v) + '</b>' : esc(v);
        }).join(' / ');
        spCell = (m.spHandicap ? '<span class="sp-hcp">让' + esc(m.spHandicap) + '</span>' : '') + '<span class="sp">' + spTxt + '</span>';
      }
      return '<tr><td>' + esc(m.id) + '</td><td>' + esc(m.league) + ' ' + esc(m.time) + '</td>' +
        '<td>' + esc(m.home) + ' vs ' + esc(m.away) + '</td>' +
        '<td>' + esc(m.direction) + ' / ' + esc(m.overUnder) + ' / ' + esc((m.score || []).join(' ')) +
        ' <span class="stars">' + '★'.repeat(m.confidence || 0) + '</span></td>' +
        '<td>' + spCell + '</td>' +
        '<td>' + (pending ? '<span class="wait">待回填</span>' : esc(m.finalScore)) + '</td>' +
        '<td>' + judge + '</td></tr>';
    }).join('');
    return '<table><tr><th>编号</th><th>联赛/时间</th><th>对阵</th><th>预测（方向/大小/比分）</th><th>SP（胜/平/负）</th><th>赛果</th><th>判定（方向/大小/比分）</th></tr>' + rows + '</table>';
  }
```

- [ ] **Step 4: CSS 三条**

在 `.day-card.open .day-body { display:block; }`（约 193 行）之后追加：

```css
  .sp { font-variant-numeric: tabular-nums; color:var(--brown-soft); }
  .sp-hot { color:var(--honey-dark); font-weight:800; }
  .sp-hcp { display:inline-block; margin-right:4px; font-size:11px; color:var(--muted); }
```

- [ ] **Step 5: 验证**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
node test/stats.test.js
node -e "const fs=require('fs');const h=fs.readFileSync('index.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/g);const s=m[m.length-1].replace(/<\/?script>/g,'');new Function(s);console.log('inline script syntax OK')"
grep -n "每日预测总览\|sp-hot\|isToday" index.html | head -6
grep -c "dailyList" index.html
```

Expected: 测试全绿；`inline script syntax OK`；grep 命中标题/CSS/isToday；`dailyList` 出现 **2** 次（HTML 挂载点 + JS getElementById，证明移位后无重复）

- [ ] **Step 6: Commit（不 push）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add index.html
git commit -m "feat: 每日预测总览置顶改名+当日默认展开+SP列高亮"
```

---

### Task 2: README 工作流 + 数据格式说明

**Files:**
- Modify: `README.md`（每日工作流第 1 条后插 SP 步；数据格式 matches 行加 sp/spHandicap）

- [ ] **Step 1: 每日工作流加 SP 步**

现状（`README.md` 每日工作流第 1、2 条之间）插入一条。改后前三条为：

```markdown
1. 分析完成后：在 `data/predictions.js` 数组**最前**插入当日对象（照 2026-07-26 的格式）。**场次规则：竞彩当日不足 7 场时，从北单选最有信心场次补足，保持每日 7 场推荐**（北单场 id 如 `北单159`）
2. 竞彩 SP 发布后：给当日每场补 `sp: ['主胜','平','客胜']`（北单场另加 `spHandicap: 让球数`），跑 `node tools/sync-data.js` 重传（首更先发预测，SP 后补）
3. 赛后复盘：给每场填 `finalScore`（如 `"3-1"`）、给当日填 `review`、给每个方案块填 `result`（hit/miss/half/push）；命中判定与统计由页面自动完成
```

（原第 3 条「同步」顺延为第 4 条，内容不变。）

- [ ] **Step 2: 数据格式要点加字段**

README 中 matches 格式行现状：

```markdown
  matches: [ { id, league, time, home, away, direction, overUnder, score: [], confidence, finalScore: null, note } ],
```

改为：

```markdown
  matches: [ { id, league, time, home, away, direction, overUnder, score: [], confidence, finalScore: null, note, sp: ['主胜','平','客胜'], spHandicap } ],   // sp/spHandicap 可选：竞彩 SP 三元组、北单让球数；缺省页面显示 —
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
git add README.md
git commit -m "docs: 工作流加SP回填步+matches格式加sp/spHandicap"
```

---

### Task 3: 同步 dist + push + 线上验证（需用户确认 push）

- [ ] **Step 1: dist 同步 + 回归**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站"
node test/stats.test.js
cp index.html dist/
```

- [ ] **Step 2: push（用户确认后执行）**

```bash
cd "C:/Users/Administrator/Desktop/足球预测站" && git push
```

- [ ] **Step 3: 线上验证（用户/AI）**

约 1 分钟后确认 https://henrymak246.github.io/ai-bear-sports/ 源码含「每日预测总览」与 `sp-hot`；登录后目检：总览在最顶、当日卡默认展开、SP 列显示 `—`（今晚场次 SP 发布后回填可见高亮效果）。

---

## Self-Review 记录

- 规格覆盖：置顶+改名（Task 1 Step 1）、当日默认展开（Step 2）、SP 列+高亮+让球标注（Step 3、4）、README 工作流（Task 2）、验证+push（Task 1 Step 5、Task 3）；历史不回填已在规格声明，无任务
- 占位扫描：全部代码完整给出，无 TBD
- 类型一致：`m.sp` 三元组数组 ↔ README `sp: ['主胜','平','客胜']` ↔ hotIdx 0/1/2 映射（主胜/平/客胜）；`m.spHandicap` ↔ README `spHandicap: 让球数`；dayCard(day, isToday) 定义与调用一致
- 无 DB/门控依赖：纯壳改动，Task 3 直接 push 无部署顺序风险
