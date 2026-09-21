/* tools/_smoke_parity.js — ★跨运行端口径一致性冒烟: assets/live-odds.js(网站) vs miniprogram/utils/jc.js(小程序)
 *
 * 为什么需要它: 网站跑在浏览器、小程序跑在微信 JS 核心, **两个运行时无法共用模块**,
 * 同一套"竞彩实时叠加 + 方案倍数重算"的口径只能各写一份。文档里写着"改一处必须改另一处",
 * 但在此之前这只是句嘱咐 —— 没有人拦得住只改一边: 改完网站忘了小程序, 两端就会对同一场比赛
 * 报出两个不同的倍数, 而这种漂移**两边各自的冒烟都是绿的**(各自和自己一致)。
 * 本文件是唯一能抓住"两边不一致"的地方: 喂同一份输入, 断言输出逐字符相同。
 *
 * 覆盖:
 *   ① 纯函数逐个对齐: pickIdx / legNum / noHadOf / noHadIds / noHadNote / legOdds / product / substTotal / totalNum / substPct / overlayPlan
 *   ② 端到端对齐: 同一份日对象 + 同一份官方实时行 → hc7/max7 的倍数与逐腿赔率、以及方案卡大号倍数
 *   ③ 停售腿: 两端都要既保留构建值、又给出"含 N 条已停售腿"的依据标注
 *   ④ 日期闸与失败兜底: 非今日、取数失败两种情况下两端都原样返回(不叠加、不改数)
 *   ⑤ 让球-only: 官方只开让球、没开胜平负的场, 两端的判定/场次号清单/方案卡口径说明逐字符相同
 *
 * 用法: node tools/_smoke_parity.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DAYS = new Function(fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8') + ';return PREDICTION_DAYS;')();
assert(Array.isArray(DAYS) && DAYS.length, '未读到 PREDICTION_DAYS');
const day0 = DAYS[0];
if (day0.date !== new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)) {
  console.log('跳过: 今日(' + day0.date + ')不是北京时间今天, 叠加有日期闸, 两边都会原样返回, 验不出东西');
  process.exit(0);
}
/* ---- ②③ 要验的是"方案块按实时值重算 + 停售腿保留构建值"这套机制, 它是**代码**性质, 与具体是哪天的数据无关。
   而"当天有没有方案块"却是**数据**性质: 2026-09-21 是竞彩扁平日(全网只在售 1 场, 1 关不成过关),
   当天**一个串关块都没有** —— 此时写死"必须拿当天数据验"会让本冒烟在数据完全正常的扁平日整条红掉。
   处置(与 _smoke_site_render.js 同款): 退回**最近一个真有方案块的日子**, 只把日期改写成今天
   (日期闸认日期不认内容), 并打一行明说借的是哪天 —— 验收的是机制, 不是那天的内容。
   同理, 历史日的腿**全部已结算**, 造不出"停售腿", 也在副本里把两条腿的 result 清掉。 */
const hasBlock = (d) => ['combo7', 'hc7', 'max7'].some((k) => d[k] && Array.isArray(d[k].legs) && d[k].legs.length);
let day = day0;
if (!hasBlock(day0)) {
  const src = DAYS.find(hasBlock);
  assert(src, '数据里第 0 天与全部历史日都没有方案块, ②③ 无从验起');
  day = JSON.parse(JSON.stringify(src));
  day.date = day0.date;                 // ← 过叠加层的日期闸(闸认日期, 不认内容)
  console.log('注: 今日(' + day0.date + ')无方案块(竞彩扁平日, 无串关可叠加) ②③ 借用 ' + src.date + ' 的板块内容; 实盘当天' +
    '唯一带未结算腿的块是 asian7(它没有实时叠加, 不走本路径), 见 _smoke_live_odds.js');
}
/* ★合并后的主板块 combo7 是"新日子"才有的块, 而借来的旧日子恰是 hc7+max7 —— 于是这里会在**没有 combo7**
   的输入上验完 ②③ 却没验到混排, 而混排恰恰是本次合并里最容易只改一端的地方(两端各自都绿)。
   所以借到旧日子时在副本里**合成**一块: hc7 前 4 腿(改写成盘口前缀式) + max7 前 3 腿,
   ② 的「按腿取池」与 ③ 的停售腿重算就都落在两种盘混排的串上。与 _smoke_site_render.js 同款。 */
