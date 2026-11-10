# 小程序组串投注参考图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 组串确认后输出一张与竞彩官方足球计算器弹窗效果一致的投注参考图(Canvas 2D 出图), 保存成功自动预览, 投注页可重出。

**Architecture:** 纯函数内容层 `slip.js`(腿行文本/注数/最高奖金, node 可测) + 小程序绘制层 `slipCanvas.js`(屏外 canvas type="2d" → wx.canvasToTempFilePath → wx.previewImage)。设计文档: `docs/superpowers/specs/2026-09-13-mini-bet-slip-image-design.md`。

**Tech Stack:** 微信小程序原生(Canvas 2D)/ Node 冒烟(node assert)。

**仓库约定:** 站点仓库根= `C:/Users/Administrator/Desktop/足球预测站`。腿型由 `utils/cart.js` buildLeg 产出: jcHad(pick='3'/'1'/'0', odds 单值) / jcHhad(pick='让-1 3' 空格分隔) / bd(整腿透传, pick 可复式 '3/1', 带 sp3 三列临场SP/handicap/bdNum) / ah(pick=ahPick, odds=(1+水位).toFixed(2))。

---

### Task 1: slip.js 内容层(TDD)

**Files:**
- Create: `miniprogram/utils/slip.js`
- Test: `tools/_smoke_mini_slip.js`

- [ ] **Step 1: 写失败冒烟** `tools/_smoke_mini_slip.js`:

```js
/* _smoke_mini_slip.js — 投注参考图内容层 slip.js 的 node 冒烟。
   用法: node tools/_smoke_mini_slip.js */
const assert = require('assert');
const slip = require('../miniprogram/utils/slip.js');

// 真实 9-13 腿型(cart.buildLeg 产出形态)
const bdLeg = { kind: 'bd', bdNum: '342', home: '皇家社会', away: '马竞', pick: '0', odds: '1.99', sp3: ['3.20', '3.61', '2.15'], handicap: '0' };
const jcLeg = { kind: 'jcHad', id: '周日003', home: '塞尔塔', away: '马拉加', pick: '3', odds: '1.53' };
const hhLeg = { kind: 'jcHhad', id: '周日009', home: '莱红牛', away: '汉堡', pick: '让-1 3', odds: '1.66' };
const ahLeg = { kind: 'ah', id: '周日011', home: '汉坎', away: '莫尔德', pick: '莫尔德-0.75', odds: '1.96' };

// 1) 行格式: 四类腿型
let rows = slip.slipRows([bdLeg, jcLeg, hhLeg, ahLeg]);
assert.strictEqual(rows.length, 4);
assert.strictEqual(rows[0].title, '北单342 皇家社会 VS 马竞');
assert.strictEqual(rows[0].options, '负(2.15)'); // sp3[2], 非 leg.odds=1.99
assert.strictEqual(rows[1].title, '周日003 塞尔塔 VS 马拉加');
assert.strictEqual(rows[1].options, '主胜(1.53)');
assert.strictEqual(rows[2].title, '周日009 莱红牛 VS 汉堡 [-1]');
assert.strictEqual(rows[2].options, '让球胜(1.66)');
assert.strictEqual(rows[3].title, '周日011 汉坎 VS 莫尔德');
assert.strictEqual(rows[3].options, '亚盘: 莫尔德-0.75 @1.96');
console.log('OK 1/5 四类腿型行格式');

// 2) 北单让球非 0 标题带让球数
const bdHc = Object.assign({}, bdLeg, { handicap: '-1' });
assert.strictEqual(slip.slipRows([bdHc])[0].title, '北单342 皇家社会 VS 马竞 [让-1]');
console.log('OK 2/5 北单让球数入标题');

// 3) 复式北单腿顿号连排 + 注数/最高奖金(官方口径: 各腿最大赔率连乘×2)
const bdDbl = Object.assign({}, bdLeg, { pick: '3/1' });
rows = slip.slipRows([bdDbl]);
assert.strictEqual(rows[0].options, '胜(3.20)、平(3.61)');
let t = slip.slipTotals([bdDbl, jcLeg], 2);
assert.strictEqual(t.legCount, 2);
assert.strictEqual(t.stakes, 2); // 2 选项 × 1
assert.strictEqual(t.amount, 4);
assert.strictEqual(t.maxPayout, Math.round(3.61 * 1.53 * 2 * 100) / 100); // max(3.20,3.61)×1.53×2=11.05
console.log('OK 3/5 复式腿连排+官方口径金额');

// 4) 单选对账: bd342 单选 0 + 周日003 主胜 → 1注/2元/6.58元
t = slip.slipTotals([bdLeg, jcLeg], 2);
assert.strictEqual(t.stakes, 1);
assert.strictEqual(t.amount, 2);
assert.strictEqual(t.maxPayout, 6.58);
console.log('OK 4/5 单选金额对账(1注/2元/6.58元)');

// 5) 缺赔率容错: 无 sp3 无 odds → 无括号, 最高奖金按 1 计不放大
const bdNo = { kind: 'bd', bdNum: '001', home: '甲', away: '乙', pick: '3', handicap: '0' };
rows = slip.slipRows([bdNo]);
assert.strictEqual(rows[0].options, '胜');
t = slip.slipTotals([bdNo, jcLeg], 2);
assert.strictEqual(t.maxPayout, Math.round(1 * 1.53 * 2 * 100) / 100); // 3.06
console.log('OK 5/5 缺赔率容错');

console.log('\nSMOKE OK — slip.js 全部断言通过');
```

