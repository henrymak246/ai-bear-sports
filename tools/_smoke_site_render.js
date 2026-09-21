/* tools/_smoke_site_render.js — 网站首页渲染冒烟(node 伪 DOM + 真 index.html 内联脚本)
 *
 * 为什么需要它: 网站在 `bootApp` 里**会调两次 renderApp**(先渲构建时快照, 竞彩实时赔率
 * 回来后再渲一次, 见 assets/live-odds.js)。这条路径此前只在浏览器里跑过, 没有自动验证 ——
 * 而两次渲染已经踩到一个坑: renderApp 内部对 document 挂了点击委托,
 * 重复 addEventListener 会让「折叠/展开」在同一次点击里触发两遍而互相抵消(点了没反应)。
 *
 * 覆盖:
 *   ① 内联脚本能在伪 DOM 里跑完一次 renderApp(证明渲染路径没有对 DOM 的隐藏依赖)
 *      + 让球-only 场(官方只开让球、没开胜平负)在**快照渲染**里就是让球口径
 *   ② bootApp 跑完(两次渲染)后 document 级点击委托**仍只有一条**
 *   ③ 实时叠加落地后方案卡倍数已刷新并带口径标注; 官方池里没有的场次标"已停售"
 *      + 让球-only 的判定以**官方池**为准(快照说是、官方说不是 → 改回胜平负口径)
 *   ④ 官方取数失败 → 页面保持构建时快照, 不报错不变白
 *   ⑤ 非今日数据 → 日期闸拦住取数, 一次网络都不发
 *   ⑥(仅联网) 真打官方: 页面上的倍数必须换成实时值, 不能停在 858
 *
 * ②③④⑤ 一律用本地 fixture: 官方每天在售的场次都不一样, 拿真数据没法断言
 * "某场被下架"(今天恰好没下架就永远绿)。真连官方的那点放在 ⑥, 只验"没用旧值"。
 * 让球-only 那段反过来 —— 它只在**真实 predictions.js** 上才有意义(今天恰好有),
 * 所以断言直接跑真数据, 场次号从数据里现取(写死 013 的话明天就烂)。
 *
 * 用法: node tools/_smoke_site_render.js              (fixture + 真连一次 webapi.sporttery.cn)
 *       node tools/_smoke_site_render.js --offline    (只用 fixture, 断网可跑)
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OFFLINE = process.argv.indexOf('--offline') !== -1;

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

/* ★把这份**昨天的快照**还原成"今天、赛前"的样子: 日期戳改写成北京时间今天 + 抹掉已结算标记。
   两件都是必须的, 少一件 ②③④ 就会**空过**(页面停在快照上, 断言照样绿, 等于什么都没验):
     · 日期不是今天 → LiveOdds 的日期闸直接原样返回(见 overlayDay 首行);
     · 腿带 result → overlayPlan 认定"这关成败已成事实, 全中约N倍不再是可谈的价格",
       主动不刷总数、也不让方案卡的大号数字跟着动(见其注释与 _smoke_live_odds ③)。
   "已结算腿不参与实时刷新"是**另一条**规矩, 由 _smoke_live_odds.js ③ 专门卡着, 这里不重复验。
   ②③④ 验的是叠加机制本身, 输入本就该是一份"今天、还没开赛"的日对象 ——
   与真数据是谁无关(fixture 池就是拿同一个 day 对象现造的, 内部自洽)。 */
const TODAY_BJ = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

/* ★让球-only(官方只开让球、没开胜平负)这一形态**不是每天都有**: 官方按天开售,
   2026-09-17 周四池 10 场就全开了 310, 当天的让球-only 落在周五008(=明天的卡)。
   而 ①b/③b 两段断言只有存在该形态才跑得起来 —— 写成"今天必须有"会让本冒烟
   在没这形态的日子整条红掉, 但那天数据其实完全正常。所以: 真数据有 → 照旧用真数据;
   没有 → 在本测试的**内存副本**里把一场改造成让球-only(删 sp、保留 hhad), ①b/③b 照常真跑一遍。
   ★改的是 JSON 副本, data/predictions.js 一个字不动, 站点数据不失真。
   ★替身场的两条硬约束(踩过才知道):
     · 不能是 matches[0] —— fixture 把首场当"已过销售截止下架", had/hhad **两个池都没有**它,
       ③b 就验不到"让球SP 换成官方实时值"那条;
     · 不能在任何方案块的腿里(combo7/hc7/max7) —— 那些腿要取池子里的实时价,
       被排除出池后页面不会刷新它, 方案卡倍数断言(③)会拿实时值去比一个还是构建值的数, 假红。 */
/* 方案块清单: 合并后(2026-09-21 起)只有 combo7, 之前的日子是 hc7 + max7 ——
   冒烟必须**两种日子都跑得起来**(合并当天两边都要绿), 所以按"当天实际有什么"取, 不写死板块名。
   pool 是板块级彩池; 'auto' = combo7 的逐腿按 play 取池(见 assets/live-odds.js poolOfLeg)。 */