(function synthCombo7() {
  if ((day.combo7 || {}).legs && day.combo7.legs.length) return;
  const hc = ((day.hc7 || {}).legs) || [], mx = ((day.max7 || {}).legs) || [];
  if (!hc.length || !mx.length) return;
  const spH = {};
  (day.matches || []).forEach((m) => { spH[String(m.id).slice(-3)] = m.spHandicap; });
  const PRE = /^让[+-]?\d+(?:\.\d+)?\s+/;
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
  if (legs.length < 2) return;
  let p = 1; legs.forEach((l) => { p *= parseFloat(String(l.odds).split('/')[0]); });
  const tot = p >= 100 ? String(Math.round(p)) : p.toFixed(1);
  day.combo7 = { totalOdds: legs.length + '关全串约' + tot + '倍', legs: legs, result: null,
    note: '(渲染冒烟合成块: 混选串的两端口径必须每天都真对齐一遍, 见本文件顶部)' };
  delete day.hc7; delete day.max7;
  console.log('注: 借来的 ' + day.date + ' 是 hc7+max7 旧日子 → 副本里合成一块 combo7(' + legs.length + ' 腿: '
    + legs.filter((l) => l.play === '让球胜平负').length + ' 让球 / ' + legs.filter((l) => l.play === '胜平负').length
    + ' 不让球), 让②的「按腿取池」也落在混排串上');
})();

/* ---- 网站侧: 浏览器 IIFE, 在 vm 里给它一个 window 就行(它只在 fetchLive 里才碰 fetch) ---- */
const W = (function () {
  const sb = { console, Date, Math, JSON, Promise, Object, Array, String, Number, isFinite, isNaN, fetch };
  sb.window = sb; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'assets/live-odds.js'), 'utf8'), sb, { filename: 'assets/live-odds.js' });
  return sb.LiveOdds;
})();
/* ---- 小程序侧: CommonJS, 顶层不碰 wx(取数才碰), 直接 require ---- */
const M = require(path.join(ROOT, 'miniprogram/utils/jc.js'));
assert(W && W._internals, '网站侧未导出 _internals');
assert(M && typeof M.overlayPlan === 'function', '小程序侧未导出 overlayPlan');

/* 两端同名的纯函数摆在一起逐个对: 任何一边改了实现(哪怕只是取整/正则), 这里立刻红 */
const PAIRS = [
  ['pickIdx', W._internals.pickIdx, M.pickIdx],
  ['legNum', W._internals.legNum, M.legNum],
  ['id3', W._internals.id3, M.id3],
  ['noHadOf', W._internals.noHadOf, M.noHadOf],
  ['noHadList', W._internals.noHadList, M.noHadList],
  ['noHadNote', W._internals.noHadNote, M.noHadNote],
  ['poolOfLeg', W._internals.poolOfLeg, M.poolOfLeg],
  ['legOdds', W._internals.legOdds, M.legOdds],
  ['product', W._internals.product, M.product],
  ['substTotal', W._internals.substTotal, M.substTotal],
  ['totalNum', W._internals.totalNum, M.totalNum],
  ['substPct', W._internals.substPct, M.substPct],
  ['overlayPlan', W._internals.overlayPlan, M.overlayPlan],
];
PAIRS.forEach(function (p) {
  assert.strictEqual(typeof p[1], 'function', '网站侧 _internals.' + p[0] + ' 未导出(跨端就对齐不了它)');
  assert.strictEqual(typeof p[2], 'function', '小程序侧 ' + p[0] + ' 未导出(跨端就对齐不了它)');
});

/* ---- ① 纯函数: 同一批输入, 两边输出必须逐字符相同 ---- */
/* ★网站侧的值来自 vm 沙箱, 数组/对象是**另一个 realm 的原型** —— deepStrictEqual 会连原型一起比,
   两边内容一模一样也会判不等。所以跨端比较前统一 JSON 往返一次, 只比数据不比原型。 */
const J = (v) => JSON.parse(JSON.stringify(v));
const EQ = (label, a, b) => assert.deepStrictEqual(J(a), J(b),
  '① ' + label + ' 两端不一致: 网站=' + JSON.stringify(a) + ' 小程序=' + JSON.stringify(b));