- [ ] **Step 2: 跑确认失败** `cd tools && node _smoke_mini_slip.js` → `Cannot find module '../miniprogram/utils/slip.js'`

- [ ] **Step 3: 实现** `miniprogram/utils/slip.js`:

```js
/* slip.js — 投注参考图内容层(手写, node/小程序双环境, 纯函数)。
 * slipRows(legs) → [{ title, options }] 逐腿两行(仿竞彩官方计算器弹窗);
 * slipTotals(legs, unit) → { legCount, stakes, amount, maxPayout }(官方口径:
 *   注数=各腿选项数乘积, 理论最高奖金=各腿最大赔率连乘×单注金额, 缺赔率腿按 1 计);
 * slipHeight(legCount) → canvas 逻辑高(750 宽口径)。 */

const WIN_LABEL = { '3': '胜', '1': '平', '0': '负' };   // 北单/让球选项名
const HAD_LABEL = { '3': '主胜', '1': '平', '0': '客胜' }; // 竞彩胜平负选项名

function num(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v));
  return isNaN(n) ? 0 : n;
}
function fmtOdds(v) { const n = num(v); return n > 0 ? String(n) : ''; }
function withOdds(label, odds) { const o = fmtOdds(odds); return o ? label + '(' + o + ')' : label; }

/* pick 按 '/' 拆选项(复式); jcHhad 的 '让-1 3' 空格分隔不含 '/', 天然单选项 */
function pickCodes(pick) {
  return String(pick === undefined || pick === null ? '' : pick).split('/').filter((s) => s !== '');
}

/* bd 腿各选项赔率: sp3=[胜,平,负] 按 3/1/0 索引; 缺 sp3 退 leg.odds 单值 */
function bdOdds(leg, code) {
  const sp3 = leg && leg.sp3;
  if (Array.isArray(sp3) && sp3.length >= 3) {
    return num(sp3[code === '3' ? 0 : code === '1' ? 1 : 2]);
  }
  return num(leg && leg.odds);
}

/* 每腿最大赔率(理论最高奖金口径); 缺赔率按 1 计不放大 */
function legMaxOdds(leg) {
  if (!leg) return 1;
  if (leg.kind === 'bd') {
    const codes = pickCodes(leg.pick);
    if (codes.length) {
      const m = Math.max.apply(null, codes.map((c) => bdOdds(leg, c)));
      return m > 0 ? m : 1;
    }
  }
  return num(leg.odds) || 1;
}

function slipRows(legs) {
  return (legs || []).filter(Boolean).map((leg) => {
    const kind = leg.kind || 'jcHad';
    if (kind === 'bd') {
      const hc = String(leg.handicap || '0');
      const title = '北单' + (leg.bdNum || '') + ' ' + (leg.home || '') + ' VS ' + (leg.away || '') +
        (hc && hc !== '0' ? ' [让' + hc + ']' : '');
      const codes = pickCodes(leg.pick);
      const options = (codes.length ? codes : ['3'])
        .map((c) => withOdds(WIN_LABEL[c] || c, bdOdds(leg, c)))
        .join('、');
      return { title, options };
    }
    const title0 = (leg.id || '') + ' ' + (leg.home || '') + ' VS ' + (leg.away || '');
    if (kind === 'jcHhad') {
      const parts = String(leg.pick || '').split(/\s+/); // '让-1 3'
      const hcap = (parts[0] || '').replace(/^让/, '');
      const code = parts[1] || '3';
      return { title: title0 + (hcap ? ' [' + hcap + ']' : ''), options: withOdds('让球' + (WIN_LABEL[code] || code), leg.odds) };
    }
    if (kind === 'ah') {
      const o = fmtOdds(leg.odds);
      return { title: title0, options: '亚盘: ' + (leg.pick || '') + (o ? ' @' + o : '') };
    }
    return { title: title0, options: withOdds(HAD_LABEL[leg.pick] || leg.pick || '', leg.odds) };
  });
}

function slipTotals(legs, unit) {
  const u = num(unit) || 2;
  const ls = (legs || []).filter(Boolean);
  let stakes = 1;
  let maxMul = 1;
  ls.forEach((leg) => {
    const codes = pickCodes(leg.pick);
    stakes *= codes.length || 1;
    maxMul *= legMaxOdds(leg);
  });
  return {
    legCount: ls.length,
    stakes,
    amount: Math.round(stakes * u * 100) / 100,
    maxPayout: Math.round(maxMul * u * 100) / 100,
  };
}

/* 布局高(逻辑 px, 宽 750): 头部 110 + 腿行 116/腿 + 金额区 170 */
function slipHeight(legCount) {
  return 110 + 116 * (legCount || 0) + 170;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { slipRows, slipTotals, slipHeight };
}
```

