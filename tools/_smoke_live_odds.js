/* tools/_smoke_live_odds.js — 网站侧竞彩实时赔率(assets/live-odds.js)冒烟。
 * 核心是**自证**: 拿 data/predictions.js 里**冻结**的场次赔率, 用 live-odds 的映射反算方案腿赔率,
 * 必须重建出构建脚本当初写进去的一模一样字符串。重建得出 → 映射正确 → 实时值必然落在对的槽位。
 *   (这条闸真的抓到过 bug: pickIdx 早先按'胜'/'负'单字判, "客胜"含'胜'字被当成主胜,
 *    014/012 那种客胜腿会安静地取到主胜赔率 —— 16/5 的自证比例一眼看破。)
 * 覆盖: ① 腿映射自证(全部历史日) ② pickIdx 整词匹配 ③ overlayDay 纯函数/日期闸/停售/已结算不可动
 *   ④ 真实官方接口端到端 + 与冻结快照逐条对照 ⑤ 取数失败原样返回。
 * 用法: node tools/_smoke_live_odds.js [--offline]  (--offline 跳过 ④, 只跑离线断言) */
'use strict';
const assert = require('assert');
const path = require('path');

global.window = global; // live-odds.js 是浏览器脚本, 认 window
require(path.join(__dirname, '..', 'assets', 'live-odds.js'));
const LO = global.window.LiveOdds;
const I = LO._internals;
const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));

const OFFLINE = process.argv.indexOf('--offline') >= 0;

// ---- ① 腿映射自证: 冻结赔率 → 反算 → 必须等于构建脚本写的值 ----
let ok = 0, bad = 0, settled = 0;
const fails = [];
days.forEach((d) => {
  const byId3 = {};
  (d.matches || []).forEach((m) => { byId3[String(m.id).slice(-3)] = m; });
  [['hc7', 'hhad'], ['max7', 'sp']].forEach((pair) => {
    const plan = d[pair[0]];
    if (!plan || !Array.isArray(plan.legs)) return;
    plan.legs.forEach((l) => {
      if (l.result) { settled++; return; } // 已结算腿不参与实时刷新(改了等于篡改战绩)
      const got = I.legOdds(l, byId3, pair[1]);
      if (got === String(l.odds)) ok++;
      else { bad++; fails.push(d.date + ' ' + pair[0] + ' ' + l.match + ' ' + l.pick + ' built=' + l.odds + ' 反算=' + got); }
    });
  });
});
assert.strictEqual(bad, 0, '腿映射自证失败 ' + bad + ' 条:\n  ' + fails.slice(0, 10).join('\n  '));
assert(ok >= 20, '自证样本太少(' + ok + '), 说明数据或映射口径变了');
console.log('OK 1/5 腿映射自证: ' + ok + '/' + (ok + bad) + ' 全中(已结算腿跳过 ' + settled + ')');

// ---- ② pickIdx 整词匹配(含 "客胜" 回归) ----
assert.strictEqual(I.pickIdx('主胜'), 0);
assert.strictEqual(I.pickIdx('平'), 1);
assert.strictEqual(I.pickIdx('客胜'), 2, '★"客胜"必须归客胜(含"胜"字, 单字判会误判成主胜)');
assert.strictEqual(I.pickIdx('让胜'), 0);
assert.strictEqual(I.pickIdx('让平'), 1);
assert.strictEqual(I.pickIdx('让负'), 2);
assert.strictEqual(I.pickIdx(''), -1);
assert.strictEqual(I.pickIdx('幺蛾子'), -1);
console.log('OK 2/5 pickIdx 整词匹配(主胜/平/客胜/让胜/让平/让负 + 脏值返回 -1)');