// 选项→赔率下标: 「客胜」含'胜'字, 单字匹配会串到主胜列 —— 这条是最容易被改坏的地方
['主胜', '客胜', '平', '让胜', '让平', '让负', '胜', '负', '', '  客胜 '].forEach(function (p) {
  assert.strictEqual(W._internals.pickIdx(p), M.pickIdx(p), '① pickIdx("' + p + '") 两端不一致');
});
assert.strictEqual(M.pickIdx('客胜'), 2, '① ★客胜必须是客胜那一列(下标 2), 不是主胜');
assert.strictEqual(M.pickIdx('让负'), 2, '① ★让负必须是让球池的客胜列(下标 2)');
/* ★盘口前缀式(combo7 让球腿的约定写法): 前缀是线位不是选项, 必须剥掉再判。
   漏剥时「让+1 让胜」不含 主/客/负/平 → 返回 -1 → 该腿实时赔率永远取不到(静默停在构建值)。
   历史 hc7 有 10 条「让+1 让胜」正踩在这个坑上, 自证计数又因为它们是已结算腿而跳过, 一直没被看见。 */
[['让-1 主胜', 0], ['让-1 让胜', 0], ['让+1 让胜', 0], ['让-1 平', 1], ['让-1 让平', 1], ['让+2 让平', 1],
 ['让+2 客胜', 2], ['让-1 让负', 2], ['让+1 客胜', 2], ['让-3 客胜', 2], ['让 1 主胜', 0], ['让-1.5 主胜', 0],
 // 只有线位、没有选项 → 认不出, 必须返回 -1(宁可保留原值, 也不能瞎猜一个槽位)
 ['让-1', -1], ['让+1', -1], ['让+1 幺蛾子', -1]]
  .forEach(function (c) {
    const w = W._internals.pickIdx(c[0]), m = M.pickIdx(c[0]);
    assert.strictEqual(w, m, '① pickIdx("' + c[0] + '") 两端不一致: 网站=' + w + ' 小程序=' + m);
    assert.strictEqual(m, c[1], '① pickIdx("' + c[0] + '") 应为 ' + c[1] + ', 实际 ' + m + '(盘口前缀未剥净?)');
  });

['周二001', '周三010', ''].forEach(function (s) {
  assert.strictEqual(W._internals.legNum(s), M.legNum(s), '① legNum("' + s + '") 两端不一致');
});
[{ id: '周二001' }, { id: '周三010' }, {}, null].forEach(function (m) {
  assert.strictEqual(W._internals.id3(m), M.id3(m), '① id3(' + JSON.stringify(m) + ') 两端不一致');
});
[[], [1.5], [2.2, 3.58], [1.5, 3.5, 3.5, 1.5, 3.5, 5, 5], [1.11, 1.12]].forEach(function (list) {
  assert.strictEqual(W._internals.product(list), M.product(list), '① product(' + JSON.stringify(list) + ') 两端不一致');
});
/* 让球-only 判定: 显式 noHad 优先(官方池说了算), 没有它才按快照推(sp 空 + hhad 三个数) */
[{ id: '周二013', sp: null, hhad: [2.36, 4.25, 2.13] }, { id: 'x', sp: null, hhad: [1, 2] },
 { id: 'x', sp: [1, 2, 3], hhad: [1, 2, 3] }, { noHad: false, sp: null, hhad: [1, 2, 3] },
 { noHad: true, sp: [1, 2, 3], hhad: [1, 2, 3] }, { hhad: [1, 2, 3] }, {}, null, undefined].forEach(function (m) {
  assert.strictEqual(W._internals.noHadOf(m), M.noHadOf(m), '① noHadOf(' + JSON.stringify(m) + ') 两端不一致');
});
assert.strictEqual(M.noHadOf({ id: 'x', sp: null, hhad: [1, 2, 3] }), true, '① 快照 sp 空 + hhad 三个数应判为让球-only');
assert.strictEqual(M.noHadOf({ noHad: false, sp: null, hhad: [1, 2, 3] }), false, '① 显式 noHad=false 应压过快照推断');
assert.strictEqual(M.noHadOf({ id: 'x', sp: null, hhad: [1, 2] }), false, '① hhad 不是三个数就不算(可能只是缺数据)');
assert.deepStrictEqual(J(W._internals.noHadList(day.matches)), M.noHadList(day.matches), '① noHadList 两端不一致');
/* 口径说明: 只认「场次号 + 主客队名首字」这种胜平负写法, 让球/比分/撞号一律不挂 */
const NH = [{ id: '009', ch: ['阿', '威'] }, { id: '013', ch: ['埃', '皇'] }];
[['013皇马', '013'], ['012阿森纳/013皇马/014弗鲁米嫩', '013'],
 // 光有场次号、后面没跟队名 → 认不出写的是哪一场, 宁可漏挂(所以 '009/013双选' 这种列举式不挂)
 ['009/013双选', ''],
 ['013让+2负', ''], ['让球七关:013让+2负', ''], ['013:0-2', ''], ['1013皇马', ''], ['013', ''], ['', ''], [null, ''],
 // ★撞号: 北单卡的场次号是北单官方编号, 同样写成「003叻武里场」—— 名字对不上就不能挂
 ['003叻武里场1/0', ''], ['013韩国亚', ''], ['013埃尔切场', '013'],
 // 队名首字是拉丁字母的场(AC米兰这类)同样要认得出 —— 不能只认中文字
 ['013AC米兰', '013']]
  .forEach(function (c) {
    const list = c[0] === '013AC米兰' ? [{ id: '013', ch: ['埃', 'A'] }] : NH;
    const w = W._internals.noHadNote(c[0], list);
    assert.strictEqual(w, M.noHadNote(c[0], list), '① noHadNote(' + JSON.stringify(c[0]) + ') 两端不一致');
    assert.strictEqual(c[1] === '' ? (w === '') : (w.indexOf(c[1]) !== -1), true,
      '① noHadNote(' + JSON.stringify(c[0]) + ') 应' + (c[1] ? '命中 ' + c[1] : '不挂') + ', 实际 ' + JSON.stringify(w));
  });