注意: `slipTotals` 的 stakes 对所有腿型按 pick '/' 选项数乘积, 与 cart.calc 同口径(jcHhad '让-1 3' 无 '/' 计 1)。

- [ ] **Step 4: 跑通** `node tools/_smoke_mini_slip.js` → "SMOKE OK — slip.js 全部断言通过"

- [ ] **Step 5: Commit** `git add miniprogram/utils/slip.js tools/_smoke_mini_slip.js && git commit -m "小程序: 投注参考图内容层 slip.js(官方式腿行/注数/最高奖金, TDD)"`

---

### Task 2: slipCanvas.js 绘制层 + index 页保存后自动出图

**Files:**
- Create: `miniprogram/utils/slipCanvas.js`
- Modify: `miniprogram/pages/index/index.js`(require/data/previewSlip/saveCart 调用)
- Modify: `miniprogram/pages/index/index.wxml`(尾部加屏外 canvas)
- Modify: `miniprogram/pages/index/index.wxss`(加 .slip-canvas)

- [ ] **Step 1: 实现** `miniprogram/utils/slipCanvas.js`:

```js
/* slipCanvas.js — 投注参考图 Canvas 2D 绘制(小程序侧, 不可 node 测)。
 * renderSlip({ page, canvasId, legs, unit }) → Promise<tempFilePath>。
 * 流程: setData 同步 CSS 高 → 取节点 → 缓冲=逻辑×dpr → ctx.scale(dpr) 绘制
 * → wx.canvasToTempFilePath 按逻辑尺寸导出高清图。 */
const slip = require('./slip.js');

const RED = '#E4393C'; // 官方金额红
const GRAY = '#999999';
const LINE = '#EBEBEB';

function getNode(page, canvasId) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        const r = res && res[0];
        if (r && r.node) resolve(r);
        else reject(new Error('canvas 节点未找到: ' + canvasId));
      });
  });
}

function dprOf() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
    return (wx.getSystemInfoSync().pixelRatio) || 2;
  } catch (e) { return 2; }
}

/* 分段文本(黑标签+红数值)居中绘制一行 */
function drawCenteredParts(ctx, cx, y, parts) {
  let w = 0;
  parts.forEach((p) => { ctx.font = p.font; w += ctx.measureText(p.text).width; });
  let x = cx - w / 2;
  parts.forEach((p) => {
    ctx.font = p.font;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
    x += ctx.measureText(p.text).width;
  });
}

function drawAll(ctx, W, H, legs, unit) {
  const rows = slip.slipRows(legs);
  const totals = slip.slipTotals(legs, unit);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 头部: 过关方式
  let y = 36;
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('过关方式: ' + totals.legCount + '关', 30, y + 20);
  y += 74;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

  // 腿行: 标题居中黑 / 选项居中灰 / 分隔线
  ctx.textAlign = 'center';
  rows.forEach((r) => {
    y += 16;
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(r.title, W / 2, y + 15);
    y += 46;
    ctx.fillStyle = GRAY;
    ctx.font = '28px sans-serif';
    ctx.fillText(r.options, W / 2, y + 14);
    y += 42;
    ctx.strokeStyle = LINE;
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
  });

  // 金额区
  y += 26;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#666666';
  ctx.font = '28px sans-serif';
  ctx.fillText('1倍 · 注数 ' + totals.stakes + ' 注', 30, y + 14);
  y += 52;
  drawCenteredParts(ctx, W / 2, y + 16, [
    { text: '投注金额: ', font: '30px sans-serif', color: '#333333' },
    { text: String(totals.amount), font: 'bold 36px sans-serif', color: RED },
    { text: ' 元', font: '30px sans-serif', color: '#333333' },
  ]);
  y += 56;
  drawCenteredParts(ctx, W / 2, y + 16, [
    { text: '理论最高奖金: ', font: '30px sans-serif', color: '#333333' },
    { text: String(totals.maxPayout), font: 'bold 38px sans-serif', color: RED },
    { text: ' 元', font: '30px sans-serif', color: '#333333' },
  ]);
}

async function renderSlip(opts) {
  const page = opts && opts.page;
  const canvasId = (opts && opts.canvasId) || 'slipCanvas';
  const legs = ((opts && opts.legs) || []).filter(Boolean);
  if (!page) throw new Error('renderSlip 需要 page');
  if (!legs.length) throw new Error('无腿可出图');
  const unit = (opts && opts.unit) || 2;
  const W = 750;
  const H = slip.slipHeight(legs.length);
  // CSS 尺寸与缓冲逻辑尺寸对齐(防拉伸), setData 回调后取节点
  await new Promise((resolve) => page.setData({ slipCanvasH: H }, resolve));
  const r = await getNode(page, canvasId);
  const node = r.node;
  const dpr = dprOf();
  node.width = W * dpr;
  node.height = H * dpr;
  const ctx = node.getContext('2d');
  ctx.scale(dpr, dpr);
  drawAll(ctx, W, H, legs, unit);
  return await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: node, x: 0, y: 0, width: W, height: H, destWidth: W * dpr, destHeight: H * dpr,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(new Error((err && err.errMsg) || 'canvasToTempFilePath 失败')),
    });
  });
}

module.exports = { renderSlip };
```