const BLOCK_POOLS = [['combo7', 'auto'], ['hc7', 'hhad'], ['max7', 'sp']];
const hasBlock = (d) => !!d && BLOCK_POOLS.some((b) => d[b[0]] && Array.isArray(d[b[0]].legs) && d[b[0]].legs.length);
/* ★方案块的**内容**也可能整天缺席(2026-09-21 首个案例: 竞彩扁平日, 在售仅 1 场 → 1 关不成过关,
   经拍板整天不出 combo7)。它照样是一次正常构建、页面照样要能跑起来, 只是没串关可叠 ——
   所以板块内容退回到**最近一个真有方案块的日子**, 只把日期改写成今天(日期闸认日期不认内容),
   并打一行明说借的是哪天: ②③ 验的是叠加机制, 与那天的具体腿是谁无关。
   ★借用时 ⑥ 必须跳过: ⑥ 是**真打官方**拿今天这批场次号去对的, 借来的场次号在官方池里压根不存在。 */
const SRC_DAY = hasBlock(DAYS[0]) ? DAYS[0] : DAYS.find(hasBlock);
assert(SRC_DAY, '今日与全部历史日都没有方案块(combo7/hc7/max7), ②③ 无从验起');
const BORROW = SRC_DAY !== DAYS[0];
/* ★混选面板(combo7)是合并后的**主面板**, 它的渲染路径必须每天都真跑一遍 ——
   可它偏偏是"新日子"才有的块, 而需要借用旧日子的雨天(竞彩扁平日)恰好没有它。
   于是借到的是 hc7+max7 旧日子时, 在副本里**合成**一块 combo7:
     · 腿 = 该日 hc7 前 4 条 + max7 前 3 条(补上 play; 让球腿的 pick 按合并约定改写成盘口前缀式);
     · 方案卡换成「💥 综合过关」且 pct 与该块 totalOdds **同源**(与构建脚本同一口径 ——
       不同源的话 ④ 的"快照即 pct"与 ③ 的"叠加后必须改写"两条会互相打架)。
   验的是"混选面板能渲染 / 两盘腿各取对彩池 / 旧面板让位", 与这几条腿本来属于哪天无关。
   有真 combo7 的日子(以及将来真建了 combo7 的当天)走的是原样, 不合成。 */
const SRC = (function () {
  if ((SRC_DAY.combo7 || {}).legs && SRC_DAY.combo7.legs.length) return SRC_DAY;
  const hc = ((SRC_DAY.hc7 || {}).legs) || [], mx = ((SRC_DAY.max7 || {}).legs) || [];
  if (!hc.length || !mx.length) return SRC_DAY;
  const d = JSON.parse(JSON.stringify(SRC_DAY));   // 只动副本: DAYS[0] 是 require 出来的真数据
  const spH = {};
  (d.matches || []).forEach((m) => { spH[String(m.id).slice(-3)] = m.spHandicap; });
  const PRE = /^让[+-]?\d+(?:\.\d+)?\s+/;          // 已经是盘口前缀式的原样留, 裸式(让胜/让平/让负)才补前缀
  const single = (l) => l.pick && !/[/]/.test(String(l.pick)) && !/[/]/.test(String(l.odds));
  const legs = [];
  hc.slice(0, 4).forEach((l) => {
    const g = spH[String(l.match).slice(0, 3)];
    if (!single(l) || g === undefined || g === null || isNaN(g)) return;
    legs.push({ play: '让球胜平负', league: l.league, match: l.match, odds: l.odds, reason: l.reason, result: null,
      pick: PRE.test(String(l.pick).trim()) ? l.pick : ('让' + (Number(g) >= 0 ? '+' : '') + g + ' ' + l.pick) });
  });
  mx.slice(0, 3).forEach((l) => {
    if (!single(l)) return;
    legs.push({ play: '胜平负', league: l.league, match: l.match, pick: l.pick, odds: l.odds, reason: l.reason, result: null });
  });
  if (legs.length < 2) return SRC_DAY;
  let p = 1; legs.forEach((l) => { p *= parseFloat(String(l.odds).split('/')[0]); });
  const tot = p >= 100 ? String(Math.round(p)) : p.toFixed(1);
  d.combo7 = { totalOdds: legs.length + '关全串约' + tot + '倍', legs: legs, result: null,
    note: '(渲染冒烟合成块: 混选面板路径每天都要真跑一遍, 见 tools/_smoke_site_render.js 顶部注释)' };
  delete d.hc7; delete d.max7;
  const card = (d.plan || [])[2];
  if (card) { card.name = '💥 综合过关（胆拖·让球混选）'; card.pct = '≈' + tot + '倍'; card.text = '(渲染冒烟合成卡)'; }
  console.log('注: ' + SRC_DAY.date + ' 是 hc7+max7 旧日子 → 副本里合成一块 combo7(' + legs.length + ' 腿: '
    + legs.filter((l) => l.play === '让球胜平负').length + ' 让球 / ' + legs.filter((l) => l.play === '胜平负').length
    + ' 不让球), 让混选面板的渲染路径也真跑一遍');
  return d;
})();
const BLOCKS = BLOCK_POOLS
  .filter((b) => SRC[b[0]] && Array.isArray(SRC[b[0]].legs) && SRC[b[0]].legs.length);
