# 主页每日发布与投资策略置顶 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将每日发布和投资策略移至今日区前部，补足真实复盘与仓位详述，并把英超、日韩统一归入专栏区。

**Architecture:** 保留单页 `index.html` 与现有 `PREDICTION_DAYS` 数据流，只调整 DOM 顺序、现有渲染函数和 11-08 发布内容。用内存 fixture 冒烟先行验证栏目结构和字符串兼容，再做真实页面双视口验收。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node `assert`/`vm` 冒烟、GitHub Pages、Supabase 日数据同步。

---

### Task 1: 用失败冒烟锁定栏目顺序和专栏归属

**Files:**
- Modify: `tools/_smoke_ne.js:22-29,111-125`
- Test: `tools/_smoke_ne.js`

- [ ] **Step 1: 写入布局与详述失败断言**

将旧的「日韩不得保留容器/不得主动渲染」断言移除，加入：

```js
const todayHtml = html.match(/<section id="sec-today">([\s\S]*?)<\/section>/)[1];
const dailyPos = todayHtml.indexOf('id="dailyPostBox"');
const investPos = todayHtml.indexOf('id="investPanel"');
const listPos = todayHtml.indexOf('id="dailyList"');
assert(dailyPos >= 0 && investPos > dailyPos && listPos > investPos,
  '今日区顺序必须为每日发布→投资策略→每日预测');
const columnsHtml = html.match(/<section id="sec-columns">([\s\S]*?)<\/section>/)[1];
assert(columnsHtml.includes('id="eplPanel"') && columnsHtml.includes('id="jkPanel"'),
  '专栏区必须同时包含英超和日韩');
assert(!columnsHtml.includes('id="investPanel"'), '投资策略不得继续留在专栏区');
assert(html.includes('renderJK(days);'), '日韩专栏应恢复主动渲染');
```

在投资断言中增加完整段落要求：

```js
['入场条件', '仓位依据', '风险控制', '复盘口径', '何时不做'].forEach(text => {
  assert(investHtml.includes(text), '投资策略必须详述「' + text + '」');
});
```

- [ ] **Step 2: 运行并确认按预期失败**

Run: `node tools/_smoke_ne.js`
Expected: FAIL，首先提示今日区顺序或专栏归属不符合要求。

### Task 2: 调整 DOM 顺序并恢复日韩专栏

**Files:**
- Modify: `index.html:442-488`
- Test: `tools/_smoke_ne.js`

- [ ] **Step 1: 移动每日发布与投资策略容器**

在 `sec-today` 的成绩卡之后、`dailyList` 之前放置：

```html
<div id="dailyPostBox"></div>
<div class="panel" id="investPanel">
  <h2>💰 投资策略<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:8px">三层仓位逻辑 · 入场与空仓条件 · 近7日方案明细</span></h2>
  <div id="investBody"></div>
</div>
```

删除原 `sec-today` 尾部的 `dailyPostBox`，并从 `sec-columns` 删除整个 `investPanel`。

- [ ] **Step 2: 恢复日韩面板**

在 `sec-columns` 的英超面板后添加：

```html
<div class="panel" id="jkPanel">
  <h2>🎌 日韩专栏<span style="font-size:11px;color:var(--muted);font-weight:400;margin-left:8px">日韩场次单独累计 · 方向/大小/比分与方案复盘</span></h2>
  <div id="jkBody"></div>
</div>
```

在现有 `renderEPL(days);` 前增加：

```js
renderJK(days);
```

- [ ] **Step 3: 运行布局冒烟**

Run: `node tools/_smoke_ne.js`
Expected: 布局与专栏断言转为 PASS；投资详述断言继续 FAIL，直到 Task 4 完成。

### Task 3: 修复每日发布兼容并支持详述排版

**Files:**
- Modify: `index.html:1281-1304`
- Modify: `tools/_smoke_ne.js`
- Test: `tools/_smoke_ne.js`

- [ ] **Step 1: 先写字符串发布兼容测试**

在 `_smoke_ne.js` 的 harness 中加入 `grabFn('renderDailyPost')`，并添加：

```js
sandbox.days = [{ date: '2026-11-08', dailyPost: '完整复盘正文' }];
sandbox.byDate = { '2026-11-08': sandbox.days[0] };
sandbox.calState.sel = '2026-11-08';
vm.runInContext('renderDailyPost(days)', sandbox);
assert(boxes.dailyPostBox.innerHTML.includes('完整复盘正文'), '字符串dailyPost必须直接渲染');
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/_smoke_ne.js`
Expected: FAIL，字符串形式没有 `content/text`，无法被现有谓词选中。

- [ ] **Step 3: 实现最小兼容与安全富文本**

将 `renderDailyPost` 的选择和正文归一化改为：

```js
function dailyText(dp) {
  return typeof dp === 'string' ? dp : dp && (dp.content || dp.text || '');
}
var day = pickDay(function (d) { return !!dailyText(d.dailyPost); });
if (!day) { box.innerHTML = ''; return; }
var raw = day.dailyPost;
var dp = typeof raw === 'string' ? { title: '小熊每日完整复盘', content: raw } : raw;
function rich(t) {
  return esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
```

正文使用 `rich(dp.content || dp.text)`，标题使用 `esc(dp.title || '小熊每日完整复盘')`。微博样稿继续纯文本转义，不改变旧卡片。

- [ ] **Step 4: 验证兼容测试通过**

Run: `node tools/_smoke_ne.js`
Expected: 字符串发布断言 PASS，无 `undefined` 或原始 HTML 注入。

### Task 4: 写入真实复盘长文与投资策略详述