- [ ] **Step 2: index.js 接入**(三处精确改动):

① 顶部 require 区(现有 `const cart = require('../../utils/cart.js');` 下一行)加:

```js
const slipCanvas = require('../../utils/slipCanvas.js');
```

② data 里(`cartUnit: 2, // 单注金额输入(默认 2 元)` 附近)加两个字段:

```js
    slipCanvasH: 600, // 投注图 canvas CSS 高(renderSlip 动态覆写)
    lastSlipPath: '', // 最近出图 tempFilePath(验收断言用)
```

③ `saveCart()` 的 then 成功块末尾(`self.setData({ cartOpen: false, cartMode: false });` 之后)加出图调用, 并新增 `previewSlip` 方法(放在 `checkBetDraft()` 之前):

```js
  /* 保存成功后/投注页重出: 渲染投注参考图并全屏预览(真机长按保存/转发);
     出图失败仅提示, 不影响已落库注单。 */
  previewSlip(legs) {
    const ls = (legs || this.data.cartLegs || []).filter(Boolean);
    if (!ls.length) return;
    slipCanvas.renderSlip({ page: this, canvasId: 'slipCanvas', legs: ls, unit: 2 })
      .then((p) => {
        this.setData({ lastSlipPath: p });
        wx.previewImage({ urls: [p] });
      })
      .catch(() => wx.showToast({ title: '已登记成功, 出图失败', icon: 'none' }));
  },
```