// ---- ③ overlayDay 纯函数 / 日期闸 / 停售 / 已结算不可动 ----
const today = LO.todayBj();
const rows = { '周二008': { sp: [1.56, 3.4, 5.15], hhad: [2.6, 3.4, 2.35], goalLine: -1, st: 'Selling', upd: '19:01:23' } };
const mkDay = (date) => ({
  date,
  matches: [
    { id: '周二008', home: '阿拉维斯', away: '巴伦西亚', sp: [1.59, 3.35, 4.95], hhad: [2.5, 3.3, 2.4], spHandicap: -1 },
    { id: '周二003', home: '卡塔尔亚', away: '韩国亚', sp: [14.5, 6, 1.12], hhad: [2.2, 3.93, 2.38], spHandicap: 1 },
  ],
  // 方案卡: pct 与 hc7/max7 的 totalOdds 是构建脚本同源写出的同一个数
  plan: [
    { market: 'jc', name: '🔵 让球胜平负', pct: '≈858倍', text: '让球七关:010让-1主胜(2.20…)' },
    { market: 'std', name: '🌏 亚洲让球', pct: '≈6.0倍', text: '3串约6.0倍' },
  ],
  hc7: { totalOdds: '7关全中约858倍', legs: [
    { match: '008 阿拉维斯(-1) vs 巴伦西亚', pick: '让胜', odds: '2.50' },
    { match: '003 卡塔尔亚(+1) vs 韩国亚', pick: '让负', odds: '2.38' },
  ] },
  max7: { totalOdds: '7关全串约24倍', legs: [
    { match: '008 阿拉维斯 vs 巴伦西亚', pick: '主胜', odds: '1.59' },
    { match: '003 卡塔尔亚 vs 韩国亚', pick: '客胜', odds: '1.12', result: 'hit' }, // 已结算 → 不可动
  ] },
});
const frozen = mkDay(today);
const before = JSON.stringify(frozen);
// 非今日: 原样返回(补看历史某天时官方池里没有那些场次, 叠加会把整页误标停售)
assert.strictEqual(LO.overlayDay(mkDay('2026-09-12'), rows).date, '2026-09-12');
assert.strictEqual(LO.overlayDay(mkDay('2026-09-12'), rows).matches[0].sp[0], 1.59, '历史日不得被叠加');
assert.strictEqual(LO.overlayDay(frozen, null), frozen, 'rows 为空应原样返回');
const od = LO.overlayDay(frozen, rows);
assert.strictEqual(od.matches[0].sp[0], 1.56, '008 应换成官方实时');
assert.strictEqual(od.matches[0].hhad[0], 2.6);
assert.strictEqual(od.matches[0].spHandicap, -1);
assert.strictEqual(od.matches[0].oddsLive, true);
assert.strictEqual(od.matches[0].oddsClosed, false);
assert.strictEqual(od.matches[0].oddsUpd, '19:01:23');
assert.strictEqual(od.matches[1].oddsClosed, true, '003 不在实时池 → 标已停售');
assert.strictEqual(od.matches[1].sp[0], 14.5, '已停售场保留快照值供回顾');
assert.strictEqual(od.hc7.legs[0].odds, '2.60', '008 让胜应换成实时 hhad[0]=2.6(2 位小数)');
assert.strictEqual(od.hc7.legs[1].odds, '2.38', '停售场腿保留原值');
assert.strictEqual(od.max7.legs[0].odds, '1.56', '008 主胜应换成实时 sp[0]');
assert.strictEqual(od.max7.legs[1].odds, '1.12', '★已结算腿不得改');
assert.strictEqual(od.max7.legs[1].result, 'hit');
// 腿实时化了, totalOdds 就必须跟着重算 —— 否则页面上是"一列新腿赔率配一个旧总数", 用户一乘就发现不对。
// 003 已停售 → 该腿用页面显示的构建值参与连乘, 括号里点数说明, 不冒充实时口径
assert.strictEqual(od.hc7.totalOdds, '7关全中约6.2倍(按页面显示赔率连乘, 含 1 条已停售腿构建值)', '实际 ' + od.hc7.totalOdds);
assert.strictEqual(od.max7.totalOdds, '7关全串约24倍', '有已结算腿 → 不动倍数');
assert.strictEqual(JSON.stringify(frozen), before, '★overlayDay 不得改写入参(纯函数)');
// 全部腿都能刷 + 原文只有一个「约N倍」段 → 才重算倍数, 并把新口径写进文案
const rows2 = Object.assign({}, rows, { '周二003': { sp: [15, 6, 1.1], hhad: [2.2, 3.9, 2.4], goalLine: 1, st: 'Selling', upd: '19:02:00' } });
const od2 = LO.overlayDay(frozen, rows2);
assert.strictEqual(od2.hc7.legs.map((l) => l.odds).join(','), '2.60,2.40');
assert.strictEqual(od2.hc7.totalOdds, '7关全中约6.2倍(按当前实时赔率连乘)', '全腿可刷 → 倍数按连乘重算并标注口径');
assert.strictEqual(od2.max7.totalOdds, '7关全串约24倍', 'max7 有已结算腿 → 即使全刷也不动倍数');
// 多段原文不碰(猜错哪一段就是假数)
assert.strictEqual(I.substTotal('胆拖主串3串1(007×008×006)约3.5倍;7关全串约26倍', '30', 'X'), '胆拖主串3串1(007×008×006)约3.5倍;7关全串约26倍');
assert.strictEqual(I.substTotal('多段但只一个倍数 约858倍', '871', '按当前实时赔率连乘'), '多段但只一个倍数 约871倍(按当前实时赔率连乘)');
// 方案卡大号数字必须跟着 hc7/max7 走, 否则同一页上"方案卡 858 倍"与"让球7关面板 705 倍"当面对不上
assert.strictEqual(I.totalNum('7关全中约858倍'), '858');
assert.strictEqual(I.totalNum('胆拖主串3串1(007×008×006)约3.5倍;7关全串约26倍'), '', '多段 → 放弃替换');
assert.strictEqual(I.substPct('≈858倍', [['858', '705', '含1条停售腿']]), '≈705倍(含1条停售腿)');
assert.strictEqual(I.substPct('≈6.0倍', [['858', '705', '实时连乘']]), '≈6.0倍', '数字不同源 → 一律不碰');
assert.strictEqual(I.substPct('≈6.0倍', [['24', '21.1', '实时连乘']]), '≈6.0倍', '不按名称猜: 6.0 不是 24');
assert.strictEqual(I.substPct('≈18万倍级', [['18', '19', '实时连乘']]), '≈18万倍级', '数字后不跟「倍」不算命中(18万倍 的 18 是这个方案自己的数)');
assert.strictEqual(I.substPct('≈858倍', [['858.0', '705', '实时连乘']]), '≈858倍', '必须整串数字相等');
// 方案块: 腿实时化了, totalOdds 就必须跟着重算 —— 否则页面上是"一列新腿赔率配一个旧总数", 用户一乘就发现不对
(function () {
  const plan = { totalOdds: '7关全中约858倍', legs: [
    { match: '010 米堡(-1) vs 米尔沃尔', pick: '让胜', odds: '2.20' },
    { match: '011 利物浦(-1) vs 热刺', pick: '让平', odds: '3.58' },
  ] };
  const byId3 = { '010': { hhad: [2.07, 3.6, 3.3] }, '011': { hhad: [4.4, 3.58, 1.7] } };
  const o = I.overlayPlan(plan, byId3, 'hhad', {});
  assert.strictEqual(o.legs[0].odds, '2.07', '腿应用实时值');
  assert.strictEqual(o.legs[1].odds, '3.58');
  assert.strictEqual(o.totalOdds, '7关全中约7.4倍(按当前实时赔率连乘)', '全刷新 → 重算并标注实时口径, 实际 ' + o.totalOdds);
  assert.strictEqual(plan.totalOdds, '7关全中约858倍', 'overlayPlan 不得改写入参');
  assert.strictEqual(plan.legs[0].odds, '2.20');
  // 有腿已停售(实时池里没有) → 沿用该腿构建值参与连乘, 并在括号里点数, 不能装作是实时口径
  const o2 = I.overlayPlan({ totalOdds: '7关全中约858倍', legs: [
    { match: '002 大田市民(-1) vs 京都', pick: '让平', odds: '3.55' },
    { match: '010 米堡(-1) vs 米尔沃尔', pick: '让胜', odds: '2.20' },
  ] }, { '010': { hhad: [2.07, 3.6, 3.3] } }, 'hhad', { '002': true });
  assert.strictEqual(o2.totalOdds, '7关全中约7.3倍(按页面显示赔率连乘, 含 1 条已停售腿构建值)', '实际 ' + o2.totalOdds);
  // 多段倍数的原文一律不碰(猜错哪一段就是假数)
  const o3 = I.overlayPlan({ totalOdds: '胆拖主串3串1(010×011×012)约3.5倍;7关全串约26倍', legs: [
    { match: '010 米堡(-1) vs 米尔沃尔', pick: '让胜', odds: '2.20' },
  ] }, { '010': { hhad: [2.07, 3.6, 3.3] } }, 'hhad', {});
  assert.strictEqual(o3.totalOdds, '胆拖主串3串1(010×011×012)约3.5倍;7关全串约26倍');
  assert.strictEqual(o3.legs[0].odds, '2.07', '原文不碰, 但腿照刷');
})();
console.log('OK 3/5 overlayDay: 纯函数 / 日期闸 / 停售标记 / 已结算不可动 / 倍数目数不符则不动');