assert.strictEqual(M.noHadNote('013皇马', []), '', '① 没有让球-only 场次时不得挂任何说明');
/* 腿级取池(combo7 合并的核心): 板块级池('sp'/'hhad')必须原样透传, 只有 'auto' 才按腿的 play 判。
   两端任一边写歪 → 同一场两盘会同价(一条腿取错池), 而两边各自的冒烟都是绿的。 */
[['胜平负', 'auto', 'sp'], ['让球胜平负', 'auto', 'hhad'], ['胜平负', 'sp', 'sp'],
 ['让球胜平负', 'sp', 'sp'], ['胜平负', 'hhad', 'hhad'], ['让球胜平负', 'hhad', 'hhad'],
 [' 让球胜平负 ', 'auto', 'hhad'], ['', 'auto', 'sp'], [undefined, 'auto', 'sp'], ['让球', 'auto', 'sp']]
  .forEach(function (c) {
    const leg = c[0] === undefined ? {} : { play: c[0] };
    const w = W._internals.poolOfLeg(leg, c[1]);
    assert.strictEqual(w, M.poolOfLeg(leg, c[1]), '① poolOfLeg(' + JSON.stringify(c[0]) + ',' + c[1] + ') 两端不一致');
    assert.strictEqual(w, c[2], '① poolOfLeg(' + JSON.stringify(c[0]) + ',' + c[1] + ') 应为 ' + c[2] + ', 实际 ' + w);
  });
assert.strictEqual(M.poolOfLeg(null, 'auto'), 'sp', '① 没有腿时按不让球池兜底(不得抛)');
assert.strictEqual(M.poolOfLeg(null, 'hhad'), 'hhad', '① 板块级池不受腿影响');
[['7关全中约858倍', 705.3, '按当前实时赔率连乘'], ['7关全串约24倍', 21.14, '含 2 条已停售腿构建值'],
 ['胆拖约3.5倍;7关全串约26倍', 30, 'X'], ['全中约 858 倍', 900, 'X'], ['没有倍字', 12, 'X']].forEach(function (c) {
  assert.strictEqual(W._internals.substTotal.apply(null, c), M.substTotal.apply(null, c),
    '① substTotal(' + JSON.stringify(c) + ') 两端不一致');
});
['7关全中约858倍', '≈858倍', '≈18万倍级', '全中约 858 倍', '无'].forEach(function (s) {
  assert.strictEqual(W._internals.totalNum(s), M.totalNum(s), '① totalNum("' + s + '") 两端不一致');
});
[[['858', '705', '实时连乘']], [['858', '705', '含1条停售腿']], [['24', '21.1', '含2条未刷新腿']]].forEach(function (pairs) {
  ['≈858倍', '≈18万倍级', '7关全中约858倍', ''].forEach(function (pct) {
    assert.strictEqual(W._internals.substPct(pct, pairs), M.substPct(pct, pairs),
      '① substPct(' + JSON.stringify([pct, pairs]) + ') 两端不一致');
  });
});
console.log('OK 1/5 纯函数逐个对齐: ' + PAIRS.length + ' 个同名函数 × 同一批输入(含客胜/让负整词匹配、多段倍数不碰)');