const BLK_PANEL = { combo7: 'combo7Blocks', hc7: 'hc7Blocks', max7: 'max7Blocks' };
if (BORROW) {
  console.log('注: 今天(' + DAYS[0].date + ')没有方案块(竞彩扁平日, 竞彩在售不足 2 场 → 不成过关) →'
    + ' ②③④ 借用 ' + SRC.date + ' 的板块内容(日期改写成今天, 只改内存副本); ⑥(真连官方)随之跳过');
}
/* 纯函数(含 pickIdx / poolOfLeg)从 live-odds 源码里取 —— 与网站沙箱同一份源码, 同一个 window 套路 */
const LO = (function () {
  const sb = { console, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, isNaN };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(LIVE_ODDS_SRC, sb, { filename: 'assets/live-odds.js' });
  assert(sb.LiveOdds && sb.LiveOdds._internals, '未从 assets/live-odds.js 取到 _internals');
  return sb.LiveOdds;
})();
const NH_DONOR_SKIP = (d) => new Set([].concat(...BLOCKS.map((b) =>
  ((((d[b[0]] || {}).legs) || []).map((l) => String(l.match || '').slice(0, 3))))));
const todayDays = () => {
  const d = JSON.parse(JSON.stringify(SRC));
  d.date = TODAY_BJ;
  Object.keys(d).forEach((k) => {
    const b = d[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && Array.isArray(b.legs)) {
      delete b.result;
      b.legs.forEach((l) => { delete l.result; });
    }
  });
  const isNoHad = (m) => !m.sp && Array.isArray(m.hhad) && m.hhad.length === 3;
  if (!(d.matches || []).some(isNoHad)) {
    const skip = NH_DONOR_SKIP(d);
    const cands = (d.matches || []).filter((m, i) => i > 0 && m.sp && Array.isArray(m.hhad)
      && m.hhad.length === 3 && !skip.has(String(m.id).slice(-3)));
    // 优先挑"正文里点过场次号"的: ③b 的口径说明靠"正文引用了这场"才挂得出来
    const texts = (d.plan || []).map((p) => String(p.text || '')).join(' ');
    const donor = cands.filter((m) => texts.indexOf(String(m.id).slice(-3)) !== -1)[0] || cands[0];
    assert(donor, '今日无让球-only 场, 且找不到可改造的替身场(需: 非首场 + 有 hhad + 不在任何方案块腿里)');
    delete donor.sp;
    console.log('  · 今日官方池无让球-only 场 → 内存副本里把 ' + donor.id + ' 改造为让球-only, ①b/③b 照常真跑');
  }
  return [d];
};
/* 构建时快照里"让球胜平负"卡的大号倍数。★不写死 858: 那是当天那份数据的数, 建了新一天就换数。
   要断言的是"首屏显示的是构建时快照"/"叠加后不再是无口径标注的旧值", 不是"数字恰好是 858"。 */
const SNAP_PCT = ((SRC.plan || [])[2] || {}).pct || '≈858倍';

