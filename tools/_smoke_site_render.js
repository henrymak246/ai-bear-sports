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

/* 用**今天**那份数据的深拷贝: LiveOdds 有日期闸, 拿历史日根本不会去取数 */
const todayDays = () => [JSON.parse(JSON.stringify(DAYS[0]))];

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
/* 从对阵表 HTML 里抠出某一场那一行(<tr>…</tr>)。
   ★必须落到"这一行"上: '无胜平负' / 'SP未开售' / '让+2' 这类串在整张表里会互相串味,
     全局 indexOf 分不清命中的是哪一场 —— 那断言就等于没跑。 */
const rowOf = (html, id) => String(html).split('<tr>').find((s) => s.indexOf('>' + id + '<') !== -1) || '';
/* 该场的让球盘口文本(项目统一带符号: 让+2 / 让-1) */
const hcapTxt = (m) => '让' + (Number(m.spHandicap) > 0 ? '+' + m.spHandicap : m.spHandicap);

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
  assert(htmlIn(sb, 'planBlocks').indexOf('≈858倍') !== -1, '① 首屏应是构建时快照(858)');

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
  assert(tbl1.indexOf('无胜平负 · 仅让球') !== -1,
    '让球-only 场的 SP 格该写「无胜平负 · 仅让球」, 而不是「SP未开售」');
  assert(tbl1.indexOf('dtag-rang') !== -1, '让球-only 场的方向行该挂「让球」徽章');
  assert(tbl1.indexOf('nohad-tip') !== -1, '让球-only 场该有一句"这场方向投不了"的提醒');
  const mNh = nd[0].matches.filter(function (m) { return m.id === nhIds[0]; })[0];
  const rowNh = rowOf(tbl1, mNh.id);
  assert(rowNh, '对阵表里没找到 ' + mNh.id + ' 那一行');
  assert(rowNh.indexOf('无胜平负 · 仅让球') !== -1 && rowNh.indexOf('SP未开售') === -1,
    '★' + mNh.id + ' 那一行: 该说"压根没有这个盘", 不该说"还没开售"');
  if (mNh.direction) {
    assert(rowNh.indexOf(hcapTxt(mNh) + ' ' + mNh.direction) !== -1,
      mNh.id + ' 方向行该带让球线「' + hcapTxt(mNh) + ' ' + mNh.direction + '」, 实际行: ' +
      rowNh.slice(0, 300));
  }
  // 盘口一律带符号(让+2 / 让-1), 与方案腿 cart.js 的 pick 同一串写法 —— 省掉正号会跟方向行看着像两个盘
  assert(rowNh.indexOf(hcapTxt(mNh) + ' ' + mNh.hhad.join('/')) !== -1,
    mNh.id + ' 的让球SP 该写「' + hcapTxt(mNh) + ' ' + mNh.hhad.join('/') + '」');
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
  assert(pb.indexOf('≈858倍</div>') === -1, '③ 方案卡不得再是**没有口径标注**的构建时倍数');
  /* 期望值手算(与实现无关, 拿 fixture 的固定价直接乘):
     让球七关的选项是 让胜×2(010/004) 让平×3(011/002/005) 让负×2(012/013),
     fixture 让球池 = 让胜1.50 / 让平3.50 / 让负5.00 →
       1.50×3.50×3.50×1.50×3.50×5.00×5.00 = 2411.72  → 过百取整 = 2412
     (构建值是 2.20×3.58×3.55×2.42×3.40×1.75×2.13 = 857.5 → 858, 对上原文, 说明选项→下标没错位)
     hc7 七关全在售(001 不在 hc7 里) → 依据是"实时连乘", 不带停售注记。 */
  assert(pb.indexOf('≈2412倍(实时连乘)') !== -1,
    '③ 让球方案卡应为 ≈2412倍(实时连乘), 实际 ' + (pb.match(/≈[^<]*/) || [''])[0]);
  const tbl = htmlIn(sb2, 'dailyList');
  assert(tbl.indexOf(closedId) !== -1, '③ 对阵表里应有 ' + closedId + ' 那场');
  assert(/已停售/.test(tbl), '③ 对阵表里应出现"已停售"标记');

  // ③b 让球-only 以**官方池**为准(不是快照)
  const rowNhLive = rowOf(tbl, nhIds[0]);
  assert(rowNhLive.indexOf('无胜平负 · 仅让球') !== -1,
    '③ ' + nhIds[0] + ' 官方 had 池里同样没有它 → 叠加后仍应是让球口径, 实际行: ' + rowNhLive.slice(0, 300));
  assert(rowNhLive.indexOf('SP未开售') === -1, '③ 让球-only 不是"没开售", 别退回那个说法');
  const hhadLive = HHAD_LIVE.h + '/' + HHAD_LIVE.d + '/' + HHAD_LIVE.a;
  assert(rowNhLive.indexOf(hcapTxt(d[0].matches.filter(function (m) { return m.id === nhIds[0]; })[0]) + ' ' + hhadLive) !== -1,
    '③ ' + nhIds[0] + ' 的让球SP 该换成官方实时值 ' + hhadLive);
  if (nhIds[1]) {
    const rowFlip = rowOf(tbl, nhIds[1]);
    assert(rowFlip.indexOf('无胜平负') === -1 && rowFlip.indexOf('SP ') !== -1,
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
  /* max7 含 001(已下架) → 那条腿只能用构建值 2.24 顶上, 其余六关是胜平负池的固定价 2.00/4.00:
       主胜×5(010/002/011/004/008) 客胜×1(012) → 2.00^5 × 4.00 = 128; 再 ×2.24 = 286.72 → 287
     依据要写成"含 1 条已停售腿构建值" —— 这是本冒烟最该锁住的那句话:
     只刷腿不刷总倍数, 页面上就会出现"一列新赔率配一个旧倍数"。 */
  assert(htmlIn(sb2, 'max7Blocks').indexOf('7关全串约287倍(按页面显示赔率连乘, 含 1 条已停售腿构建值)') !== -1,
    '③ max7 倍数未按含停售腿的口径重算, 实际 ' +
    ((htmlIn(sb2, 'max7Blocks').match(/全中约[^<]*/) || [''])[0] || '(没渲染出来)'));
  assert(htmlIn(sb2, 'hc7Blocks').indexOf('7关全中约2412倍(按当前实时赔率连乘)') !== -1,
    '③ hc7 倍数未按实时值重算, 实际 ' +
    ((htmlIn(sb2, 'hc7Blocks').match(/全中约[^<]*/) || [''])[0] || '(没渲染出来)'));
  console.log('OK 3/5 方案卡倍数已随实时值刷新: ≈2412倍(实时连乘) | max7 → 287(含1条停售腿)');

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
  if (!OFFLINE) {
    global.fetch = async (url) => {
      if (String(url).indexOf('sporttery.cn') === -1) throw new Error('意外请求 ' + url);
      return realFetch(url);
    };
    const sb5 = loadSite();
    await sb5.bootApp(todayDays());
    await settle();
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