saveCart then 块改为:

```js
    api.saveBet(bet)
      .then(() => {
        try { wx.removeStorageSync('betDraft'); } catch (e) { /* ignore */ }
        wx.showToast({ title: '已登记', icon: 'success' });
        self.commitCart({});
        self.setData({ cartOpen: false, cartMode: false });
        self.previewSlip(legs); // 新增: 出投注参考图
      })
```

- [ ] **Step 3: index.wxml 尾部**(最后一个 `</view>` 之后)加屏外 canvas:

```xml
<!-- 投注参考图屏外画布(出图用, 不可见) -->
<canvas type="2d" id="slipCanvas" class="slip-canvas" style="width:750px;height:{{slipCanvasH}}px" />
```

- [ ] **Step 4: index.wxss 尾部**加:

```css
/* 投注参考图屏外画布 */
.slip-canvas {
  position: fixed;
  left: -2000px;
  top: 0;
}
```

- [ ] **Step 5: 冒烟回归** `node tools/_smoke_mini_page.js && node tools/_smoke_mini_slip.js` 全绿(slipCanvas 仅页面引用, node 冒烟不触达)。

- [ ] **Step 6: Commit** `git add miniprogram/utils/slipCanvas.js miniprogram/pages/index/ && git commit -m "小程序: 投注参考图绘制层+保存登记成功自动出图预览(Canvas 2D)"`

---

### Task 3: 投注页 🖼 投注图重出按钮

**Files:**
- Modify: `miniprogram/pages/bets/bets.js`
- Modify: `miniprogram/pages/bets/bets.wxml`
- Modify: `miniprogram/pages/bets/bets.wxss`

- [ ] **Step 1: bets.js**(三处):

① 顶部(`const settle = require('../../utils/settle.js');` 下一行)加:

```js
const slipCanvas = require('../../utils/slipCanvas.js');
```

② data 加:

```js
    slipCanvasH: 600,
```

③ Page 方法区(`stopPull()` 之前)加:

```js
  /* 注卡「🖼 投注图」: 对该注单腿重出投注参考图并预览 */
  previewSlip(e) {
    const bet = this.data.bets[e.currentTarget.dataset.index];
    if (!bet) return;
    slipCanvas.renderSlip({ page: this, canvasId: 'slipCanvas', legs: bet.legs || [], unit: bet.unit || 2 })
      .then((p) => wx.previewImage({ urls: [p] }))
      .catch(() => wx.showToast({ title: '出图失败', icon: 'none' }));
  },
```

- [ ] **Step 2: bets.wxml**(两处):

① `bet-foot` 行内(`<text wx:else class="muted">预期 {{item.expectText || '--'}}</text>` 之后)加按钮:

```xml
    <text class="slip-btn" data-index="{{index}}" bindtap="previewSlip">🖼 投注图</text>
```

② 文件尾部(`<view class="empty" ...>` 行之后)加:

```xml
<canvas type="2d" id="slipCanvas" class="slip-canvas" style="width:750px;height:{{slipCanvasH}}px" />
```