// ---- ④ 取数失败 → 原样返回 ----
// ★打桩的是**全局 fetch**, 不是 LO.fetchLive: refreshDays 闭包捕获的是模块内部的 fetchLive,
//   在导出的对象上改 fetchLive 根本不会生效(打了桩也照样真出网, 冒烟会"假绿")。
const realFetch = global.fetch;
global.fetch = function () { return Promise.reject(new Error('down')); };
const arr = [mkDay(today)];
LO.refreshDays(arr).then((r) => {
  assert.strictEqual(r, arr, '取数失败必须返回**同一个数组引用**(页面据此判断"没叠加")');
  assert.strictEqual(LO.overlayDay(mkDay(today), {}).matches[0].sp[0], 1.59, '空池不得改数');
  console.log('OK 4/5 取数失败兜底: refreshDays 原样返回入参, 页面退回构建时快照');
  global.fetch = realFetch;
  return step5();
}).catch((e) => { console.error('SMOKE FAIL:', (e && e.message) || e); process.exit(1); });

// ---- ⑤ 真实官方接口端到端 ----
function step5() {
  if (OFFLINE) {
    console.log('OK 5/5 (--offline 跳过真实接口端到端)');
    console.log('\nSMOKE OK — 网站实时赔率全部离线断言通过');
    return null;
  }
  assert(typeof fetch === 'function', '本机 node 需具备全局 fetch(Node18+); 浏览器本就自带');
  const d0 = days[0];
  assert.strictEqual(d0.date, LO.todayBj(), '本冒烟的对照假定 data/predictions.js 最新一天就是今天');
  return LO.fetchLive().then((live) => {
    assert(Object.keys(live).length > 0, '官方实时池为空');
    return LO.refreshDays(days).then((out) => {
      assert.notStrictEqual(out, days, '今日应发生叠加');
      const o = out[0];
      console.log('\n官方池: ' + Object.keys(live).length + ' 场   顶部时效文案:' + LO.note(o));
      console.log('\n编号      主客队               构建时快照       官方实时         状态');
      let drift = 0, closed = 0;
      d0.matches.forEach((m, i) => {
        const a = m.sp || m.hhad, b = o.matches[i].sp || o.matches[i].hhad;
        if (JSON.stringify(a) !== JSON.stringify(b)) drift++;
        if (o.matches[i].oddsClosed) closed++;
        console.log(m.id + '  ' + ((m.home + 'vs' + m.away).padEnd(20, '　').slice(0, 20)) + ' ' +
          String(a ? a.join('/') : '—').padEnd(17) + String(b ? b.join('/') : '—').padEnd(17) +
          (o.matches[i].oddsClosed ? '★已停售' : '在售'));
      });
      console.log('\n汇总: ' + d0.matches.length + ' 场中 ' + drift + ' 场赔率已漂移, ' + closed + ' 场已停售');
      console.log('      hc7 倍数: ' + d0.hc7.totalOdds + ' → ' + o.hc7.totalOdds);
      console.log('      max7 倍数: ' + d0.max7.totalOdds + ' → ' + o.max7.totalOdds);
      // 历史日的已结算腿必须原封不动
      const old = days.find((d) => d.date !== d0.date && d.max7 && (d.max7.legs || []).some((l) => l.result));
      if (old) {
        const beforeOld = JSON.stringify(old.max7.legs);
        for (let i = 0; i < days.length; i++) if (days[i].date === old.date) assert.strictEqual(out[i], days[i], '历史日对象不得被替换');
        assert.strictEqual(JSON.stringify(old.max7.legs), beforeOld, '历史日已结算腿不得被改');
      }
      console.log('\nSMOKE OK — 网站实时赔率全部断言通过');
      return null;
    });
  });
}
