/* tools/_smoke_mini_settle.js — 小程序投注结算模块冒烟(node 环境)
 * ① 虚拟北单串(2026-09-12 真实 beidan310.legs 前 3 腿, 已知比分 009=3-0/008=1-3/012=2-2):
 *   全红情形 status='hit' 且 actual_payout=SP 连乘×unit 精确值; 断 008 腿情形='miss'/0。
 * ② 亚盘 side 推导: {home:'利物浦',away:'富勒姆',pick:'富勒姆+1.25'} 0-0 → win/side=away。
 * ③ 别名容错: {home:'科里蒂巴',away:'巴竞技',pick:'巴拉纳竞技-0.25'} 3-3 → loseHalf/side=away。
 * ④ 统计卡命中率: 2hit+1half+1miss → 62.5%。
 * 附: 伪 Page/wx 环境加载 bets 页面模块不崩。全绿输出 SMOKE_OK。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- 真实数据: 2026-09-12 北单前 3 腿 ----
const src = fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8');
const days = new Function(src + ';return PREDICTION_DAYS;')();
const payload = days.find((d) => d.date === '2026-09-12');
assert(payload && payload.beidan310 && payload.beidan310.legs.length >= 3, '未找到 2026-09-12 北单数据');
const legs = payload.beidan310.legs.slice(0, 3);
assert.strictEqual(legs[0].match.slice(0, 3), '009');
assert.strictEqual(legs[1].match.slice(0, 3), '008');
assert.strictEqual(legs[2].match.slice(0, 3), '012');

const settle = require('../miniprogram/utils/settle.js');

const SCORES = { '009': '3-0', '008': '1-3', '012': '2-2' };
const scoreOf = (k) => SCORES[k] || null;

// ---- ① 北单串结算 ----
// 腿判: 009 让-2 3-0 → 让后 1>0 赛果'3', pick '3/1' 中 '3' → hit, SP=sp3[0]=1.22
//       008 让0  1-3 → 赛果'0', pick '3' → miss
//       012 让-2 2-2 → 让后 0<2 赛果'0', pick '1/0' 中 '0' → hit, SP=sp3[2]=11.76
const rAll = settle.settleBet({ legs: [legs[0], legs[2]], stakes: 2, unit: 2, amount: 4 }, scoreOf);
assert(rAll, '全红串应可结算');
assert.strictEqual(rAll.status, 'hit', '全红串状态');
assert.deepStrictEqual(rAll.legs.map((l) => l.result), ['hit', 'hit'], '全红串腿判');
assert.strictEqual(rAll.actual_payout, 28.69, '全红奖金=1.22×11.76×2=28.69');
assert.strictEqual(rAll.profit, 24.69, '全红盈亏=28.69-4');
assert(rAll.settled_at && !Number.isNaN(Date.parse(rAll.settled_at)), 'settled_at 应为 ISO 时间');

const rBroken = settle.settleBet({ legs: legs, stakes: 4, unit: 2, amount: 8 }, scoreOf);
assert(rBroken, '断腿串应可结算');
assert.strictEqual(rBroken.status, 'miss', '断 008 腿=miss');
assert.strictEqual(rBroken.actual_payout, 0, '断腿奖金=0');
assert.strictEqual(rBroken.profit, -8, '断腿盈亏=-amount');
assert.deepStrictEqual(rBroken.legs.map((l) => l.result), ['hit', 'miss', 'hit'], '断腿串腿判');

assert.strictEqual(settle.settleBet({ legs: [legs[0]], unit: 2, amount: 2 }, () => null), null, '未完场不结算');

// ---- ② 亚盘 side 推导(命名队=客队) ----
const ah1 = settle.judgeAhLeg({ home: '利物浦', away: '富勒姆', pick: '富勒姆+1.25' }, '0-0');
assert.strictEqual(ah1.result, 'win', '富勒姆+1.25 受让 0-0 → win');
assert.strictEqual(ah1.side, 'away', '命名队富勒姆=客队');
assert.strictEqual(ah1.sideGuess, false, 'side 直比对命中非猜测');
assert.strictEqual(settle.settleLeg({ home: '利物浦', away: '富勒姆', pick: '富勒姆+1.25' }, '0-0'), 'hit', 'settleLeg 映射 win→hit');

// ---- ③ 别名容错(巴拉纳竞技 ↔ 巴竞技) ----
const ah2 = settle.judgeAhLeg({ home: '科里蒂巴', away: '巴竞技', pick: '巴拉纳竞技-0.25' }, '3-3');
assert.strictEqual(ah2.result, 'loseHalf', '巴拉纳竞技-0.25 让球 3-3 → loseHalf');
assert.strictEqual(ah2.side, 'away', '别名命中客队巴竞技');
assert.strictEqual(ah2.sideGuess, false, '别名命中非猜测');
assert.strictEqual(settle.settleLeg({ home: '科里蒂巴', away: '巴竞技', pick: '巴拉纳竞技-0.25' }, '3-3'), 'half', 'settleLeg 映射 loseHalf→half');

// ---- ④ 统计卡命中率 ----
const st = settle.calcStats([
  { status: 'hit', amount: 10, actual_payout: 20, profit: 10 },
  { status: 'hit', amount: 10, actual_payout: 15, profit: 5 },
  { status: 'half', amount: 10, actual_payout: 8, profit: -2 },
  { status: 'miss', amount: 10, actual_payout: 0, profit: -10 },
  { status: 'pending', amount: 6 },
]);
assert.strictEqual(st.hitRate, 62.5, '命中率=(2+0.5)/4=62.5%');
assert.strictEqual(st.settled, 4);
assert.strictEqual(st.pending, 1);
assert.strictEqual(st.totalAmount, 46);
assert.strictEqual(st.totalPayout, 43);
assert.strictEqual(st.profit, 3);

// ---- ⑤ 页面端到端(mock api): 自动结算回写 / 404 降级 / 部分完场不写库 ----
global.wx = { stopPullDownRefresh: () => {} };
let captured = null;
global.Page = (cfg) => { captured = cfg; };
const api = require('../miniprogram/utils/api.js');
settle.fetchScoreForLeg = async () => null; // 确定性: ESPN 通道置为不可得, 走 prediction_days 兜底

const bet = {
  id: 'b1', bet_date: '2026-09-12', source: 'bd', legs: legs,
  stakes: 4, unit: 2, amount: 8, expect_payout: 55, status: 'pending',
  actual_payout: 0, profit: 0,
};
const payloadDay = {
  matches: [
    { id: '周六009', finalScore: '3-0' },
    { id: '周六008', finalScore: '1-3' },
    { id: '周六012', finalScore: '2-2' },
  ],
};
const patched = [];
api.fetchBets = async () => [bet];
api.fetchPayloadByDate = async (date) => (date === '2026-09-12' ? payloadDay : null);
api.updateBet = async (id, patch) => { patched.push({ id, patch }); return Object.assign({ id }, patch); };

const pageMod = require('../miniprogram/pages/bets/bets.js');
assert(captured && typeof captured.load === 'function', 'bets.js 未注册 Page');
assert.strictEqual(typeof pageMod.decorateBet, 'function', 'bets.js 未导出 decorateBet');
assert.strictEqual(captured.data.loading, true);
assert.deepStrictEqual(captured.data.bets, []);
const ctx = Object.assign({}, captured, {
  data: JSON.parse(JSON.stringify(captured.data)),
  setData(p) { this.data = Object.assign({}, this.data, p); },
});

(async () => {
  // 全腿完场 → 结算回写
  await ctx.load();
  assert.strictEqual(ctx.data.errMsg, '');
  assert.strictEqual(patched.length, 1, 'pending 注单应回写一次');
  assert.strictEqual(patched[0].patch.status, 'miss', '008 断腿 → miss');
  assert.strictEqual(patched[0].patch.actual_payout, 0);
  assert.strictEqual(patched[0].patch.profit, -8);
  assert.deepStrictEqual(patched[0].patch.legs.map((l) => l.result), ['hit', 'miss', 'hit']);
  assert(patched[0].patch.settled_at, 'settled_at 应写入');
  assert.strictEqual(ctx.data.bets[0].capText, '未中');
  assert.strictEqual(ctx.data.stats.miss, 1);
  assert.strictEqual(ctx.data.settling, false);

  // 部分完场 → 不写库, 腿级结果就地展示
  const bet2 = {
    id: 'b2', bet_date: '2026-09-12', source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0,
    legs: [
      { match: '008 美因茨 vs 法兰克福', home: '美因茨', away: '法兰克福', pick: '3', odds: '1.84', league: '德甲' },
      { match: '009 多特蒙德 vs 帕德博恩', home: '多特蒙德', away: '帕德博恩', pick: '3', odds: '1.22', league: '德甲' },
    ],
  };
  api.fetchBets = async () => [bet2];
  api.fetchPayloadByDate = async () => ({ matches: [{ id: '周六008', finalScore: '1-3' }] });
  const before = patched.length;
  await ctx.load();
  assert.strictEqual(patched.length, before, '部分完场不得写库');
  assert.strictEqual(ctx.data.bets[0].capText, '待结算');
  assert.deepStrictEqual(ctx.data.bets[0].legRows.map((l) => l.mark), ['✗', '待']);
  assert.strictEqual(ctx.data.bets[0].legRows[0].finalScore, '1-3');

  // 404/网络异常 → 横幅 + 空列表不崩
  api.fetchBets = async () => { throw new Error('Supabase GET /rest/v1/bets HTTP 404: relation bets not found'); };
  await ctx.load();
  assert(ctx.data.errMsg.indexOf('登记表未就绪') !== -1, '404 应给未就绪横幅, 实际: ' + ctx.data.errMsg);
  assert.deepStrictEqual(ctx.data.bets, []);
  assert.strictEqual(ctx.data.loading, false);

  console.log('SMOKE_OK');
})().catch((e) => { console.error(e); process.exit(1); });