- [ ] **Step 3: bets.wxss 尾部**加:

```css
/* 投注图按钮 */
.slip-btn {
  color: #8B5A2B;
  font-size: 24rpx;
  padding: 4rpx 12rpx;
  border: 1rpx solid #D9C7AE;
  border-radius: 8rpx;
}
/* 投注参考图屏外画布 */
.slip-canvas {
  position: fixed;
  left: -2000px;
  top: 0;
}
```

- [ ] **Step 4: 冒烟回归** `node tools/_smoke_mini_settle.js` 绿(bets.js 页面引用 slipCanvas 不影响 node 冒烟——bets.js 的 module.exports 仅 decorateBet/errText, 但 require 时顶层会加载 slipCanvas.js: 该文件无 wx 顶层调用, 安全)。

- [ ] **Step 5: Commit** `git add miniprogram/pages/bets/ && git commit -m "小程序: 投注页每注重出投注参考图"`

---

### Task 4: 模拟器验收加出图步骤 + 全量门禁

**Files:**
- Modify: `tools/_mini_verify.js`(组串阶段后加出图断言+截屏)

- [ ] **Step 1:** `_mini_verify.js` 的 `[cart]` 日志行之后、`shot 4_cart` 之前插入:

```js
  // 投注参考图: 预览弹层截屏(previewImage 在模拟器渲染为全屏查看器)
  await step('出投注图', async () => {
    const p = await mini.currentPage();
    const dd = await p.data();
    return p.callMethod('previewSlip', dd.cartLegs);
  });
  await sleep(2500);
  const dSlip = await step('读 lastSlipPath', async () => { const p = await mini.currentPage(); return p.data(); });
  if (dSlip) console.log('[slip] lastSlipPath=', dSlip.lastSlipPath ? '非空 ✓' : '(空=出图失败)');
  await step('shot 6_slip', () => mini.screenshot({ path: path.join(SHOTS, '6_slip.png') }));
  await step('退出预览', () => mini.navigateBack());
  await sleep(800);
```

- [ ] **Step 2: 模拟器重验** `cd tools && node _mini_verify.js` — 组串 2 腿后出图, `[slip] lastSlipPath= 非空 ✓`, 6_slip.png 截到官方式样投注图(目检: 过关方式/腿行/红字金额)。

- [ ] **Step 3: 全量门禁** `node test/stats.test.js && node test/mini_judge.test.js && node tools/_smoke_mini_page.js && node tools/_smoke_mini_api.js && node tools/_smoke_mini_score.js && node tools/_smoke_mini_settle.js && node tools/_smoke_mini_slip.js && node tools/check_daily.js` 全绿。

- [ ] **Step 4: Commit+push**(走代理) `git add tools/_mini_verify.js && git commit -m "小程序: 模拟器验收加投注图出图步骤" && git -c http.proxy=http://127.0.0.1:10809 push`

- [ ] **Step 5:** AGENTS.md 项目8.1 条目补「投注参考图」功能与模块名(slip.js/slipCanvas.js)。

---

## 自检记录(写计划时已跑)

- Spec 覆盖: §3 版式/腿行/金额口径→T1+T2; §4 组件/页面改动→T2/T3; §4 错误处理→T2 previewSlip catch/T3 catch/T1 缺赔率断言; §5 测试→T1 冒烟/T4 验收步骤; §6 验收→T4 截屏目检+真机清单留给用户。无缺口。
- 类型一致: slipRows/slipTotals/slipHeight 在 T1 定义, T2 的 slipCanvas.js 与 T4 verify 引用同名; renderSlip({page, canvasId, legs, unit}) 签名在 T2 定义, index/bets/verify 三处调用一致; previewSlip(legs) index 版默认回退 this.data.cartLegs, verify callMethod 传参一致。
- 腿型边界: bd 复式仅 pick 含 '/' 出现; jcHhad pick 空格分隔不拆; ah odds 已由 buildLeg 预折 (1+水位).toFixed(2)。
