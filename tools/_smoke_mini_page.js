/* tools/_smoke_mini_page.js — 小程序推荐页冒烟(node 伪 Page/wx 环境)
 * 覆盖: ① Page 注册器捕获 index.js 的 data 默认值 ② buildGroups 纯函数分组断言
 *   (真实 data/predictions.js 的 2026-09-12: 竞彩 29 场/北单 8 腿/亚盘 ahPick 非空场数,
 *    北单 126 美因茨场已完场 1-3 判定=miss)
 * ③ onShow 端到端: 注入假 fetcher 验证 成功渲染 / 失败读缓存 / 失败无缓存 三态。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- 真实数据 ----
const src = fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8');
const days = new Function(src + ';return PREDICTION_DAYS;')();
const payload = days.find((d) => d.date === '2026-09-12');
assert(payload, '未找到 2026-09-12 数据');

// ---- 伪 wx + Page 注册器 ----
const storage = {};
global.wx = {
  setStorageSync: (k, v) => { storage[k] = v; },
  getStorageSync: (k) => storage[k],
  stopPullDownRefresh: () => {},
};
let captured = null;
global.Page = (cfg) => { captured = cfg; };

const api = require('../miniprogram/utils/api.js');
const judge = require('../miniprogram/utils/judge.js');
const pageMod = require('../miniprogram/pages/index/index.js');
const jcMod = require('../miniprogram/utils/jc.js');

assert(captured, 'index.js 未调用 Page()');
const { buildGroups } = pageMod;
assert.strictEqual(typeof buildGroups, 'function', 'index.js 未导出 buildGroups');

// ---- ① data 默认值 ----
assert.strictEqual(captured.data.tab, 'jc');
assert.deepStrictEqual(captured.data.groups, { jc: [], bd: [], ah: [] });
assert.strictEqual(captured.data.loading, true);
console.log('OK 1/4 data 默认值(tab=jc, groups 空, loading)');

// ---- ② buildGroups 分组断言 ----
const groups = buildGroups(payload, judge);
assert.strictEqual(groups.jc.length, 29, '竞彩组应为 29 场, 实际 ' + groups.jc.length);
assert.strictEqual(groups.bd.length, 8, '北单组应为 8 腿, 实际 ' + groups.bd.length);
const ahCount = payload.matches.filter((m) => m.ahPick).length;
assert(ahCount > 0, '2026-09-12 应有 ahPick 非空场');
assert.strictEqual(groups.ah.length, ahCount, '亚盘组=ahPick 非空场数 ' + ahCount);
const leg126 = groups.bd.find((l) => l.bdNum === '126');
assert(leg126, '北单组缺 bdNum=126 腿');
assert.strictEqual(leg126.home, '美因茨', '126 腿主队切分应为 美因茨, 实际 ' + leg126.home);
assert.strictEqual(leg126.judge, 'miss', '126 美因茨场(完场 1-3, 让0 推荐3)应判 miss, 实际 ' + leg126.judge);
console.log('OK 2/4 buildGroups: 竞彩=' + groups.jc.length + ' 北单=' + groups.bd.length +
  ' 亚盘=' + groups.ah.length + ' 北单126判定=miss');

// ---- ③ onShow 端到端三态 ----
function fakeRes(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function newPage() {
  const p = Object.create(captured);
  p.data = JSON.parse(JSON.stringify(captured.data));
  p.setData = function (patch) { Object.assign(this.data, patch); };
  return p;
}
const tick = () => new Promise((r) => setTimeout(r, 100));
/* 失败路径要跨过 jc.js 的重试间隔(JC_RETRY_DELAY=300ms): 第一次失败后会等 300ms 再试一次才抛 */
const tickRetry = () => new Promise((r) => setTimeout(r, 700));

