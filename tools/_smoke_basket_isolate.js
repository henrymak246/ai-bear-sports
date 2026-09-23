/* tools/_smoke_basket_isolate.js — 篮球字段【污染隔离】冒烟(2026-09-23 新增)
 *
 * 为什么需要它: `day.basketball` 是**顶层独立字段**, 设计上自动绕开站上 5 处"遍历 day.matches
 * 且没有运动过滤"的足球统计 —— 但"设计上绕开"是**推理**, 不是**证据**。
 * 而这类污染的失效模式恰恰是**静默**的: 不报错、不白屏, 只是足球统计悄悄多出/少掉几场。
 * 所以本冒烟不推理, 直接**做对照实验**:
 *
 *     把 predictions.js 深拷一份, 逐日删掉 basketball, 两版各渲染一次,
 *     然后逐元素比对两份 DOM。
 *
 * 断言: **除 basketBody 外, 任何元素都不许有差异**。
 * 顺带把"删掉后 basketBody 必须变空"也断言上 —— 否则说明这份数据里根本没有篮球,
 * 对照实验等于没做(空过), 那才是最容易骗过自己的绿。
 *
 * 用法: node tools/_smoke_basket_isolate.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DAYS = new Function(fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8') + ';return PREDICTION_DAYS;')();
assert(Array.isArray(DAYS) && DAYS.length, '未读到 PREDICTION_DAYS');
const LIVE_ODDS_SRC = fs.readFileSync(path.join(ROOT, 'assets/live-odds.js'), 'utf8');
const STATS_SRC = fs.readFileSync(path.join(ROOT, 'stats.js'), 'utf8');
const INLINE_SRC = (function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const blocks = [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(blocks.length, 1, 'index.html 内联脚本块数应为 1, 实际 ' + blocks.length);
  return blocks[0][1];
})();

// ---- 伪 DOM(与 _smoke_site_render.js 同款, 但要把 els 表交出来做逐元素比对) ----
function mkEl(id) {
  return {
    id: id || '', tagName: 'DIV', innerHTML: '', textContent: '', hidden: false,
    style: {}, parentElement: null, nextElementSibling: null,
    _attrs: {}, _handlers: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    appendChild(c) { return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    getContext() { return null; },
    addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = this._handlers[t] || []; const i = a.indexOf(fn); if (i !== -1) a.splice(i, 1); },
    remove() {},
  };
}

function loadSite() {
  const els = {};
  const docHandlers = { click: [] };
  const documentStub = {
    body: mkEl('body'),
    _handlers: docHandlers,
    getElementById(id) { return els[id] || (els[id] = mkEl(id)); },
    createElement(tag) { const e = mkEl(); e.tagName = String(tag).toUpperCase(); return e; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { (docHandlers[t] = docHandlers[t] || []).push(fn); },
    removeEventListener(t, fn) { const a = docHandlers[t] || []; const i = a.indexOf(fn); if (i !== -1) a.splice(i, 1); },
  };
  const sandbox = {
    console, Date, Math, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    URLSearchParams,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, setTimeout,
    document: documentStub,
    fetch: function () { return Promise.reject(new Error('offline')); },  // 渲染不取数
    location: { search: '?dev', reload() {} },
    navigator: { userAgent: 'node' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    confirm() { return false; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(LIVE_ODDS_SRC, sandbox, { filename: 'assets/live-odds.js' });
  vm.runInContext(STATS_SRC, sandbox, { filename: 'stats.js' });
  vm.runInContext(INLINE_SRC, sandbox, { filename: 'index.html:inline' });
  return { sb: sandbox, els };
}

// ---- 两份数据: 原样 / 逐日删掉 basketball ----
const stripped = JSON.parse(JSON.stringify(DAYS));
const nBasketDays = stripped.filter((d) => d.basketball).length;
assert(nBasketDays > 0, 'predictions.js 里一天 basketball 都没有 —— 对照实验会**空过**, 拒绝给绿');
stripped.forEach((d) => { delete d.basketball; });

const A = loadSite(); A.sb.renderApp(DAYS);
const B = loadSite(); B.sb.renderApp(stripped);

// ---- 断言 1: 对照组必须真的生效 ----
// ★注意断言写法: **不能**要求"删掉后 basketBody 必须为空" —— renderBasket 对"这天没有篮球"
//   会渲一段空态文案(正常行为, 也是页面该有的样子)。拿"必须为空"当判据, 只会把自己的
//   正常空态误判成污染。真正要证明的是**数据没了**: 内容必须变, 且行内容(场次号/队名)消失。
const bodyA = (A.els.basketBody || {}).innerHTML || '';
const bodyB = (B.els.basketBody || {}).innerHTML || '';
assert(bodyA.length > 0, '带 basketball 渲染后 basketBody 是空的 —— 渲染路径没跑到, 对照无意义');
assert(bodyA !== bodyB, '删掉 basketball 后 basketBody 一字未变 —— 对照没生效, 后面的零差异等于空过');
const sample = (DAYS.find((d) => d.basketball && d.basketball.matches.length) || {}).basketball.matches[0];
assert(bodyA.indexOf(sample.label) !== -1, '带 basketball 时 basketBody 里找不到 ' + sample.label + ' —— 渲染没落地');
assert(bodyB.indexOf(sample.label) === -1, '删掉 basketball 后 ' + sample.label + ' 还在 basketBody 里');

// ---- 断言 2: ★核心★ 除 basketBody 外, 逐元素零差异 ----
const ids = new Set([...Object.keys(A.els), ...Object.keys(B.els)]);
const diffs = [];
for (const id of ids) {
  if (id === 'basketBody') continue;
  const x = (A.els[id] || {}).innerHTML || '';
  const y = (B.els[id] || {}).innerHTML || '';
  if (x !== y) diffs.push({ id, withBasket: x.length, without: y.length });
}
assert.strictEqual(diffs.length, 0,
  '★污染★ 删掉 day.basketball 后这些元素变了(说明篮球数据渗进了足球统计):\n' +
  diffs.slice(0, 8).map((d) => '   #' + d.id + '  ' + d.withBasket + ' → ' + d.without + ' 字节').join('\n'));

// ---- 断言 3: 顶层字段没溜进 matches[] ----
const leaked = DAYS.filter((d) => (d.matches || []).some((m) => m && (m.basketball || m.sport === 'basketball' || m.sportId === 2)));
assert.strictEqual(leaked.length, 0, '有 ' + leaked.length + ' 天的 matches[] 里出现篮球痕迹: ' + leaked.map((d) => d.date).join(', '));

const nGames = DAYS.reduce((s, d) => s + ((d.basketball && d.basketball.matches || []).length), 0);
console.log('SMOKE OK — 篮球字段污染隔离通过(' + nBasketDays + ' 天 / ' + nGames + ' 场; 比对 ' + (ids.size - 1) + ' 个元素, 除 basketBody 外零差异)');