/* ---- 方案块清单: 合并后(2026-09-21 起)只有 combo7, 之前的日子是 hc7 + max7。
   ★冒烟必须两种日子都能跑(合并当天两边都要绿), 所以这里按"当天实际有什么"取, 不写死板块名。
   pool 是板块级彩池, 'auto' = combo7 的逐腿取池。 */
const BLOCKS = [['combo7', 'auto'], ['hc7', 'hhad'], ['max7', 'sp']]
  .filter(function (b) { return day[b[0]] && Array.isArray(day[b[0]].legs) && day[b[0]].legs.length; });
assert(BLOCKS.length >= 1, '当天没有任何方案块(combo7/hc7/max7), ②③ 无从验起');

/* ---- 官方实时行: 两端同一份。故意去掉两场未结算腿所在的场 → 造出"已停售" ---- */
function mkRows(d, dropIds) {
  const rows = {};
  (d.matches || []).forEach(function (m, i) {
    if (dropIds.indexOf(m.id) !== -1) return;
    rows[m.id] = {
      sp: [+(1.50 + (i % 4) * 0.31).toFixed(2), +(3.20 + (i % 3) * 0.27).toFixed(2), +(4.10 + (i % 5) * 0.43).toFixed(2)],
      hhad: [+(1.42 + (i % 3) * 0.22).toFixed(2), +(3.55 + (i % 4) * 0.18).toFixed(2), +(5.30 + (i % 6) * 0.31).toFixed(2)],
      goalLine: m.spHandicap, st: 'Selling', upd: '19:2' + (i % 10) + ':00',
    };
  });
  return rows;
}
/* ★"已结算"也是**数据**性质, 不是机制性质: 历史日的腿赛后全部回填了 result, 而 legOdds() 的头一行
   就是 `if (!leg || leg.result) return null` —— 已结算腿**按设计**不参与实时叠加(终值不该再动)。
   于是借来的日子会同时踩两脚: ② 逐腿赔率对不上(腿停在构建值)、③ 造不出停售腿。
   副本里统一清成 result:null(只动内存, 不碰 data/predictions.js), 让这一天**看起来像当天**:
   ②③ 验的是"当天怎么叠、下架怎么兜", 与这些腿当时到底赛没赛、赛果是什么无关。
   (实盘的真当天本来就是 result:null, 所以这一步在真当天上是空操作。) */
const settled = BLOCKS.reduce((n, b) => n + (day[b[0]].legs || []).filter((l) => l.result).length, 0);
if (settled) {
  BLOCKS.forEach((b) => (day[b[0]].legs || []).forEach((l) => { l.result = null; }));
  console.log('注: 借来的 ' + day.date + ' 有 ' + settled + ' 条腿已回填 result(赛后终值, legOdds 按设计短路)'
    + ' → 副本里清成 null 恢复成"待赛"面貌, ②③ 才有得验; 数据文件不动');
}
/* 取两场**不同场**的未结算腿所在场次(跨板块优先, 只有一个板块时就取该板块的两条腿) */
const stopIds = [];
BLOCKS.forEach(function (b) {
  (day[b[0]].legs || []).forEach(function (l) {
    if (l.result) return;
    const id = l.match.slice(0, 3);
    if (stopIds.indexOf(id) !== -1 || stopIds.length >= 2) return;
    stopIds.push(id);
  });
});
assert(stopIds.length >= 1, '找不到未结算腿, 造不出停售');
const dropIds = day.matches.filter((m) => stopIds.indexOf(m.id.slice(-3)) !== -1).map((m) => m.id);
assert.strictEqual(dropIds.length, stopIds.length, '应恰好造出 ' + stopIds.length + ' 场停售, 实际 ' + dropIds.length);
const rows = mkRows(day, dropIds);

/* ---- ② 端到端: 同一份日对象 + 同一份实时行 ---- */
const dw = JSON.parse(JSON.stringify(day));
const wOut = W.overlayDay(dw, rows);
const dm = JSON.parse(JSON.stringify(day));
const mOverlaid = M.overlay(dm.matches, { rows: rows }, dm.date);
const mOut = M.planPatch(dm, mOverlaid);