// ---- 伪 DOM: 一份 sandbox = 一个 document(与浏览器一致) ----
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
    removeEventListener(t, fn) {
      const a = this._handlers[t] || [];
      const i = a.indexOf(fn);
      if (i !== -1) a.splice(i, 1);
    },
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
    removeEventListener(t, fn) {
      const a = docHandlers[t] || [];
      const i = a.indexOf(fn);
      if (i !== -1) a.splice(i, 1);
    },
  };
  const sandbox = {
    console, Date, Math, JSON, Promise, Object, Array, String, Number, Boolean, RegExp, Error,
    URLSearchParams,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, setTimeout,
    document: documentStub,
    // live-odds.js 在沙箱里跑, 它的 fetch 得转出去 —— 每次调用现取 global.fetch,
    // 这样各阶段换桩(正常/失败)立刻生效, 不用重建沙箱
    fetch: function () { return global.fetch.apply(null, arguments); },
    location: { search: '?dev', reload() {} }, // ?dev → 引导块早退, 由本冒烟自己调 bootApp
    navigator: { userAgent: 'node' },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    confirm() { return false; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // <script> 顺序与 index.html 一致: supabase(本冒烟走 ?dev, 不碰它) → live-odds → stats → 内联块
  vm.runInContext(LIVE_ODDS_SRC, sandbox, { filename: 'assets/live-odds.js' });
  vm.runInContext(STATS_SRC, sandbox, { filename: 'stats.js' });
  vm.runInContext(INLINE_SRC, sandbox, { filename: 'index.html:inline' });
  return sandbox;
}

const htmlIn = (sb, id) => sb.document.getElementById(id).innerHTML || '';
const clicks = (sb) => sb.document._handlers.click.length;
const settle = () => new Promise((r) => setTimeout(r, 300));
/* ★联网那段不能拿固定 sleep 等实时叠加: 官方接口傍晚会明显变慢, 300ms 常常不够,
   计划区还是构建时快照 —— 断言就假红(2026-09-15 21:30 实测: 改等 4s 才出「已接官方实时」)。
   除非本地桩(②③, fetch 是同步返回的桩)才用固定 settle; 真打官方一律轮询到标记落地为止。 */
const settleUntil = async (cond, ms = 10000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return cond();
};
/* 从对阵表 HTML 里抠出某一场那一行(<tr>…</tr>)。
   ★必须落到"这一行"上: '无(官方未开)' / '未开售' / '让+2' 这类串在整张表里会互相串味,
     全局 indexOf 分不清命中的是哪一场 —— 那断言就等于没跑。 */
const rowOf = (html, id) => String(html).split('<tr>').find((s) => s.indexOf('>' + id + '<') !== -1) || '';
/* 同一行的纯文本(去标签后压空白): 盘口行被拆成「标签 span + 赔率 span」两段,
   拿纯文本比对才不会被中间的标签打断(标签本身另有断言管) */
const rowTxt = (h) => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
/* 该场的让球盘口文本(项目统一带符号: 让+2 / 让-1) */
const hcapTxt = (m) => '让' + (Number(m.spHandicap) > 0 ? '+' + m.spHandicap : m.spHandicap);
/* 页面上的方向词(官方口径, 与 index.html offDir 同款): 数据字段是 主胜/客胜, 卡片上写 胜/负;
   让球盘写 让球胜/让球平/让球负 —— 官方从不写"主客"。这里独立实现一遍, 免得拿被测代码算期望值。 */
const offDir = (direction, hhadK) => String(direction || '').split('/').map((s) => {
  const t = { '主胜': '胜', '客胜': '负', '平': '平' }[s.trim()];
  if (!t) return s;
  return hhadK ? (t === '平' ? '让球平' : '让球' + t) : t;
}).join('/');
/* 盘口行整串: 让球胜负(让-1) 2.20/3.60/2.60 —— 标签带盘口, 与官方计算器的 [-1] 盘口框对应 */
const hhadRowTxt = (m) => '让球胜负(' + hcapTxt(m) + ') ' + m.hhad.join('/');

/* 官方返回形态的本地 fixture。
   ★全部场次用**同一组固定价**, 不跟快照走: 这样每关的实时值都落在这几个常数上,
     方案倍数可以手算出来硬写进断言 —— 用快照价的话"漂移后等于多少"自己也得跟着算一遍,
     等于拿被测代码的算法算期望值, 断言就空了(见文件末尾 ③ 的手算过程)。
   ★skipFirst: 官方池里**不含**首场 = 该场已过销售截止被下架 —— "已停售禁投"与
     "方案倍数含已停售腿"两条都靠它才有得验, 所以 fixture 必须真的漏掉一场。 */
const HAD_LIVE = { h: 2.00, d: 3.00, a: 4.00 };   // 胜平负池的实时价
const HHAD_LIVE = { h: 1.50, d: 3.50, a: 5.00 };  // 让球池的实时价
/* hadMissing: 这些场次**官方 had 池里压根没有**(只有 hhad 池有)—— 这就是"官方只开让球、
   没开胜平负"的真实形态, 也是让球-only 判定的唯一权威来源(见 assets/live-odds.js noHadOf)。
   不加这个参数的话 fixture 会给每场都塞一份 had, 让球-only 到了叠加阶段就被"洗"没了。 */
function officialFixture(day, skipFirst, hadMissing) {
  const miss = hadMissing || [];
  return function (url) {
    const isHhad = String(url).indexOf('poolCode=hhad') !== -1;
    const p = isHhad ? HHAD_LIVE : HAD_LIVE;
    const subMatchList = (day.matches || []).slice(skipFirst ? 1 : 0)
      .filter((m) => isHhad || miss.indexOf(m.id) === -1)
      .map(function (m) {
        const o = { h: p.h, d: p.d, a: p.a, goalLine: m.spHandicap, updateTime: '19:07:01' };
        return { matchNumStr: m.id, matchStatus: 'Selling', had: isHhad ? {} : o, hhad: isHhad ? o : {} };
      });
    const body = { value: { matchInfoList: [{ subMatchList: subMatchList }] } };
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  };
}

const realFetch = global.fetch; // ⑥ 要真打官方, 先留一份

(async () => {
  // ---- ① 一次 renderApp: 内联脚本能在伪 DOM 里跑完 ----
  const sb = loadSite();
  assert.strictEqual(typeof sb.bootApp, 'function', '未定义 bootApp');
  assert.strictEqual(typeof sb.renderApp, 'function', '未定义 renderApp');
  sb.renderApp(todayDays()); // 只渲快照, 不等网络
  assert(htmlIn(sb, 'planBlocks').length > 0, '① planBlocks 应有内容');
  assert(htmlIn(sb, 'dailyList').length > 0, '① 应产出当日对阵表');
  assert(htmlIn(sb, 'planBlocks').indexOf(SNAP_PCT) !== -1, '① 首屏应是构建时快照(' + SNAP_PCT + ')');

  /* ---- ①b 让球-only: 官方只开让球、没开胜平负的场 ----
     用户 2026-09-15 的原话: "013皇马是-2球的盘, 没有开不让球的胜平负" ——
     当时卡片上顶着一个**投不了的**胜平负方向。这段跑的是**真实 data/predictions.js**
     (今天恰好有这样的场), 而且是在**任何网络之前**: 快照渲染就该是让球口径,
     不能等实时值回来了才改 —— 拿不到实时值的时候(④)尤其不能又退回胜平负口径。 */
  const nd = todayDays();
  const nhIds = (nd[0].matches || []).filter(function (m) {
    return !m.sp && Array.isArray(m.hhad) && m.hhad.length === 3;
  }).map(function (m) { return m.id; });
  assert(nhIds.length > 0,
    '今天这份数据里应至少有一场让球-only, 否则本段断言等于空跑(换日期时请核对)');
  const tbl1 = htmlIn(sb, 'dailyList');
  assert(tbl1.indexOf('od-nohad') !== -1 && tbl1.indexOf('无(官方未开)') !== -1,
    '让球-only 场的「胜负」行该写「无(官方未开)」, 而不是「未开售」(那是"还没开", 这是"压根没有")');
  assert(tbl1.indexOf('dtag-rang') !== -1, '让球-only 场的方向行该挂「让球」徽章');
  assert(tbl1.indexOf('nohad-tip') !== -1, '让球-only 场该有一句"可投的就是让球那一注"的提醒');
  const mNh = nd[0].matches.filter(function (m) { return m.id === nhIds[0]; })[0];
  const rowNh = rowOf(tbl1, mNh.id);
  assert(rowNh, '对阵表里没找到 ' + mNh.id + ' 那一行');
  assert(rowNh.indexOf('无(官方未开)') !== -1 && rowNh.indexOf('未开售') === -1,
    '★' + mNh.id + ' 那一行: 该说"压根没有这个盘", 不该说"还没开售"');
  if (mNh.direction) {
    assert(rowNh.indexOf(hcapTxt(mNh) + ' ' + offDir(mNh.direction, true)) !== -1,
      mNh.id + ' 方向行该带让球线与官方口径词「' + hcapTxt(mNh) + ' ' + offDir(mNh.direction, true) + '」, 实际行: ' +
      rowNh.slice(0, 300));
  }
  // 让球那一行整串带标签: 让球胜负(让+2) 2.36/4.25/2.13 —— 省掉正号会跟方向行看着像两个盘
  assert(rowTxt(rowNh).indexOf(hhadRowTxt(mNh)) !== -1,
    mNh.id + ' 的让球SP 该写「' + hhadRowTxt(mNh) + '」, 实际: ' + rowTxt(rowNh).slice(0, 200));
  // 两个盘各一行: 让球-only 场的「胜负」行是"无", 让球行照旧有价
  assert(rowNh.indexOf('>胜负<') !== -1 && rowNh.indexOf('>让球胜负(') !== -1,
    mNh.id + ' 该把两个盘分开写成「胜负」/「让球胜负(盘口)」两行, 实际行: ' + rowNh.slice(0, 300));
  console.log('OK 1/5 内联脚本能在伪 DOM 里跑完一次 renderApp(planBlocks ' + htmlIn(sb, 'planBlocks').length + ' 字节)');
  const flat = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log('  + 让球-only ' + nhIds.join('/') + ' 快照即让球口径, 实际渲染:');
  // 只打方向段到 SP 段: 前面的联赛/亚盘/比分对本条无关, 全打出来反而看不清
  nhIds.forEach(function (id) {
    const t = flat(rowOf(tbl1, id));
    const i = t.indexOf('让球', t.indexOf('待赛'));
    console.log('      ' + t.slice(i === -1 ? 0 : i, i === -1 ? 190 : i + 150));
  });

  // ---- ②③ bootApp: 两次渲染 + 实时叠加 ----
  const d = todayDays();
  const closedId = d[0].matches[0].id; // fixture 里被跳过 → 官方池里没有它 → 应被标"已停售"
  /* 让球-only 那份场次, 第一场**照样不在官方 had 池里**(临场也没开 310, 与用户报的 013 同形),
     后面几场则让官方 had 池里有它 —— 快照说"没开"、官方说"开了", 这时**官方说了算**:
     310 是可能临场才开的, 谁权威不能靠快照猜(见 assets/live-odds.js noHadOf / applyRow)。 */
  const fx = officialFixture(d[0], true, nhIds.slice(0, 1));
  global.fetch = async (url) => {
    if (String(url).indexOf('sporttery.cn') === -1) throw new Error('意外请求 ' + url);
    return fx(url);
  };
  const sb2 = loadSite();
  await sb2.bootApp(d);
  await settle();

  assert.strictEqual(clicks(sb2), 1,
    '★两次 renderApp 后 document 点击委托应恰好 1 条, 实际 ' + clicks(sb2) + ' 条(重复挂会让折叠/展开自我抵消)');
  assert.strictEqual(sb2.renderApp._click, sb2.document._handlers.click[0],
    '挂在 document 上的应是**本次**渲染新建的那条(闭包住本次 byDate)');
  console.log('OK 2/5 两次渲染后 document 委托仍只有 1 条(先摘旧再挂新)');

  const pb = htmlIn(sb2, 'planBlocks');
  assert(pb.length > 0, '③ 实时叠加后 planBlocks 不能被清空');
  assert(pb.indexOf('已接官方实时') !== -1, '③ 方案区应出现口径说明行');
  // 未加标注的裸倍数 = 还停在构建值上(标注落在「倍」后面, 所以裸的收尾是 '倍</div>')
  assert(pb.indexOf(SNAP_PCT + '</div>') === -1,
    '③ 方案卡不得再是**没有口径标注**的构建时倍数(快照 ' + SNAP_PCT + '), 实际卡片倍数: ' +
    JSON.stringify(pb.match(/≈[^<]*/g) || []));
  /* 期望值由 fixture 规则现推(与实现无关: 让球池固定价 = hhad[0..2] 的 1.50/3.50/5.00,
     胜平负池 = sp[0..2] 的 2.00/3.00/4.00, 被 skipFirst 下架的那场改用**构建值**顶上)。
     仍然在验同一件事: 卡片倍数是按实时值重算的、停售腿用构建值顶上、且选项→下标没串位。
     ★不写死数字(9-15 那份的 2412 是当时腿型乘出来的, 每天一变就必红)。
     ★按**下标**算而不是按选项名查表: combo7 的让球腿写成「让-1 让平」这种盘口前缀式,
       按名字查表查不到 —— 只有走 pickIdx 才对得上, 而 pickIdx 的前缀剥离正是合并后最该盯的地方。 */
  const FIX_IDX = { hhad: [1.50, 3.50, 5.00], sp: [2.00, 3.00, 4.00] };
  const closed3 = String(d[0].matches[0].id).slice(-3); // fixture skipFirst → 首场不在官方池里
  const isClosed = (l) => String(l.match).startsWith(closed3);
  const expectOdds = (legs, poolOf) => {
    const v = legs.reduce((a, l) => a * (isClosed(l) ? parseFloat(l.odds)
      : FIX_IDX[poolOf(l)][LO._internals.pickIdx(l.pick)]), 1);
    return v >= 100 ? Math.round(v) : v.toFixed(1);
  };
  /* 口径标注也跟着现推 —— 有腿没刷到时用词会变(见 assets/live-odds.js:256-260):
       方案卡 pct: 全刷到 '实时连乘' / 有下架腿 '含N条停售腿'
       方案块 totalOdds: 全刷到 '按当前实时赔率连乘' / 否则 '按页面显示赔率连乘, 含 N 条已停售腿构建值' */
  const cardLbl = (n) => (n === 0 ? '实时连乘' : '含' + n + '条停售腿');
  const blockLbl = (n) => (n === 0 ? '按当前实时赔率连乘' : '按页面显示赔率连乘, 含 ' + n + ' 条已停售腿构建值');
  /* 期望的整串: 前缀/句式**取该块自己的 totalOdds 模板**(不写死「7关全串约」这类字样),
     只把可替换的那段数字([\d.]+ 且后跟「倍」, 与 substTotal 同一口径)换成算出来的值 */
  const expectTotal = (k, n, closedN) => {
    const tmpl = String(d[0][k].totalOdds || '');
    if (!/[\d.]+(?=\s*倍)/.test(tmpl)) return null; // 该块本就不含可替换段 → 由调用方明说跳过
    return tmpl.replace(/[\d.]+(\s*倍)/, n + '$1') + '(' + blockLbl(closedN) + ')';
  };
  const exp = BLOCKS.map((b) => {
    const k = b[0], legs = d[0][k].legs;
    const n = legs.filter(isClosed).length;
    return { k: k, pool: b[1], legs: legs, closed: n,
      odds: expectOdds(legs, (l) => LO._internals.poolOfLeg(l, b[1])),
      total: expectTotal(k, expectOdds(legs, (l) => LO._internals.poolOfLeg(l, b[1])), n) };
  });
  exp.forEach((e) => {
    const html = htmlIn(sb2, BLK_PANEL[e.k]);
    assert(html.length > 0, '③ ' + e.k + ' 面板没渲染出来');
    assert(html.indexOf(e.total) !== -1,
      '③ ' + e.k + ' 倍数未按口径重算: 期望含 «' + e.total + '», 实际 ' +
      ((html.match(/约[^<]*/) || [''])[0] || '(没渲染出来)'));
  });
  /* 方案卡大号数字: 它跟着**哪一块**走由构建脚本决定(合并后是 combo7), 不在本冒烟假设之列;
     这里只验"卡片上那个数已经带上口径标注" —— 即不再是无标注的构建时裸值(见 :300-302)。 */
  const cardExp = exp.filter((e) => pb.indexOf('≈' + e.odds + '倍(' + cardLbl(e.closed) + ')') !== -1);
  assert(cardExp.length > 0,
    '③ 方案卡没跟上任何方案块的实时值(期望 ≈X倍(实时连乘) 或 ≈X倍(含N条停售腿)), 实际 ' +
    JSON.stringify(pb.match(/≈[^<]*/g) || []));
  const tbl = htmlIn(sb2, 'dailyList');
  assert(tbl.indexOf(closedId) !== -1, '③ 对阵表里应有 ' + closedId + ' 那场');
  assert(/已停售/.test(tbl), '③ 对阵表里应出现"已停售"标记');
  /* ★栏目合并的落点: combo7 当天**只出混选面板**, 两个旧面板必须让位(否则同一串挂三个面板)。
     反过来说, 旧日子(hc7/max7)不得出现 combo7 面板 —— 两种日子各验各的。 */
  if (BLOCKS.some((b) => b[0] === 'combo7')) {
    assert(htmlIn(sb2, BLK_PANEL.hc7) === '' && htmlIn(sb2, BLK_PANEL.max7) === '',
      '③ 合并后当天只该出混选面板, 旧 hc7/max7 面板应让位(实际 hc7=' +
      htmlIn(sb2, BLK_PANEL.hc7).length + ' 字节, max7=' + htmlIn(sb2, BLK_PANEL.max7).length + ' 字节)');
    const c7 = htmlIn(sb2, BLK_PANEL.combo7);
    assert(c7.indexOf('让球') !== -1 && c7.indexOf('不让球') !== -1,
      '③ 混选面板该同时标出两盘的腿(让球/不让球徽章), 实际没看全');
    console.log('  + 混选面板 ' + c7.length + ' 字节: ' + exp[0].legs.length + ' 腿(' +
      exp[0].legs.filter((l) => String(l.play).indexOf('让') !== -1).length + ' 让球 / ' +
      exp[0].legs.filter((l) => String(l.play).indexOf('让') === -1).length + ' 不让球), 旧面板已让位');
  } else {
    assert(htmlIn(sb2, BLK_PANEL.combo7) === '', '③ 该日没有 combo7, 不该渲染混选面板');
  }

  // ③b 让球-only 以**官方池**为准(不是快照)
  const rowNhLive = rowOf(tbl, nhIds[0]);
  assert(rowNhLive.indexOf('无(官方未开)') !== -1,
    '③ ' + nhIds[0] + ' 官方 had 池里同样没有它 → 叠加后仍应是让球口径, 实际行: ' + rowNhLive.slice(0, 300));
  assert(rowNhLive.indexOf('未开售') === -1, '③ 让球-only 不是"没开售", 别退回那个说法');
  const hhadLive = HHAD_LIVE.h + '/' + HHAD_LIVE.d + '/' + HHAD_LIVE.a;
  assert(rowTxt(rowNhLive).indexOf('让球胜负(' + hcapTxt(d[0].matches.filter(function (m) { return m.id === nhIds[0]; })[0]) +
    ') ' + hhadLive) !== -1,
    '③ ' + nhIds[0] + ' 的让球SP 该换成官方实时值 ' + hhadLive + ', 实际: ' + rowTxt(rowNhLive).slice(0, 200));
  if (nhIds[1]) {
    const rowFlip = rowOf(tbl, nhIds[1]);
    assert(rowFlip.indexOf('无(官方未开)') === -1 && rowFlip.indexOf('>胜负</span> <span class="odds">') !== -1,
      '★' + nhIds[1] + ' 官方 had 池里**有**它 → 快照的"没开 310"要让位给官方池(改回胜平负口径), 实际行: ' +
      rowFlip.slice(0, 300));
  }
  // 方案卡口径说明: 正文把让球-only 的场当胜平负写了 → 挂一句; 点名的是**当下仍让球-only**的场
  const noteSeg = (pb.match(/<div class="pb-note">([\s\S]*?)<\/div>/) || [])[1] || '';
  assert(noteSeg.indexOf('官方只开让球') !== -1,
    '③ 双选方向卡(正文写 013皇马)该挂口径说明, 实际 planBlocks: ' + pb.slice(0, 200));
  assert(noteSeg.indexOf(nhIds[0].slice(-3)) !== -1,
    '③ 口径说明里该点名 ' + nhIds[0].slice(-3) + ', 实际: ' + noteSeg);
  if (nhIds[1]) {
    assert(noteSeg.indexOf(nhIds[1].slice(-3)) === -1,
      '③ ' + nhIds[1].slice(-3) + ' 官方已开 310 → 不该再被提醒, 实际: ' + noteSeg);
  }
  /* (原来这里另有两段 max7/hc7 的硬写断言 —— 已并入上面 exp.forEach 的通用版:
     被下架那场只能用构建值顶上, 依据要写成"含 N 条已停售腿构建值", 这是本冒烟最该锁住的那句话:
     只刷腿不刷总倍数, 页面上就会出现"一列新赔率配一个旧倍数"。句式取自各块自己的模板,
     所以 combo7 与 hc7/max7 走的是同一条断言, 换板块名不用再改这里。) */
  console.log('OK 3/5 方案块倍数已随实时值刷新: ' + exp.map((e) => e.k + '→' + e.odds + '(' + cardLbl(e.closed) + ')').join(' | ')
    + ' | 方案卡=' + ((pb.match(/≈[^<]*/) || [''])[0]));

  // ---- ④ 取数失败 → 保持快照 ----
  global.fetch = async () => { throw new Error('network down'); };
  const sb3 = loadSite();
  const p3 = todayDays();
  const snap = p3[0].plan[2].pct; // 🔵 让球胜平负 的 ≈858倍
  await sb3.bootApp(p3);
  await settle();
  assert(htmlIn(sb3, 'planBlocks').length > 0, '④ 取数失败也要渲染出快照, 不能变白');
  assert(htmlIn(sb3, 'planBlocks').indexOf(snap) !== -1, '④ 失败时应仍是构建值 ' + snap);
  assert(htmlIn(sb3, 'dailyList').length > 0, '④ 对阵表同样要在');
  console.log('OK 4/5 取数失败: 页面保持构建时快照(' + snap + '), 不报错不变白');

  // ---- ⑤ 非今日 → 日期闸拦在取数之前(取数一旦发生就会抛) ----
  global.fetch = async () => { throw new Error('⑤ 非今日不得发起取数'); };
  const sb4 = loadSite();
  const old = JSON.parse(JSON.stringify(DAYS[DAYS.length - 1]));
  const oldPct = (old.plan || [])[2] ? old.plan[2].pct : null;
  await sb4.bootApp([old]);
  await settle();
  assert(oldPct === null || htmlIn(sb4, 'planBlocks').indexOf(oldPct) !== -1,
    '⑤ 历史日应原样渲染, 倍数不得被叠加改写');
  console.log('OK 5/5 非今日数据(' + old.date + '): 日期闸拦住取数, 一次网络都不发');

  // ---- ⑥(仅联网) 真打官方: 官方今天在售的就是这些场, 页面上的倍数必须换掉 ----
  let n = 5;
  if (!OFFLINE && (BORROW || DAYS[0].date !== TODAY_BJ)) {
    /* ★⑥ 与前五段不同: 它是**真打官方**、拿今天这批场次对着官方实时池验的。
       最新一天不是今天时官方池里压根没有那批场次号 —— 验不了(上面 ②③④ 之所以能把日期
       改写掉, 是因为它们的池子是现造的 fixture, 而这里没有 fixture 可造)。
       借用了历史板块的日子同理: 场次号是借来的, 官方今天不可能有它们。
       同 tools/_smoke_parity.js: 明说跳过, 别把"没数据可验"报成失败。 */
    console.log('-- -- 跳过 ⑥(真连官方): ' + (BORROW
      ? '今日无方案块 → ②③④ 借的是 ' + SRC.date + ' 的场次号'
      : 'data/predictions.js 最新一天是 ' + DAYS[0].date)
      + ', 不是北京时间今天(' + TODAY_BJ + ') —— 建完当日数据后自动恢复');
  } else if (!OFFLINE) {
    global.fetch = async (url) => {
      if (String(url).indexOf('sporttery.cn') === -1) throw new Error('意外请求 ' + url);
      return realFetch(url);
    };
    const sb5 = loadSite();
    await sb5.bootApp(todayDays());
    // 实时叠加是异步的(四个彩池各自一个请求), 等它真的落到页面上, 别用固定 sleep(见 settleUntil)
    await settleUntil(() => htmlIn(sb5, 'planBlocks').indexOf('已接官方实时') !== -1);
    const pb5 = htmlIn(sb5, 'planBlocks');
    assert(pb5.indexOf('已接官方实时') !== -1, '⑥ 联网跑: 方案区应出现口径说明行');
    assert(pb5.indexOf('≈858倍</div>') === -1, '⑥ 联网跑: 方案卡不得再是无标注的 858');
    const nums = (pb5.match(/≈[^<]*?倍\([^)]*\)/g) || []);
    assert(nums.length, '⑥ 联网跑: 方案卡应带口径标注');
    console.log('OK 6/6 联网真打官方: 方案卡 = ' + nums.join(' | '));
    // 真数据下的口径说明: 今天(9-15)官方池里 009/013 都只有让球盘 → 正文里写到它们的那张卡该挂提醒
    const noteReal = (pb5.match(/<div class="pb-note">([\s\S]*?)<\/div>/) || [])[1] || '';
    console.log('  + 让球-only 口径说明: ' + (noteReal ? noteReal.replace(/<[^>]+>/g, '') : '(今天没有需要提醒的方案卡)'));
    n = 6;
  } else {
    console.log('-- --offline: 跳过 ⑥(真连官方)');
  }

  console.log('\nSMOKE OK — 网站首页渲染全部断言通过(' + n + ' 项)');
})().catch((e) => {
  console.error('SMOKE FAIL:', (e && e.message) || e);
  process.exit(1);
});
