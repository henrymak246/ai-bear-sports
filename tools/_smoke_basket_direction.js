/* tools/_smoke_basket_direction.js — 篮球【方向层】冒烟(2026-09-23 新增)
 *
 * 为什么需要它:
 *   方向层(day.basketball.plan + 逐场 direction/synthesis/...)是**人工撰写**、由
 *   tools/_lq_dir.js 写进 predictions.js、再由 tools/_lq_site.js **按 num 回挂**保住的。
 *   这条链上有两个失效模式, 都是**静默**的:
 *     ①生成器重跑把方向层覆盖掉 —— 页面不报错, 只是"方向又没了"(这正是它此前缺席的真因);
 *     ②渲染层没接上 —— 数据里有方向, 页面上一个字都不显示。
 *   两种都不会让任何现有冒烟变红, 所以必须**专测**。
 *
 * 本冒烟断言四件事:
 *   A. 数据层: computeBasketball 能把 plan 与逐场方向透出来(不是只存在 predictions.js 里)
 *   B. 渲染层: basketBody 里**真的出现**那些字(不是"应该会显示")
 *   C. 幂等+保留: 生成器用同一批池文件重跑必须是**逐字节零变化**, 且报告保留了方向层
 *   D. 反空过: 没有方向层数据时必须**报错而不是给绿**(空对照是最容易骗过自己的绿)
 *
 * 数据契约(同时也被 D 约束): **短标签字段(name/pct/direction/dirTag/ahPick/ouPick)不得含 `**`**,
 * 长文字段(text/detail/synthesis/note)才用 `**` 标重点 —— 渲染层只对长文字段做加粗转换。
 *
 * 用法: node tools/_smoke_basket_direction.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DAYS = new Function(fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8') + ';return PREDICTION_DAYS;')();
assert(Array.isArray(DAYS) && DAYS.length, '未读到 PREDICTION_DAYS');

// ---- A. 数据层: plan 与逐场方向必须真的透出来 ----
const STATS_SRC = fs.readFileSync(path.join(ROOT, 'stats.js'), 'utf8');
const statsBox = { module: { exports: {} }, console };
statsBox.exports = statsBox.module.exports;
vm.createContext(statsBox);
vm.runInContext(STATS_SRC, statsBox, { filename: 'stats.js' });
const StatsLib = statsBox.module.exports;
assert(typeof StatsLib.computeBasketball === 'function', 'stats.js 未导出 computeBasketball');

// 找**最新**一个带 plan 的日子(倒序数组 ⇒ 找第一个; 这样将来换天不用改本文件)
const authored = DAYS.filter((d) => d.basketball && Array.isArray(d.basketball.plan) && d.basketball.plan.length);
assert(authored.length > 0,
  '★ 没有任何一天带 basketball.plan —— 方向层不存在, 本冒烟无对象可测(拒绝空过给绿)。' +
  '若是有意清空, 请连本文件一起删, 而不是让它空跑。');
const day = authored[0];
const date = day.date;
const plan = day.basketball.plan;

const b = StatsLib.computeBasketball(DAYS, date);
assert(Array.isArray(b.plan) && b.plan.length === plan.length,
  'computeBasketball 没把 plan 透出来(选中 ' + date + ' 时拿到 ' + (b.plan ? b.plan.length : 'null') + ' 张)');
const withDir = b.matches.filter((m) => m.direction);
assert(withDir.length > 0, date + ' 的 plan 有 ' + plan.length + ' 张, 但逐场 direction 一个都没透出来');

// 数据契约: 短标签不得含 `**`(渲染层不会为它们做加粗转换, 写了就会以字面量示人)
const SHORT = ['name', 'pct'];
const SHORT_M = ['direction', 'dirTag', 'ahPick', 'ouPick'];
plan.forEach((p, i) => SHORT.forEach((k) => {
  assert((p[k] || '').indexOf('**') === -1,
    'plan[' + i + '].' + k + ' 含 `**` —— 短标签字段不做加粗转换, 会以字面星号显示');
}));
withDir.forEach((m) => SHORT_M.forEach((k) => {
  assert((m[k] || '').indexOf('**') === -1, m.label + '.' + k + ' 含 `**`(短标签同上)');
}));
// ★ 反引号: rich() 只认 `**`, 没有 code-span 处理 ⇒ 写了会**以字面量示人**(实测踩过:
//   我在「可投注性」卡的 detail 里引门禁输出用了反引号, 页面上就真显示成 `四池全空 3 场…`)。
//   与上面 `**` 那条同一类: 渲染层不报错, 只是多两个怪符号 ⇒ 只能靠冒烟拦。
[[plan, ['name', 'pct', 'text', 'detail']], [withDir, ['direction', 'dirTag', 'ahPick', 'ouPick', 'synthesis', 'note']]]
  .forEach(([arr, ks]) => arr.forEach((o, i) => ks.forEach((k) => {
    assert((o[k] || '').indexOf('`') === -1,
      (o.label || 'plan[' + i + ']') + '.' + k + ' 含反引号 —— rich() 不做 code-span 转换, 会以字面量显示; 请改用「」');
  })));

// ---- B. 渲染层: 那些字必须真的出现在 basketBody 里 ----
const LIVE_ODDS_SRC = fs.readFileSync(path.join(ROOT, 'assets/live-odds.js'), 'utf8');
const INLINE_SRC = (function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(blocks.length, 1, 'index.html 内联脚本块数应为 1, 实际 ' + blocks.length);
  return blocks[0][1];
})();
function mkEl(id) {
  return {
    id: id || '', tagName: 'DIV', innerHTML: '', textContent: '', hidden: false,
    style: {}, parentElement: null, nextElementSibling: null,
    _attrs: {}, _handlers: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    appendChild(c) { return c; }, querySelector() { return null; }, querySelectorAll() { return []; },
    closest() { return null; }, getContext() { return null; },
    addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._handlers[t] || []; const i = a.indexOf(fn); if (i !== -1) a.splice(i, 1); },
    remove() {},
  };
}
const els = {};
const documentStub = {
  body: mkEl('body'),
  getElementById(id) { return els[id] || (els[id] = mkEl(id)); },
  createElement(tag) { const e = mkEl(); e.tagName = String(tag).toUpperCase(); return e; },
  querySelector() { return null; }, querySelectorAll() { return []; },
  addEventListener() {}, removeEventListener() {},
};
const sandbox = {
  console, Date, Math, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
  URLSearchParams, isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, setTimeout,
  document: documentStub,
  fetch: function () { return Promise.reject(new Error('offline')); },
  location: { search: '?dev', reload() {} },
  navigator: { userAgent: 'node' },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  confirm() { return false; },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(LIVE_ODDS_SRC, sandbox, { filename: 'assets/live-odds.js' });
vm.runInContext(STATS_SRC, sandbox, { filename: 'stats.js' });
vm.runInContext(INLINE_SRC, sandbox, { filename: 'index.html:inline' });

// ★ 伪 DOM 的 querySelectorAll 返回 [] ⇒ 日历点击路径挂不上。
//   让 renderApp 的默认选中落在目标日: DAYS 是**倒序**(新在前), 从该日**截到尾**使 days[0] === 目标日。
const idx = DAYS.findIndex((d) => d.date === date);
assert(idx >= 0, '在 DAYS 里找不到 ' + date);
sandbox.renderApp(DAYS.slice(idx));
const body = (els.basketBody || {}).innerHTML || '';
assert(body.length > 0, '渲染后 basketBody 为空 —— 渲染路径没跑到');

// ★ 探针必须取**单个 `**` 段**, 不能取"开头 N 字"。
//   实测踩过: plan[1] 的正文开头是 `**两口径背离场 2 场: 301 与 303** —— 两场…`,
//   开头 24 字正好跨过闭合的 `**` ⇒ 被 </b> 切断 ⇒ 断言假红(是**测试写错了, 不是渲染错了**)。
//   rich() 只在 `**` 边界插入标签 ⇒ **每一段内部在 HTML 里都连续**。
function probeSeg(s) {
  const segs = String(s || '').split('**').filter((t) => t.length >= 6 && !/[&<>]/.test(t));
  if (!segs.length) return null;
  return segs.reduce((a, x) => (x.length > a.length ? x : a));
}

// 断言的是"这些字出现在页面里", 而不是"出现了某些 HTML 标签" —— 后者会被无关改动带偏。
plan.forEach((p, i) => {
  assert(body.indexOf(p.name) !== -1, 'B 失败: plan[' + i + '] 的 name「' + p.name + '」没出现在 basketBody 里');
  if (p.pct) assert(body.indexOf(p.pct) !== -1, 'B 失败: plan[' + i + '] 的 pct「' + p.pct + '」没出现在 basketBody 里');
  ['text', 'detail'].forEach((k) => {
    const probe = probeSeg(p[k]);
    if (!probe) return;   // 该字段太短/含需转义字符 ⇒ 本探针不适用, 不是失败
    assert(body.indexOf(probe) !== -1,
      'B 失败: plan[' + i + '].' + k + ' 的这段「' + probe.slice(0, 22) + '…」没出现在 basketBody 里');
  });
});
withDir.forEach((m) => {
  assert(body.indexOf(m.label) !== -1, 'B 失败: ' + m.label + ' 没出现在 basketBody 里');
  assert(body.indexOf(m.direction) !== -1, 'B 失败: ' + m.label + ' 的方向「' + m.direction + '」没出现在 basketBody 里');
  ['synthesis', 'note'].forEach((k) => {
    const probe = probeSeg(m[k]);
    if (!probe) return;
    assert(body.indexOf(probe) !== -1,
      'B 失败: ' + m.label + '.' + k + ' 的这段「' + probe.slice(0, 22) + '…」没出现在 basketBody 里');
  });
});

// 列头必须存在 —— 方向是**新增的一列**, 不是塞在别的单元格里(这是"看得见"的关键)
assert(body.indexOf('🐻 方向') !== -1, 'B 失败: 表格里没有「🐻 方向」列头');

// 加粗转换生效: 长文字段里的 `**` 必须已经变成 <b>, 页面上不该残留字面星号
assert(body.indexOf('**') === -1,
  'B 失败: basketBody 里残留字面 `**` —— rich() 的加粗转换没生效(或某个短标签字段误写了 `**`)');
assert(body.indexOf('<b>') !== -1, 'B 失败: basketBody 里一个 <b> 都没有 —— 加粗转换没跑');

// ---- C. 生成器: 幂等 + 保留方向层 ----
//   这是本文件最重要的一条: ①方向层被覆盖 ②重跑产生字节漂移, 两种都曾真实发生过。
const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/_lq_site.js'), '--dry'],
  { cwd: ROOT, encoding: 'utf8' });
const mKeep = out.match(/↳ 方向层保留: plan (\d+) 篇 · 含逐场方向 (\d+) 天/);
assert(mKeep && Number(mKeep[1]) > 0,
  'C 失败: _lq_site.js 没有报告保留方向层 —— 回挂逻辑没跑, 重跑会把方向层抹掉');
const mBytes = out.match(/预计字节 (\d+) → (\d+)/);
assert(mBytes, 'C 失败: 没解析到 _lq_site.js 的字节数报告');
assert.strictEqual(mBytes[1], mBytes[2],
  'C 失败: 生成器**不再幂等** —— 同一批池文件重跑 ' + mBytes[1] + ' → ' + mBytes[2] +
  ' 字节。漂移一旦存在, "真变化"和"噪声"就再也分不开(历史坑: ouPick:"" 被当空值跳过, 每次少 88 字节)');
const mDrop = out.match(/⚠️ 旧方向层有 (\d+) 场的判断这次挂不上/);
assert(!mDrop, 'C 失败: ' + (mDrop ? mDrop[1] : '?') + ' 场的旧方向层挂不上(该场已不在池里), 需人工确认');

console.log('SMOKE OK — 篮球方向层通过(' + date + ': plan ' + plan.length + ' 张 · 逐场方向 ' +
  withDir.length + ' 场 · 渲染断言 ' + (plan.length * 2 + withDir.length * 2 + 3) + ' 项 · ' +
  '生成器幂等且保留 ' + mKeep[1] + ' 篇 plan / ' + mKeep[2] + ' 天方向)');
// 断绿只说明"那些字在", 不等于"看着对" ⇒ 留一个排错口子, 把真实 HTML 落盘人工看
if (process.env.DUMP) {
  const f = path.join(ROOT, 'tmp', 'basketBody.html');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, '<meta charset="utf-8">\n' + body, 'utf8');
  console.log('· 渲染结果已落盘: ' + f);
}