assert(wOut.oddsLive === true, '② 网站侧应打上 oddsLive');
assert(mOverlaid.some((m) => m.oddsLive), '② 小程序侧应打上 oddsLive');
BLOCKS.forEach(function (b) {
  const k = b[0];
  assert(wOut[k] && Array.isArray(wOut[k].legs) && wOut[k].legs.length, '② 网站侧 ' + k + ' 叠加后不该丢');
  assert.strictEqual(wOut[k].totalOdds, mOut[k].totalOdds, '② ' + k + ' 倍数两端不一致');
  assert.deepStrictEqual(J(wOut[k].legs.map((l) => l.odds)), mOut[k].legs.map((l) => l.odds),
    '② ' + k + ' 逐腿赔率两端不一致');
});
assert.deepStrictEqual(J(wOut.plan.map((p) => p.pct)), mOut.plan.map((p) => p.pct), '② 方案卡大号倍数两端不一致');
assert.deepStrictEqual(J(wOut.plan.map((p) => p.text)), mOut.plan.map((p) => p.text), '② 方案正文不得被改写');
/* 两边的腿赔率也必须和**场次卡上的 SP** 同源, 且**按腿取池** ——
   combo7 混排时让球腿必须取自 hhad、不让球腿必须取自 sp。取错池时两端可能**依然互相一致**
   (两份实现错得一模一样), 只有拿场次卡上的两套 SP 对照才查得出来 —— 这正是本次合并的核心。 */