**Files:**
- Create: `tools/_patch1109_homepage_content.js`
- Modify: `index.html:1828-1855`（仅 `renderInvest`）
- Modify: `data/predictions.js`（由补丁脚本生成）
- Test: `tools/_smoke_ne.js`

- [ ] **Step 1: 用幂等补丁替换 11-08 精简发布**

补丁读取 `data/predictions.js`，定位 `2026-11-08`，将 `dailyPost` 写成 `{ title, content }`。正文必须包含以下五个明确小标题与真实数据，不写空泛宣传：

```text
【一、整体成绩与风险结构】
方向17/30、双选23红4黑、8场平局全罩；逐条说明胆波尔图红、单选霍芬海姆红与切尔西黑，以及四个双选黑场。

【二、关键场盘口与信息面】
切尔西水位/SP双热仍0-1；米兰欧联轮换伤停且客水1.80→1.96，足彩单0改1/0；早场日韩-0.25浅盘与体能单证失效；欧战硬闸撤下贝蒂斯/伯恩茅斯/勒沃库森后三队全胜，记为纪律成本而非立即废闸。

【三、各产品逐项复盘】
分别完整说明asian7两红两半红、大小3串全红、比分3场全中、北单4关全红、26162期13红1黑、梦想7关3红4黑，以及早/夜/深夜三档结果。

【四、资金与回收口径】
61元主方案已知回收298.26元、名义净+237.26元；大小球赔率未留档不计；128元足彩仅展示；北单按建时浮动SP只是名义口径。

【五、模型改进】
强热不自动升单选、任九胆独立复核、三时段控制单锚与重复暴露、大小球赛前必须留存真实赔率。
```

补丁保留现有文件头尾，运行两次后 MD5 不变。

- [ ] **Step 2: 将投资三层改为完整说明**

保留现有两层表格数据生成，在 `layers` 前增加每层的 `detail`，并用段落渲染在策略表之前。四段固定覆盖：

```js
var guide = [
  ['🛡 稳定层', '入场条件：胆必须满足SP、基本面、盘口与信息面约束。仓位依据：只用固定小额，不因连红加仓。何时不做：无合规胆、SP超限或风险证据冲突时空仓。复盘口径：胆与单选分开统计，不用双选命中率掩盖单选波动。'],
  ['🎲 增强层', '入场条件：亚盘和大小球必须有球队结构与盘口双证。仓位依据：仅娱乐小注，串关会放大单腿错误。风险控制：不追损，半红与走水按真实结算。复盘口径：赛前留存每条腿赔率，否则赛后只记命中、不虚构回收。'],
  ['🎫 彩票层', '入场条件：北单、足彩和任九只使用预算内资金。仓位依据：超预算票只展示，不为提高覆盖而被动加注。何时不做：需要滚存、补损或突破预算时停手。复盘口径：北单浮动SP标名义值，展示票不计实际投入。']
];
var guideHtml = guide.map(function (r) {
  return '<div class="invest-guide"><h3>' + esc(r[0]) + '</h3><p>' + esc(r[1]) + '</p></div>';
}).join('');
```

将 `guideHtml` 放在三层策略表之前，并保留原表与近7日表。

- [ ] **Step 3: 验证内容与既有测试**

Run: `node tools/_patch1109_homepage_content.js && node tools/_patch1109_homepage_content.js && node tools/_smoke_ne.js`
Expected: 两次内容一致；所有布局、专栏、发布兼容和投资详述断言 PASS。

### Task 5: 全量验收、截图与同步上线

**Files:**
- Modify if required by verified failures: `index.html`
- Modify: `.gitignore`（加入 `.superpowers/`，避免布局草图入库）
- Test: 现有网站与小程序冒烟

- [ ] **Step 1: 运行相关自动门禁**

Run:

```bash
node tools/check_daily.js 2026-11-08
node --test test/slot8.test.js test/stats.test.js test/mini_judge.test.js
node tools/_smoke_site_render.js
node tools/_smoke_ne.js
node tools/_smoke_mini_page.js
node tools/_smoke_mini_score.js
node tools/_smoke_mini_settle.js
```

Expected: 全部退出码 0；既有因非当日产生的实时联网跳过属于既有日期闸行为，不伪装成联网验收。

- [ ] **Step 2: 浏览器双视口验收**

用本机 Edge/Chrome 打开真实页面或本地预览，分别检查桌面和 390px 手机：每日发布在投资策略上方、两者在每日预测之前；长文无溢出；策略表可横向阅读；专栏区同时出现英超和日韩。修复实际发现的问题后再复拍。

- [ ] **Step 3: 运行一次机械检测**

Run: `C:/Users/Administrator/.agents/skills/impeccable/scripts/impeccable.cmd detect --json index.html`
Expected: 无本次新增的严重布局/可访问性问题；既有海报等告警单独说明，不顺手重构无关区域。

- [ ] **Step 4: 同步数据并回读**

Run:

```bash
scp -q data/predictions.js tokyo-via-proxy:/root/football/data/
node tools/sync-data.js --only=2026-11-08
node tools/_chk_supabase.js
```

Expected: 东京 MD5 与本地一致，Supabase 与小程序 RPC 内容一致。

- [ ] **Step 5: 经用户确认后提交并推送真实网页**

先向用户说明拟提交文件与线上影响，获得本次明确许可后才执行：

```bash
git add index.html tools/_smoke_ne.js tools/_patch1109_homepage_content.js .gitignore docs/superpowers/specs/2026-11-09-homepage-editorial-layout-design.md docs/superpowers/plans/2026-11-09-homepage-editorial-layout.md
git commit -m "置顶每日发布与投资策略并补足详述"
git push
```

Expected: GitHub Pages 回读包含新 DOM 顺序与日韩专栏；未获许可时只保留本地改动，不执行任何 git 写操作。