(async () => {
  // 成功: 注入假 fetcher 返回 payload(RPC 通道直接返回 payload 对象, 非 REST 数组包装)
  api.setFetcher(async () => fakeRes(payload));
  const p1 = newPage();
  p1.onShow();
  await tick();
  assert.strictEqual(p1.data.errMsg, '');
  assert.strictEqual(p1.data.loading, false);
  assert.strictEqual(p1.data.groups.jc.length, 29, 'onShow 成功态竞彩组应为 29');
  assert(p1.data.lastUpdated, 'lastUpdated 应写入');
  assert(p1.data.dailyTitle, 'dailyPost.title 应写入');
  assert.strictEqual(p1.data.planJc.length, payload.plan.filter((x) => x.market === 'jc').length);
  assert.strictEqual(p1.data.bdDisabled, false, '有北单数据时北单 Tab 可用');
  console.log('OK 3/4 onShow 成功态: 渲染+缓存+lastUpdated(' + p1.data.lastUpdated + ')');

  // 失败→有缓存: 渲染缓存 + 错误横幅
  api.setFetcher(async () => { throw new Error('network down'); });
  const p2 = newPage();
  p2.onShow();
  await tick();
  assert(p2.data.errMsg.indexOf('推荐数据拉取失败,显示缓存') === 0, '缓存降级应显示缓存提示+原因');
  assert.strictEqual(p2.data.groups.jc.length, 29, '缓存态竞彩组应为 29');
  console.log('OK 4/4a onShow 失败→缓存降级渲染+横幅');

  // 失败→无缓存: 仅错误提示
  delete storage.payloadCache;
  const p3 = newPage();
  p3.onShow();
  await tick();
  assert(p3.data.errMsg.indexOf('拉取失败') === 0, '无缓存降级应显示拉取失败+原因');
  assert.strictEqual(p3.data.groups.jc.length, 0);
  console.log('OK 4/4b onShow 失败→无缓存提示重试');

  // ---- ⑤ 竞彩实时赔率叠加(renderPayload → refreshLiveOdds, 2026-09-15 新增) ----
  // 场景: 官方把 008 从快照 1.59/3.35/4.95 浮到 1.56/3.40/5.15, 且 003 已过销售截止被下架。
  const today = jcMod.todayBj();
  const liveRows = {
    '周二008': { num: '周二008', st: 'Selling', sp: [1.56, 3.4, 5.15], hhad: [2.6, 3.4, 2.35], goalLine: -1, upd: '19:01:23' },
    // 让球-only(官方只开让球、没开胜平负, 见 jc.js noHadOf): 行**在池里**(在售)只是 sp 那一列为空。
    // 这与"下架"(整行不在池里 → 已停售)是两回事: 这场能买, 只是买不到 310
    '周二013': { num: '周二013', st: 'Selling', sp: null, hhad: [2.36, 4.25, 2.13], goalLine: 2, upd: '19:01:23' },
  };
  const calls = [];
  global.wx.cloud = {
    callFunction: (o) => {
      calls.push(o);
      return Promise.resolve({ result: { ok: true, data: { pools: ['had', 'hhad'], rows: liveRows } } });
    },
  };
  const todayPayload = {
    date: today,
    // 方案块 + 方案卡: pct 与 hc7/max7 的 totalOdds 是构建脚本同源写出的同一个数
    hc7: { totalOdds: '7关全中约858倍', legs: [
      { match: '008 阿拉维斯(-1) vs 巴伦西亚', pick: '让胜', odds: '2.50' },
      { match: '003 卡塔尔亚(+1) vs 韩国亚', pick: '让负', odds: '2.38' },
    ] },
    max7: { totalOdds: '7关全串约24倍', legs: [
      { match: '008 阿拉维斯 vs 巴伦西亚', pick: '主胜', odds: '1.59' },
      { match: '003 卡塔尔亚 vs 韩国亚', pick: '客胜', odds: '1.12', result: 'hit' }, // 已结算 → 不可动
    ] },
    plan: [
      { market: 'jc', name: '🔵 让球胜平负', pct: '≈858倍', text: '让球七关:008让-1主胜(2.50…)' },
      { market: 'std', name: '🌏 亚洲让球', pct: '≈6.0倍', text: '3串约6.0倍' },
      // 正文在**胜平负口径**下引用了 013('013皇马') → 该卡该挂一句口径说明(见 jc.js noHadNote)。
      // 没有 pct: 这张卡不挂 hc7/max7 的倍数, 只验口径说明那一行
      { market: 'jc', name: '🔵 双选方向', text: '双选:008阿拉维斯(主胜) / 013皇马(客胜)' },
    ],
    matches: [
      { id: '周二008', home: '阿拉维斯', away: '巴伦西亚', sp: [1.59, 3.35, 4.95], hhad: [2.5, 3.3, 2.4], spHandicap: -1, direction: '主胜' },
      { id: '周二003', home: '卡塔尔亚', away: '韩国亚', sp: [14.5, 6, 1.12], direction: '客胜' },
      // 构建时就没有 310(sp=null 而 hhad 是三个数 → 快照也能推出 noHad, 见 jc.js noHadOf 的兜底)
      { id: '周二013', home: '埃尔切', away: '皇马', sp: null, hhad: [2.36, 4.25, 2.13], spHandicap: 2, direction: '客胜' },
    ],
  };
  const p5 = newPage();
  p5.renderPayload(todayPayload, '');
  // 首屏必须**立刻**是快照: 实时值要等云函数回来, 不能让它卡着首屏
  assert.strictEqual(p5.data.groups.jc[0].spText, '1.59/3.35/4.95', '首屏应先渲染构建时快照');
  await tick();
  const g5 = p5.data.groups.jc;
  assert.strictEqual(calls.length, 1, '应只打一次云函数');
  assert.strictEqual(calls[0].data.fn, 'jc_live', '应走 jc_live 分支');
  assert.strictEqual(p5.data.oddsStatus, '官方实时');
  assert.strictEqual(g5[0].spText, '1.56/3.4/5.15', '008 应换成官方实时值, 实际 ' + g5[0].spText);
  assert.strictEqual(g5[0].oddsLive, true);
  assert.strictEqual(g5[0].oddsClosed, false);
  assert.strictEqual(g5[0].oddsUpd, '19:01:23');
  assert.strictEqual(g5[0].oddsTip, '赔率官方实时 19:01:23');
  assert.strictEqual(g5[1].oddsTip, '已停售 · 官方已下架');
  assert.strictEqual(g5[1].oddsClosed, true, '003 不在官方实时池 → 应标已停售');
  assert.strictEqual(g5[1].spText, '14.5/6/1.12', '已停售场保留快照值供回顾, 不改数只禁投');
  // 入参载荷不得被就地改写(overlay 是纯函数; 页面 data.payload 换成叠加副本即可)
  assert.deepStrictEqual(todayPayload.matches[0].sp, [1.59, 3.35, 4.95], 'overlay 不得改写入参 payload');
  // 建腿: 在售场按实时赔率, 停售场直接拒绝(否则用户登记的是一张买不到的单)
  assert.strictEqual(p5.makeLeg({ type: 'jc', id: '周二008' }).odds, '1.56', '在售场建腿应用实时赔率');
  assert.strictEqual(p5.makeLeg({ type: 'jc', id: '周二003' }), null, '已停售场不得进票');
  // 非今日(补看历史某天)不得触发叠加 —— 否则官方池里没有那些场次, 整页会被误标"已停售"
  const p6 = newPage();
  const before = calls.length;
  p6.renderPayload({ date: '2026-09-12', matches: [{ id: '周二008', sp: [1.59, 3.35, 4.95] }] }, '');
  await tick();
  assert.strictEqual(calls.length, before, '非今日不得打云函数');
  assert.strictEqual(p6.data.groups.jc[0].oddsClosed, false, '历史日不得被标停售');
  assert.strictEqual(p6.data.groups.jc[0].spText, '1.59/3.35/4.95');
  // 取数失败: 保持快照 + 顶部标注, 不清赔率不报错
  global.wx.cloud.callFunction = () => Promise.reject(new Error('down'));
  const p7 = newPage();
  p7.renderPayload({ date: today, matches: [{ id: '周二008', sp: [1.59, 3.35, 4.95] }] }, '');
  await tickRetry();
  assert.strictEqual(p7.data.groups.jc[0].spText, '1.59/3.35/4.95', '取数失败应保持快照');
  assert.strictEqual(p7.data.oddsStatus, '实时取数失败, 显示构建时快照');
  // 方案卡大号倍数: 与 hc7/max7 同源(构建脚本写两处) → 必须跟着实时值走,
  // 否则卡片上会是"一列新赔率配一个旧倍数", 用户一乘就说不对
  assert.strictEqual(p5.data.planJc[0].pct, '≈6.2倍(含1条停售腿)', '让球方案倍数应重算, 实际 ' + p5.data.planJc[0].pct);
  assert.strictEqual(p5.data.planJc.length, 2, 'planJc 只含 market=jc 的方案卡(让球胜平负 + 双选方向)');
  assert.strictEqual(p5.data.payload.plan[1].pct, '≈6.0倍', '不同源的方案卡一律不碰');
  assert.strictEqual(p5.data.payload.hc7.totalOdds, '7关全中约6.2倍(按页面显示赔率连乘, 含 1 条已停售腿构建值)', '实际 ' + p5.data.payload.hc7.totalOdds);
  assert.strictEqual(p5.data.payload.max7.totalOdds, '7关全串约24倍', '有已结算腿 → 不动倍数');
  assert.strictEqual(todayPayload.hc7.totalOdds, '7关全中约858倍', 'planPatch 不得改写入参');
  assert.strictEqual(todayPayload.plan[0].pct, '≈858倍');
  // 腿映射自证: 「客胜」含'胜'字, 按单字判会归到主胜(下标 0) → 客胜腿拿到主胜赔率
  assert.strictEqual(jcMod.pickIdx('客胜'), 2);
  assert.strictEqual(jcMod.pickIdx('主胜'), 0);
  assert.strictEqual(jcMod.pickIdx('让负'), 2);
  assert.strictEqual(jcMod.legOdds({ match: '008 阿拉维斯 vs 巴伦西亚', pick: '客胜', odds: '4.95' },
    { '008': { sp: [1.56, 3.4, 5.15] } }, 'sp'), '5.15', '客胜必须取客胜那一列');
  // ---- 让球-only(官方只开让球、没开胜平负, 见 utils/jc.js noHadOf) ----
  // 用户 2026-09-15 的原话: "013皇马是-2球的盘, 没有开不让球的胜平负" ——
  // 卡片上原本顶着一个**投不了的**胜平负方向, 现在换成让球口径
  const g13 = g5[2];
  assert.strictEqual(g13.noHad, true, '013 官方池里没有 310 → 应判让球-only');
  assert.strictEqual(g13.oddsClosed, false, '让球-only ≠ 已停售: 行在池里, 这场买得到');
  assert.strictEqual(g13.dirTag, '让球', '让球-only 场徽章换「让球」, 实际 ' + g13.dirTag);
  assert.strictEqual(g13.badgeClass, 'badge-rang');
  assert.strictEqual(g13.direction, '让+2 让球负',
    '方向要带让球线 + 官方口径词(客胜→让球负), 实际 ' + g13.direction);
  assert.strictEqual(g13.spText, '', '让球-only 场压根没有胜平负 SP, 不得留空串以外的残值');
  assert.strictEqual(g13.spLine, '胜负 无(官方未开)',
    '「胜负」行该说"压根没有这个盘"(不是"未开售"), 实际 ' + g13.spLine);
  assert.strictEqual(g13.spBlank, true, '胜负那行没价 → 走灰字样式');
  assert.strictEqual(g13.hhadText, '2.36/4.25/2.13', '让球赔率取官方实时值, 实际 ' + g13.hhadText);
  assert.strictEqual(g13.hhadLine, '让球胜负(让+2) 2.36/4.25/2.13',
    '让球那行该带盘口标签, 实际 ' + g13.hhadLine);
  assert(g13.noHadTip.indexOf('让球负') !== -1 && g13.noHadTip.indexOf('让+2') === -1,
    '提醒该点在"可投的就是让球负"上(不再说"不可投"), 实际 ' + g13.noHadTip);
  assert.strictEqual(g13.oddsTip, '赔率官方实时 19:01:23', '在售场不该被按"下架"处理');
  // 建腿: 默认腿型是 jcHad, 不拦就会往票里塞一条 odds 为空、奖金算成 0 的"买不到的单"
  const leg13 = p5.makeLeg({ type: 'jc', id: '周二013' });
  assert(leg13, '让球-only 场应能进票(可投的是让球腿)');
  assert.strictEqual(leg13.kind, 'jcHhad', '让球-only 场必须建让球腿, 实际 ' + leg13.kind);
  assert.strictEqual(leg13.odds, '2.13', '让球腿取 hhad 客胜那一列, 实际 ' + leg13.odds);
  assert(leg13.odds !== '', '★不得出现空赔率的腿(cart.calc 会把它算成奖金 0)');
  assert.strictEqual(p5.makeLeg({ type: 'jc', id: '周二008' }).kind, 'jcHad', '有 310 的场照旧建胜平负腿');
  // 方案卡口径说明: 只挂给**在正文里被当胜平负写**的那张卡(见 jc.js noHadNote)
  assert.strictEqual(p5.data.planJc.length, 2, 'planJc 只含 market=jc 的方案卡');
  assert(p5.data.planJc[1].noHadNote && p5.data.planJc[1].noHadNote.indexOf('013') !== -1,
    '双选方向卡(正文写 013皇马)应挂口径说明, 实际 ' + JSON.stringify(p5.data.planJc[1].noHadNote));
  assert.strictEqual(p5.data.planJc[0].noHadNote, undefined,
    '让球口径的卡(正文写 013让+2负 那种)不该被误挂');
  assert.strictEqual(todayPayload.plan[2].noHadNote, undefined, 'planPatch 不得改写入参');
  // 方向词官方口径(2026-09-15 用户拿体彩计算器截图拍板): 数据字段 主胜/客胜 → 卡片写 胜/负, 官方不写"主客"
  assert.strictEqual(g5[0].direction, '胜', '有 310 的场方向写「胜」(不是「主胜」), 实际 ' + g5[0].direction);
  assert.strictEqual(g5[1].direction, '负', '客胜写「负」, 实际 ' + g5[1].direction);
  assert.strictEqual(g5[0].hhadLine, '让球胜负(让-1) ' + g5[0].hhadText,
    '两盘各一行: 有 310 的场也让球那行带盘口标签, 实际 ' + g5[0].hhadLine);
  assert.strictEqual(g5[1].spLine, '胜负 14.5/6/1.12',
    '★已停售场(官方下架)照旧保留快照价供回顾, 与让球-only 的「无(官方未开)」不是一回事, 实际 ' + g5[1].spLine);
  assert.strictEqual(g5[1].spBlank, false, '有快照价 → 不挂灰字样式');
  console.log('OK 5/5 竞彩实时叠加: 快照首屏→实时替换 / 下架场禁投 / 方案倍数同步 / 纯函数 / 日期闸 / 失败兜底');
  console.log('  + 让球-only: 013 徽章「让球」/ 方向 让+2 让球负 / 建腿 jcHhad(2.13) 而非空赔率 jcHad / 口径说明只挂双选方向卡');

  console.log('\nSMOKE OK — 推荐页全部断言通过');
})().catch((e) => {
  console.error('SMOKE FAIL:', e && e.message ? e.message : e);
  process.exit(1);
});