const liveById = {};
mOverlaid.forEach((m) => { liveById[m.id.slice(-3)] = m; });
BLOCKS.forEach(function (b) {
  const k = b[0];
  mOut[k].legs.forEach(function (l) {
    const m = liveById[l.match.slice(0, 3)];
    if (!m || m.oddsClosed) return;
    const pool = M.poolOfLeg(l, b[1]);
    const arr = pool === 'hhad' ? m.hhad : m.sp;
    assert(arr && arr[M.pickIdx(l.pick)] != null,
      '② ' + k + ' ' + l.match + ' 取不到 ' + pool + ' 池赔率(按腿取池错)');
    assert.strictEqual(l.odds, arr[M.pickIdx(l.pick)].toFixed(2),
      '② ' + k + ' ' + l.match + ' 的赔率不是取自 ' + pool + ' 池: 实际 ' + l.odds
      + ' / ' + pool + '池=' + arr[M.pickIdx(l.pick)]);
  });
});
/* 混排验收: combo7 当天必须**两盘腿都出现**。全是一个盘 = "假合并"(与旧板块无异, 白合) */
if (day.combo7) {
  const plays = {};
  day.combo7.legs.forEach(function (l) { plays[String(l.play)] = 1; });
  assert.deepStrictEqual(Object.keys(plays).sort(), ['胜平负', '让球胜平负'],
    '② combo7 应同时含胜平负与让球胜平负两盘腿, 实际只有 ' + Object.keys(plays).join('/') + '(假合并)');
}
console.log('OK 2/5 端到端对齐: ' + BLOCKS.map(function (b) { return b[0] + '=' + wOut[b[0]].totalOdds; }).join(' | ')
  + ' | 方案卡=' + wOut.plan.filter((p) => /倍\(/.test(p.pct)).map((p) => p.pct).join(' , '));

/* ---- ③ 停售腿: 两端都要"保留构建值 + 写明依据", 且必须真的出现这个依据 ---- */
/* 按板块统计各丢了几条腿 —— 只有一个板块的日子(combo7)两条腿都落它头上, 旧日子则一板块一条 */
const lost = {};
stopIds.forEach(function (id) {
  BLOCKS.forEach(function (b) {
    if ((day[b[0]].legs || []).some((l) => l.match.slice(0, 3) === id)) lost[b[0]] = (lost[b[0]] || 0) + 1;
  });
});
assert(Object.keys(lost).length >= 1, '③ 造出的停售场没有命中的方案腿, 这条路等于没验');
Object.keys(lost).forEach(function (k) {
  const n = lost[k];
  assert(new RegExp('含 ' + n + ' 条已停售腿构建值').test(wOut[k].totalOdds),
    '③ 网站侧 ' + k + ' 应写明含 ' + n + ' 条停售腿, 实际 ' + wOut[k].totalOdds);
  assert.strictEqual(wOut[k].totalOdds, mOut[k].totalOdds, '③ ' + k + ' 停售口径两端不一致');
  assert(wOut[k].oddsClosedLegs >= n && wOut[k].oddsStale >= n, '③ ' + k + ' 应统计出停售腿');
  assert.strictEqual(wOut[k].oddsClosedLegs, mOut[k].oddsClosedLegs, '③ ' + k + ' 停售腿计数两端不一致');
  assert.strictEqual(wOut[k].oddsStale, mOut[k].oddsStale, '③ ' + k + ' 未刷新腿计数两端不一致');
  assert.strictEqual(wOut[k].oddsBasis, 'closed', '③ ' + k + ' 有停售腿时依据应为 closed');
  // 停售腿的赔率必须还是构建值(下架了没有可投价, 拿旧值只是为了把倍数算得出来)
  stopIds.forEach(function (id) {
    const wLeg = (wOut[k].legs || []).find((l) => l.match.slice(0, 3) === id);
    const oLeg = (day[k].legs || []).find((l) => l.match.slice(0, 3) === id);
    if (!wLeg || !oLeg) return;
    assert.strictEqual(wLeg.odds, oLeg.odds, '③ 网站侧 ' + k + ' 停售腿赔率应保留构建值');
    const mLeg = (mOut[k].legs || []).find((l) => l.match.slice(0, 3) === id);
    assert.strictEqual(mLeg.odds, oLeg.odds, '③ 小程序侧 ' + k + ' 停售腿赔率应保留构建值');
  });
});
console.log('OK 3/5 停售腿两端一致: ' + Object.keys(lost).map(function (k) {
  return k + '(' + wOut[k].totalOdds + ', 停售 ' + wOut[k].oddsClosedLegs + ' 腿 / 未刷新 ' + wOut[k].oddsStale + ' 腿)';
}).join(' | '));

/* ---- ④ 日期闸 + 失败兜底: 两种情况下两端都不得动数 ---- */
/* 挑**最后一天同时有 hc7 和 max7** 的历史日: 不是每天都有这两个方案块, 拿没有的天来测
   等于只用 undefined 走一遍空路径, 什么也没验到(46 天里只有 27 天有 hc7、22 天有 max7)。 */
const oldSrc = DAYS.filter((d) => d.hc7 && d.hc7.legs && d.max7 && d.max7.legs).pop();
assert(oldSrc, '数据里找不到同时有 hc7 与 max7 的历史日, ④ 无从验起');
const oldDay = JSON.parse(JSON.stringify(oldSrc));
const wOld = W.overlayDay(JSON.parse(JSON.stringify(oldDay)), rows);
assert.strictEqual(wOld.hc7.totalOdds, oldDay.hc7.totalOdds, '④ 网站侧非今日不得改倍数');
assert.strictEqual(wOld.oddsLive, undefined, '④ 网站侧非今日不得打 oddsLive');
assert.strictEqual(M.planPatch(JSON.parse(JSON.stringify(oldDay)), mOverlaid), null, '④ 小程序侧非今日应返回 null(不叠加)');
assert.deepStrictEqual(M.overlay(oldDay.matches, { rows: rows }, oldDay.date), oldDay.matches, '④ 小程序侧非今日应原样返回场次');
// 取数失败: 网站 rows=null、小程序 live=null → 都得原样返回
/* ★必须遍历当天**实际有的**板块: 写死 hc7 的话, 合并后的第一天(只有 combo7)会拿 undefined
   去读 .totalOdds 直接抛异常 —— 冒烟自己炸, 而不是验出问题。 */
BLOCKS.forEach(function (b) {
  const k = b[0];
  assert.strictEqual(W.overlayDay(JSON.parse(JSON.stringify(day)), null)[k].totalOdds, day[k].totalOdds,
    '④ ' + k + ' 网站侧取数失败应保持构建值');
});
assert.deepStrictEqual(M.overlay(day.matches, null, day.date), day.matches, '④ 小程序侧取数失败应原样返回场次');
// 纯函数: 不得改入参(页面会拿同一个对象再渲一次历史)
const before = JSON.stringify(day);
W.overlayDay(JSON.parse(JSON.stringify(day)), rows);
M.planPatch(JSON.parse(JSON.stringify(day)), mOverlaid);
assert.strictEqual(JSON.stringify(day), before, '④ 两端都不得改写入参');
console.log('OK 4/5 日期闸与失败兜底两端一致, 且都不改写入参');

/* ---- ⑤ 让球-only: 官方只开让球、没开胜平负的场 ----
   ★用户 2026-09-15 的原话: "013皇马是-2球的盘, 没有开不让球的胜平负" ——
     页面却把这场的 310 方向当可投的写着。这里造一场真的让球-only(官方 sp 池里没有它),
     验两端对**判定、场次号清单、方案卡上那句口径说明**逐字符一致。 */
/* 挑一场**不是任何方案块腿**的场来做: 它是让球-only 之后那些腿的赔率就取不到了,
   会把 ②③ 手算出来的倍数一起带偏 —— 本阶段只想隔离出"让球-only"这一个变量。
   ★combo7 也要算进来: 漏了它就会挑中一条混选腿的场, 让 ②③ 的停售/倍数断言跟着一起乱 */
const legIds = [].concat(...BLOCKS.map((b) => (day[b[0]].legs || []).map((l) => l.match.slice(0, 3))));
const solo = day.matches.filter((m) => legIds.indexOf(m.id.slice(-3)) === -1)[0];
assert(solo, '⑤ 找不到非方案腿的场次, 无从造让球-only');
const soloId = solo.id.slice(-3);
const rowsSolo = mkRows(day, []);
rowsSolo[solo.id] = Object.assign({}, rowsSolo[solo.id], { sp: null }); // 官方 had 池里没有它
const wSolo = W.overlayDay(JSON.parse(JSON.stringify(day)), rowsSolo);
const mSoloOverlaid = M.overlay(JSON.parse(JSON.stringify(day.matches)), { rows: rowsSolo }, day.date);
const mSolo = M.planPatch(JSON.parse(JSON.stringify(day)), mSoloOverlaid);
assert(W._internals.noHadList(wSolo.matches).map((x) => x.id).indexOf(soloId) !== -1, '⑤ 网站侧没认出这场是让球-only');
assert.strictEqual(M.noHadOf(mSoloOverlaid.find((m) => m.id.slice(-3) === soloId)), true,
  '⑤ 小程序侧没认出这场是让球-only');
assert.deepStrictEqual(J(W._internals.noHadList(wSolo.matches)), M.noHadList(mSoloOverlaid), '⑤ 让球-only 清单两端不一致');
assert.deepStrictEqual(J(wSolo.plan.map((p) => p.noHadNote || '')), mSolo.plan.map((p) => p.noHadNote || ''),
  '⑤ 方案卡口径说明两端不一致');
/* 说明必须挂在**把它当胜平负写**的那张卡上, 且不能挂到让球/比分口径的卡上 */
const getPlan = (pl) => (pl.plan || []).map((p) => [p.name, p.text || '', p.noHadNote || '']);
const wPlan = getPlan(wSolo);
const soloCh = [String(solo.home || '').charAt(0), String(solo.away || '').charAt(0)];
const cited = (t) => { // 该卡正文是否用「场次号 + 主客队名首字」引用了这场
  for (let i = t.indexOf(soloId); i !== -1; i = t.indexOf(soloId, i + 1)) {
    if (i > 0 && /\d/.test(t.charAt(i - 1))) continue;
    const rest = t.slice(i + soloId.length);
    if (rest.indexOf(soloCh[0]) === 0 || (soloCh[1] && rest.indexOf(soloCh[1]) === 0)) return true;
  }
  return false;
};
wPlan.forEach(function (p) {
  if (cited(p[1])) {
    assert(p[2].indexOf(soloId) !== -1, '⑤ ' + p[0] + ' 正文把 ' + soloId + ' 当胜平负写了, 却没挂口径说明');
  } else {
    assert.strictEqual(p[2], '', '⑤ ' + p[0] + ' 正文不是胜平负写法, 不该挂口径说明, 实际 ' + JSON.stringify(p[2]));
  }
});
/* ★不写"只能有一张卡挂" —— 北单卡的场次号是**北单官方编号**(与竞彩不同命名空间),
   正文里同样写成「003叻武里场」, 撞号就会被一并挂上。这是本规则(纯正则, 认不出语义)的已知代价,
   少挂多挂都可能; 上面那条 cited ⇔ noted 才是规则本身, 这里只保证"没挂空、挂上了就不落单"。 */
const noted = wPlan.filter((p) => p[2]);
assert(noted.length >= 1, '⑤ 造出一场让球-only, 却一张卡都没挂上口径说明(这条路等于没验)');
assert.deepStrictEqual(noted.map((p) => p[0]).sort(), wPlan.filter((p) => cited(p[1])).map((p) => p[0]).sort(),
  '⑤ 挂了说明的卡与正文确实这么引用它的卡, 对不上');
noted.forEach(function (p) {
  assert(/^⚠ 其中 /.test(p[2]) && p[2].indexOf(soloId) !== -1, '⑤ 口径说明文案形态异常: ' + p[2]);
});
console.log('OK 5/5 让球-only 两端一致: ' + solo.id + ' 被判为仅让球, 说明挂在「'
  + noted.map((p) => p[0]).join(' / ') + '」上; 让球/比分口径的卡都没被误挂');

console.log('\nSMOKE OK — 网站与小程序竞彩口径逐字符一致');
