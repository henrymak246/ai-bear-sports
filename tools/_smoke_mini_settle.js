/* tools/_smoke_mini_settle.js — 小程序投注结算模块冒烟(node 环境)
 * ① 合成北单串 fixture(与 data/predictions.js 真实数据彻底解耦, 日抛/人工回填均不影响):
 *   腿A 让-2 pick'3/1' 3-0 → 让后 1>0 赛果'3' → hit(SP=sp3[0]=1.22);
 *   腿B 让0 pick'3' 1-3 → 赛果'0' → miss(断腿路径);
 *   腿C 让-2 pick'1/0' 2-2 → 让后 0<2 赛果'0' → hit(SP=sp3[2]=11.76)。
 *   全红情形 status='hit' 且 actual_payout=SP 连乘×unit 精确值; 断腿B情形='miss'/0。
 * ② 亚盘 side 推导: {home:'利物浦',away:'富勒姆',pick:'富勒姆+1.25'} 0-0 → win/side=away。
 * ③ 别名容错: {home:'科里蒂巴',away:'巴竞技',pick:'巴拉纳竞技-0.25'} 3-3 → loseHalf/side=away。
 * ④ 统计卡命中率: 2hit+1half+1miss → 62.5%。
 * ⑤ 页面端到端(mock api): 全腿完场整票回写 / 404 降级。
 * ⑥ 结算实时化: a)一腿 miss 立即整票判死; b)无 miss 部分完场仅腿级回写(快照 4 原值随腿上送);
 *   c)已判死票继续补腿且永不改 status/payout/profit/settled_at + 无变化轮次零写库。
 * ⑦ 自动轮询: 无 wx.request 不起表 / 间隔 300000 / 重复 onShow 不叠加 / onHide·onUnload 停表 /
 *   无未完场腿 tick 零请求 / 有则真请求且静默轮不置 loading 不闪横幅。
 * ⑧ settle 判定修复: jcHhad 真让球(修前恒 miss) / 复式腿按**命中项**取 SP(修前恒取首段) /
 *   odds 段数不足回退首段而非 0。
 * ⑨ cart.optionsOf / applyPicks 纯函数: 选项序 3/1/0、本地赔率优先、finalScore 保留、push 保留、脏码丢弃。
 * ⑩ 页面编辑/删除: canEdit 分派(亚盘腿不可编)、开层补赔率、复式重算注数投入、保存失败复位、
 *   删除先确认且 _bets/bets/stats 同步。
 * ⑪ 并发闸门: 在飞的旧结算不得用旧 legs 覆盖编辑结果(_seq 双道守卫 + _autoQueued 补跑)。
 * ⑫ 竞彩腿取分键: legKey 兜底 leg.id(修前恒 '', 同轮腿间比分串味 + payload 回退失效)。
 * 全绿输出 SMOKE_OK。
 * ★updateBet / updateBetLegs / editBet / deleteBet 必须打桩: 否则 Node 有全局 fetch 会真连 Supabase
 *   改库 —— 漏桩 deleteBet 就是**真删用户库里的票**。 */
'use strict';
const assert = require('assert');

// ---- 合成北单腿 fixture(判定路径同原 9-12 用例: 让球/断腿/全红) ----
const legs = [
  { match: '009 甲队 vs 乙队', home: '甲队', away: '乙队', pick: '3/1', handicap: '-2', sp3: ['1.22', '6.83', '10.65'], odds: '1.22/6.83', league: '德甲' },
  { match: '008 丙队 vs 丁队', home: '丙队', away: '丁队', pick: '3', handicap: '0', sp3: ['1.84', '3.97', '3.79'], odds: '1.84', league: '德甲' },
  { match: '012 戊队 vs 己队', home: '戊队', away: '己队', pick: '1/0', handicap: '-2', sp3: ['1.22', '6.60', '11.76'], odds: '6.60/11.76', league: '英超' },
];
const DAY = '2000-01-01'; // 合成注单日期, 仅作 mock 键, 与真实 payload 无关

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

// ---- ①' 提前判死(结算实时化核心): 一腿 miss + 其余未完 → 立即 miss/0/-amount ----
const rEarly = settle.settleBet(
  { legs: [legs[1], legs[0]], unit: 2, amount: 4 },
  (k) => ({ '008': '1-3' })[k] || null
);
assert(rEarly, '一腿 miss 应立即判死(不等其余腿完场)');
assert.strictEqual(rEarly.status, 'miss', '提前判死状态=miss');
assert.strictEqual(rEarly.actual_payout, 0, '提前判死奖金=0(不得半途 SP 连乘)');
assert.strictEqual(rEarly.profit, -4, '提前判死盈亏=-amount');
assert.deepStrictEqual(rEarly.legs.map((l) => l.result), ['miss', null], '未完场腿 result=null 一并返回');

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

// ---- ⑤ 页面端到端(mock api): 自动结算回写 / 404 降级 ----
const modalLog = []; // showModal 调用记录。默认**不回调 success** = 永不确认, 任何漏写用例都不会误删
global.wx = {
  stopPullDownRefresh: () => {},
  showToast: () => {},
  showModal: (o) => { modalLog.push(o); },
};
let captured = null;
global.Page = (cfg) => { captured = cfg; };
const api = require('../miniprogram/utils/api.js');
settle.fetchScoreForLeg = async () => null; // 确定性: ESPN 通道置为不可得, 走 prediction_days 兜底

const bet = {
  id: 'b1', bet_date: DAY, source: 'bd', legs: legs,
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
const legWrites = []; // { id, legs, snapshot } — 腿级回写(已判死票/部分完场)
const edits = [];     // { id, patch } — mini_edit_bet
const deletes = [];   // id — mini_delete_bet
api.fetchBets = async () => [bet];
api.fetchPayloadByDate = async (date) => (date === DAY ? payloadDay : null);
api.updateBet = async (id, patch) => { patched.push({ id, patch }); return Object.assign({ id }, patch); };
api.updateBetLegs = async (id, legs2, snapshot) => { legWrites.push({ id, legs: legs2, snapshot }); return { id }; };
api.editBet = async (id, patch) => { edits.push({ id, patch }); return { id }; };
// ★editBet/deleteBet 必须打桩: 漏桩 deleteBet 就是真删用户 Supabase 库里的票
api.deleteBet = async (id) => { deletes.push(id); return { id }; };

const pageMod = require('../miniprogram/pages/bets/bets.js');
assert(captured && typeof captured.load === 'function', 'bets.js 未注册 Page');
assert.strictEqual(typeof pageMod.decorateBet, 'function', 'bets.js 未导出 decorateBet');
assert.strictEqual(captured.data.loading, true);
assert.deepStrictEqual(captured.data.bets, []);
const ctx = Object.assign({}, captured, {
  data: JSON.parse(JSON.stringify(captured.data)),
  setData(p) { this.data = Object.assign({}, this.data, p); },
});

/* 冲掉 n 个宏任务: 页面里有些链子(bindtap 回调 / showModal 的 success)不返回 promise,
   只能靠"再等几个 tick"让它们落地 */
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

(async () => {
  // ⑤a 全腿完场 → 整票结算回写
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

  // ---- ⑥ 结算实时化 ----
  // ⑥a 一腿 miss + 一腿未完 → 整票立即判死写库(不等其余腿完场)
  const betDead = {
    id: 'b2', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0, settled_at: null,
    legs: [
      { match: '008 美因茨 vs 法兰克福', home: '美因茨', away: '法兰克福', pick: '3', odds: '1.84', league: '德甲' },
      { match: '009 多特蒙德 vs 帕德博恩', home: '多特蒙德', away: '帕德博恩', pick: '3', odds: '1.22', league: '德甲' },
    ],
  };
  api.fetchBets = async () => [betDead];
  api.fetchPayloadByDate = async () => ({ matches: [{ id: '周六008', finalScore: '1-3' }] });
  const beforeA = patched.length;
  await ctx.load();
  assert.strictEqual(patched.length, beforeA + 1, '一腿 miss 应立即整票判死写库');
  assert.strictEqual(patched[beforeA].patch.status, 'miss', '提前判死状态=miss');
  assert.strictEqual(patched[beforeA].patch.actual_payout, 0, '提前判死奖金=0');
  assert.strictEqual(patched[beforeA].patch.profit, -2, '提前判死盈亏=-amount');
  assert.deepStrictEqual(patched[beforeA].patch.legs.map((l) => l.result), ['miss', null], '未完场腿 result=null 一并回写');
  assert.strictEqual(ctx.data.bets[0].capText, '未中', '胶囊应立刻变未中');
  assert.deepStrictEqual(ctx.data.bets[0].legRows.map((l) => l.mark), ['✗', '待'], '腿级展示: 黑腿✗ 未完场待');
  assert.strictEqual(ctx.data.stats.miss, 1);
  assert.strictEqual(settle.betNeedsPoll(betDead), true, '判死后仍有未完场腿 → 不得停轮询');

  // ⑥b 无 miss 部分完场 → 仅腿级回写, 票仍"待结算"
  const betPartial = {
    id: 'b3', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0, settled_at: null,
    legs: [
      { match: '008 美因茨 vs 法兰克福', home: '美因茨', away: '法兰克福', pick: '0', odds: '3.40', league: '德甲' },
      { match: '009 多特蒙德 vs 帕德博恩', home: '多特蒙德', away: '帕德博恩', pick: '3', odds: '1.22', league: '德甲' },
    ],
  };
  api.fetchBets = async () => [betPartial];
  const beforeB = patched.length;
  const lwB = legWrites.length;
  await ctx.load();
  assert.strictEqual(patched.length, beforeB, '部分完场不得整票写库');
  assert.strictEqual(legWrites.length, lwB + 1, '部分完场应腿级回写一次');
  assert.strictEqual(legWrites[lwB].id, 'b3');
  assert.deepStrictEqual(legWrites[lwB].legs.map((l) => l.result), ['hit', null], '完场腿就地判 hit, 未完场腿 null');
  assert.deepStrictEqual(
    legWrites[lwB].snapshot,
    { status: 'pending', actual_payout: 0, profit: 0, settled_at: null },
    '快照 4 原值随腿上送(SQL 无条件赋值, 少传即写 NULL)'
  );
  assert.strictEqual(ctx.data.bets[0].capText, '待结算', '无 miss 不得提前判死');
  assert.deepStrictEqual(ctx.data.bets[0].legRows.map((l) => l.mark), ['✓', '待']);
  assert.strictEqual(ctx.data.bets[0].legRows[0].finalScore, '1-3', '腿级比分应就地展示');

  // ⑥c 已判死票继续补腿: 只写腿, 永不改 status/payout/profit/settled_at
  const SETTLED_AT = '2026-09-15T00:00:00.000Z';
  const betDead2 = {
    id: 'b4', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'miss', actual_payout: 0, profit: -2, settled_at: SETTLED_AT,
    legs: [
      { match: '008 美因茨 vs 法兰克福', home: '美因茨', away: '法兰克福', pick: '3', odds: '1.84', league: '德甲', finalScore: '1-3', result: 'miss' },
      { match: '009 多特蒙德 vs 帕德博恩', home: '多特蒙德', away: '帕德博恩', pick: '3', odds: '1.22', league: '德甲' },
    ],
  };
  api.fetchBets = async () => [betDead2];
  api.fetchPayloadByDate = async () => ({
    matches: [{ id: '周六008', finalScore: '1-3' }, { id: '周六009', finalScore: '2-1' }],
  });
  const beforeC = patched.length;
  const lwC = legWrites.length;
  await ctx.load();
  assert.strictEqual(patched.length, beforeC, '已判死票不得再整票写库(不刷新 settled_at)');
  assert.strictEqual(legWrites.length, lwC + 1, '已判死票应腿级补写剩余腿');
  assert.deepStrictEqual(legWrites[lwC].legs.map((l) => l.result), ['miss', 'hit'], '剩余腿继续补判');
  assert.deepStrictEqual(
    legWrites[lwC].snapshot,
    { status: 'miss', actual_payout: 0, profit: -2, settled_at: SETTLED_AT },
    '已结算票快照必须原样保留 status/payout/profit/settled_at'
  );
  assert.strictEqual(ctx.data.bets[0].capText, '未中');
  assert.deepStrictEqual(ctx.data.bets[0].legRows.map((l) => l.mark), ['✗', '✓'], '补完的腿应显示✓');
  assert.strictEqual(ctx.data.bets[0].profitText, '-2.00', '判死盈亏不得被腿级更新翻掉');

  // ⑥d 库中已是补完腿的状态 → 无未完场腿, 一个写请求都不发
  const lwD = legWrites.length;
  const beforeD = patched.length;
  await ctx.load();
  assert.strictEqual(legWrites.length, lwD, '无变化轮次不得腿级写库');
  assert.strictEqual(patched.length, beforeD, '无变化轮次不得整票写库');

  // ---- ⑧ settle.js 判定修复(竞彩让球 jcHhad + 复式腿按命中项取 SP) ----
  // ⑧a 单选 jcHhad: 修前落到"方向"分支, judgeDirection 与中文赛果严格全等恒为 0 → **恒判 miss**
  assert.strictEqual(
    settle.settleLeg({ kind: 'jcHhad', pick: '让-1 3', odds: '2.88' }, '3-0'), 'hit',
    'jcHhad 单选: 让-1 后 2>0 为主胜, pick 3 → hit'
  );
  assert.strictEqual(
    settle.settleLeg({ kind: 'jcHhad', pick: '让-1 3', odds: '2.88' }, '1-0'), 'miss',
    'jcHhad 必须真让球: 1-0 让-1 后为平, pick 3 → miss(证明不是按原始方向判)'
  );
  assert.strictEqual(
    settle.settleLeg({ kind: 'jcHhad', pick: '让+1 0', odds: '2.10' }, '0-2'), 'hit',
    'jcHhad 受让: 0-2 让+1 后 1<2 为客胜, pick 0 → hit'
  );

  // ⑧b 复式 jcHhad 命中第 2 码 → SP 取第 2 段
  const rH2 = settle.settleBet(
    { legs: [{ kind: 'jcHhad', pick: '让-1 0/3', odds: '5.20/2.88', finalScore: '3-0' }], unit: 2, amount: 2 },
    () => null
  );
  assert.strictEqual(rH2.status, 'hit', 'jcHhad 复式: 让-1 3-0 赛果 3, pick 0/3 中 3 → hit');
  assert.strictEqual(rH2.actual_payout, 5.76, 'jcHhad 复式取第 2 段 SP 2.88×2=5.76 (旧代码按首段 5.20 算=10.40)');

  // ⑧c 复式竞彩胜平负命中第 2 码 → SP 取第 2 段
  const rJ = settle.settleBet(
    { legs: [{ kind: 'jcHad', pick: '3/1', odds: '1.50/3.45', finalScore: '2-2' }], unit: 2, amount: 2 },
    () => null
  );
  assert.strictEqual(rJ.status, 'hit', '复式竞彩: 打平, pick 3/1 中 1 → hit');
  assert.strictEqual(rJ.actual_payout, 6.9, '复式取第 2 段 SP 3.45×2=6.90 (旧代码按首段 1.50 算=3.00)');

  // ⑧d odds 段数 < pick 段数 → 回退首段, **绝不能返回 0**
  //    返回 0 会让 acc=0 → 仍判 'hit' 但 actual_payout=0、profit=-amount, 界面看不出坏
  const rShort = settle.settleBet(
    { legs: [{ kind: 'jcHad', pick: '3/1', odds: '1.50', finalScore: '2-2' }], unit: 2, amount: 2 },
    () => null
  );
  assert.strictEqual(rShort.actual_payout, 3, 'odds 段数不足必须回退首段 1.50×2=3.00, 不得算成 0');

  // ⑧e 亚盘 pick 不归 hitPickIndex 管(它只在竞彩分支被调用)
  assert.strictEqual(settle.hitPickIndex({ pick: '富勒姆+1.25' }, '0-0'), -1, '亚盘 pick 不得被误判为 310 命中');
  assert.strictEqual(settle.hitPickIndex({ pick: '让-1 3/1' }, '3-0'), 0, 'jcHhad: 让-1 3-0 赛果 3 → 命中首段');

  // ---- ⑨ cart.optionsOf / applyPicks(纯函数, 零网络) ----
  const cart = require('../miniprogram/utils/cart.js');
  const jcLeg = {
    kind: 'jcHad', id: '周一001', home: '甲队', away: '乙队', league: '德甲',
    pick: '3', odds: '2.10', desc: '周一001 甲队vs乙队 胜平负 主胜@2.10',
  };
  const o1 = cart.optionsOf(jcLeg, null);
  assert.deepStrictEqual(o1.map((o) => o.code), ['3', '1', '0'], '选项固定按 3/1/0 排序(与 sp/sp3 下标对齐)');
  assert.deepStrictEqual(o1.map((o) => o.on), [true, false, false], '当前选项标记 on');
  assert.strictEqual(o1[0].odds, '2.10', '已选项赔率取自腿内 pick↔odds 平行分段(纯删选项零网络)');
  assert.strictEqual(o1[1].odds, '', '未选项且无 match → 赔率空');
  assert.strictEqual(o1[1].disabled, true, '无赔率选项必须置灰(写错赔率 = 结算奖金算错)');
  assert.strictEqual(o1[1].label, '平', '中文标签');

  const o2 = cart.optionsOf(jcLeg, { sp: ['2.10', '3.40', '4.20'] });
  assert.deepStrictEqual(o2.map((o) => o.odds), ['2.10', '3.40', '4.20'], '本地缺的码回退当日推荐 match.sp');
  assert.strictEqual(o2[1].disabled, false, '有赔率即可选');

  const hLeg = { kind: 'jcHhad', id: '周一002', home: '丙队', away: '丁队', pick: '让-1 3', odds: '2.88' };
  assert.deepStrictEqual(
    cart.optionsOf(hLeg, { sp: ['9.99', '8.88', '7.77'], hhad: ['2.88', '3.60', '5.20'] }).map((o) => o.odds),
    ['2.88', '3.60', '5.20'],
    'jcHhad 认 match.hhad 而非 match.sp(盘口前缀从 pick 提取, 不依赖 match)'
  );

  const bdLeg = {
    kind: 'bd', match: '009 甲队 vs 乙队', home: '甲队', away: '乙队', league: '德甲',
    pick: '3', odds: '1.84', handicap: '-2', sp3: ['1.22', '6.83', '10.65'],
    bdNum: '009', finalScore: '3-0', result: 'hit',
  };
  const oB = cart.optionsOf(bdLeg, null);
  assert.deepStrictEqual(oB.map((o) => o.odds), ['1.22', '6.83', '10.65'], 'bd 三档 SP 全取腿自带 sp3(零网络)');

  const n1 = cart.applyPicks(jcLeg, ['1', '3'], { '3': '2.10', '1': '3.40' });
  assert.strictEqual(n1.pick, '3/1', 'codes 按 3/1/0 固定序输出(与赔率分段严格同序)');
  assert.strictEqual(n1.odds, '2.10/3.40', '复式赔率同序并排串');
  assert.strictEqual(n1.desc, '周一001 甲队vs乙队 胜平负 主胜/平@2.10', 'desc 同步重建');
  assert.strictEqual(n1.kind, 'jcHad', 'kind 保留');
  assert.strictEqual(n1.league, '德甲', '其余字段原样保留(结算取分靠 league)');
  assert.strictEqual(cart.calc([n1]).stakes, 2, '注数 1→2');

  const n2 = cart.applyPicks(hLeg, ['0', '3'], { '0': '5.20', '3': '2.88' });
  assert.strictEqual(n2.pick, '让-1 3/0', 'jcHhad 盘口前缀保留, 只换 310 码');
  assert.strictEqual(n2.odds, '2.88/5.20', 'jcHhad 复式赔率同序');

  const n3 = cart.applyPicks(bdLeg, ['1', '0'], { '1': '6.83', '0': '10.65' });
  assert.strictEqual(n3.pick, '1/0', 'bd pick 是纯 310 码');
  assert.strictEqual(n3.handicap, '-2', 'bd 让球数在独立字段, 不因改选项丢失');
  assert.strictEqual(n3.finalScore, '3-0', '★finalScore 必须保留(jc 腿唯一取分通道, 清了旧票永远判不了)');
  assert.strictEqual(n3.result, undefined, '已判结果作废重来');
  assert.strictEqual(bdLeg.result, 'hit', 'applyPicks 不得就地改原腿');
  const n4 = cart.applyPicks(Object.assign({}, bdLeg, { result: 'push' }), ['3'], { '3': '1.22' });
  assert.strictEqual(n4.result, 'push', '★push 保留(站点"该场未开售不计断"语义, 清掉会把走水腿变真实判定)');

  const n5 = cart.applyPicks({ kind: 'jcHad', pick: '3/让平', odds: '2.10/9.99' }, ['3', '让平'], { '3': '2.10' });
  assert.strictEqual(n5.pick, '3', '非 3/1/0 的脏码必须丢弃(pickIndex 对脏码静默按"负"取 SP)');

  // ---- ⑩ 页面: 编辑腿选项 / 删除整条 ----
  const betEdit = {
    id: 'e1', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2, expect_payout: 4.2,
    status: 'hit', actual_payout: 4.2, profit: 2.2, settled_at: SETTLED_AT,
    legs: [
      { kind: 'jcHad', id: '周一001', home: '甲队', away: '乙队', league: '德甲', pick: '3', odds: '2.10', finalScore: '2-1', result: 'hit' },
      { kind: 'ah', id: '周一002', home: '丙队', away: '丁队', league: '英超', pick: '丙队-0.5', odds: '1.95', finalScore: '1-0', result: 'hit' },
    ],
  };
  api.fetchBets = async () => [betEdit];
  api.fetchPayloadByDate = async () => ({
    matches: [{ id: '周一001', sp: ['2.10', '3.40', '4.20'], hhad: ['2.00', '3.50', '4.00'] }],
  });
  await ctx.load();
  assert.deepStrictEqual(ctx.data.bets[0].legRows.map((l) => l.canEdit), [true, false],
    'canEdit: 竞彩胜平负腿可编 / 亚盘腿不可编(不是 310 选项)');

  ctx.openEdit({ currentTarget: { dataset: { id: 'e1', li: 0 } } });
  await flush(3); // 未选项缺赔率 → 回拉当日推荐后才开层
  assert.strictEqual(ctx.data.editOpen, true, '✎ 应打开编辑抽屉');
  assert.strictEqual(ctx.data.editTitle, '甲队 vs 乙队', '抽屉标题=场次');
  assert.deepStrictEqual(ctx.data.editOpts.map((o) => o.odds), ['2.10', '3.40', '4.20'], '本地缺的码由当日推荐补齐');
  assert.strictEqual(ctx.data.editOpts[0].odds, '2.10', '已选项赔率仍取腿自带(结算读的就是它)');
  assert.strictEqual(ctx.data.editOpts[1].disabled, false);

  ctx.closeEdit();
  ctx.openEdit({ currentTarget: { dataset: { id: 'e1', li: 1 } } });
  await flush(3);
  assert.strictEqual(ctx.data.editOpen, false, '亚盘腿: openEdit 不得开层(handler 内再挡一道)');

  ctx.openEdit({ currentTarget: { dataset: { id: 'e1', li: 0 } } });
  await flush(3);
  ctx.toggleOpt({ currentTarget: { dataset: { code: '1' } } });
  assert.strictEqual(ctx.data.editOpts[1].on, true, '勾选第 2 个选项');
  assert(/注数 2/.test(ctx.data.editPreview), '预览应实时显示注数 2: ' + ctx.data.editPreview);
  assert(/原 1注/.test(ctx.data.editPreview), '预览应显示原注数: ' + ctx.data.editPreview);

  const eN = edits.length;
  await ctx.saveEdit();
  await flush();
  assert.strictEqual(edits.length, eN + 1, '保存应调 editBet(走独立的 mini_edit_bet)');
  assert.strictEqual(edits[eN].id, 'e1');
  assert.strictEqual(edits[eN].patch.stakes, 2, '注数随复式重算 1→2');
  assert.strictEqual(edits[eN].patch.amount, 4, '投入=注数×unit=2×2');
  assert.strictEqual(edits[eN].patch.expect_payout, 8.19, '理论奖金=2.10×1.95×2(照抄既有口径)');
  assert.strictEqual(edits[eN].patch.legs[0].pick, '3/1', '腿 pick 已改');
  assert.strictEqual(edits[eN].patch.legs[0].odds, '2.10/3.40', '腿赔率同序');
  assert.strictEqual(edits[eN].patch.legs[0].finalScore, '2-1', '★finalScore 随编辑保留');
  assert.strictEqual(edits[eN].patch.legs[0].result, undefined, '已判结果清空 → 整票回到待结算重判');
  assert.strictEqual(edits[eN].patch.legs[1].pick, '丙队-0.5', '只动被编辑的那条腿');
  assert.strictEqual(ctx.data.editOpen, false, '保存成功后关层');
  assert.strictEqual(ctx.data.editSaving, false, '保存后复位(否则保存按钮永久禁用)');

  // 保存中不得关层(否则结果无处落地)
  ctx.openEdit({ currentTarget: { dataset: { id: 'e1', li: 0 } } });
  await flush(3);
  ctx.data.editSaving = true;
  ctx.closeEdit();
  assert.strictEqual(ctx.data.editOpen, true, '保存中不得关层');
  ctx.data.editSaving = false;
  ctx.closeEdit();
  assert.strictEqual(ctx.data.editOpen, false, '非保存中可关层');
  assert.deepStrictEqual(ctx.data.editOpts, [], '关层清空选项(防下次开层闪旧数据)');

  // 赔率取不到 → 拒绝开层(省钱比"看起来不对"重要: 赔率空会让结算奖金变 0 且界面看不出坏)
  const betNoSp = {
    id: 'e2', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0, settled_at: null,
    legs: [{ kind: 'jcHad', id: '周一009', home: '戊队', away: '己队', league: '德甲', pick: '3', odds: '' }],
  };
  api.fetchBets = async () => [betNoSp];
  api.fetchPayloadByDate = async () => ({ matches: [] });
  await ctx.load();
  ctx.openEdit({ currentTarget: { dataset: { id: 'e2', li: 0 } } });
  await flush(3);
  assert.strictEqual(ctx.data.editOpen, false, '当前已选项都取不到赔率时必须拒绝开层');

  // 保存失败 → 复位 editSaving 但不关层(让用户重试)
  const realEdit = api.editBet;
  api.editBet = async () => { throw new Error('boom'); };
  api.fetchBets = async () => [betEdit];
  api.fetchPayloadByDate = async () => ({
    matches: [{ id: '周一001', sp: ['2.10', '3.40', '4.20'] }],
  });
  await ctx.load();
  ctx.openEdit({ currentTarget: { dataset: { id: 'e1', li: 0 } } });
  await flush(3);
  assert.strictEqual(ctx.data.editOpen, true, '回拉成功应开层');
  await ctx.saveEdit();
  await flush();
  assert.strictEqual(ctx.data.editSaving, false, '保存失败也必须复位 editSaving');
  assert.strictEqual(ctx.data.editOpen, true, '保存失败不关层, 让用户重试');
  ctx.closeEdit();
  api.editBet = realEdit;

  // ---- 删除: 先弹确认, 确认后才真删, 且本地 _bets/bets/stats 一起同步 ----
  api.fetchBets = async () => [betEdit];
  await ctx.load();
  const dN = deletes.length;
  const mLen = modalLog.length;
  global.wx.showModal = (o) => { modalLog.push(o); o.success({ confirm: false }); }; // 取消
  ctx.removeBet({ currentTarget: { dataset: { id: 'e1' } } });
  await flush();
  assert.strictEqual(modalLog.length, mLen + 1, '删除必须先弹确认');
  assert(/不可恢复/.test(modalLog[mLen].content), '弹窗须写明不可恢复: ' + modalLog[mLen].content);
  assert.strictEqual(deletes.length, dN, '取消不得删除');
  assert.strictEqual(ctx.data.bets.length, 1, '取消后列表不动');

  global.wx.showModal = (o) => { modalLog.push(o); o.success({ confirm: true }); }; // 确认
  ctx.removeBet({ currentTarget: { dataset: { id: 'e1' } } });
  await flush();
  assert.strictEqual(deletes.length, dN + 1, '确认后才真删');
  assert.strictEqual(deletes[dN], 'e1');
  assert.strictEqual(ctx.data.bets.length, 0, '删后列表同步移除');
  assert.strictEqual((ctx._bets || []).length, 0, '★_bets 也要同步, 否则 pollTick 还会为已删票发请求');
  assert.strictEqual(ctx.data.stats.count, 0, '统计卡同步');
  global.wx.showModal = (o) => { modalLog.push(o); };

  // ---- ⑪ 并发闸门: 在飞的旧结算不得用旧 legs 覆盖编辑结果 ----
  // 复现路径: 轮询拿到旧 legs → 链子卡在取分 → 用户编辑保存(load 重拉, _seq+1) → 旧链子跑完。
  // mini_update_bet 是无条件赋值、无 WHERE 保护, 旧链子一写就把编辑结果抹掉, 5 分钟后界面又跳回旧腿。
  let serverLegs = [{
    kind: 'bd', match: '009 甲队 vs 乙队', home: '甲队', away: '乙队', league: '德甲',
    pick: '3', odds: '1.84', handicap: '0', sp3: ['1.84', '3.97', '3.79'], bdNum: '009',
  }];
  const betRace = {
    id: 'r1', bet_date: DAY, source: 'bd', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0, settled_at: null, legs: serverLegs,
  };
  let release = null;
  const gate = new Promise((res) => { release = res; });
  api.fetchBets = async () => [Object.assign({}, betRace, { legs: serverLegs })]; // 模拟服务端真值
  api.fetchPayloadByDate = async () => {
    await gate; // 卡住取分, 制造"链子在飞"的窗口
    return { matches: [{ id: '周六009', finalScore: '2-1' }] };
  };
  api.editBet = async (id, patch) => { edits.push({ id, patch }); serverLegs = patch.legs; return { id }; };

  const pN = patched.length;
  const lwN = legWrites.length;
  const raceLoad = ctx.load();          // 在飞: 卡在 fetchPayloadByDate
  await flush(3);
  assert.strictEqual(ctx._bets.length, 1, '在飞轮次应已拿到列表');

  ctx.openEdit({ currentTarget: { dataset: { id: 'r1', li: 0 } } }); // bd 腿 sp3 齐 → 同步开层
  assert.strictEqual(ctx.data.editOpen, true, 'bd 腿三档 SP 齐, 无需网络即可开层');
  ctx.toggleOpt({ currentTarget: { dataset: { code: '1' } } });
  await ctx.saveEdit();                  // 保存 → load(true) 重拉 → _seq+1
  await flush(3);
  assert.strictEqual(patched.length, pN, '保存后重判还没跑, 旧轮次仍被卡着 → 尚无回写');

  release();                             // 放行: 旧链子恢复运行(它带着编辑前的 legs)
  await raceLoad;                        // 旧轮次收尾(内含 _autoQueued 补跑)
  await flush(8);
  assert.strictEqual(ctx._autoBusy, false, '补跑应已收尾');

  const r1Writes = patched.filter((p) => p.id === 'r1').map((p) => p.patch.legs)
    .concat(legWrites.filter((w) => w.id === 'r1').map((w) => w.legs));
  assert(r1Writes.length >= 1, '编辑后的重判轮次应正常回写(补跑机制生效)');
  r1Writes.forEach(function (ls) {
    assert.strictEqual(ls[0].pick, '3/1',
      '★在飞的旧结算不得用旧 legs 覆盖编辑结果(实际写回: ' + ls[0].pick + ')');
  });

  // 收尾: 让后续轮询段落从干净状态开始
  api.fetchBets = async () => [];
  api.fetchPayloadByDate = async () => null;
  await ctx.load();
  await flush(8);
  assert.strictEqual(ctx._autoBusy, false, '收尾后不得遗留在飞轮次');

  // ---- ⑦ 自动轮询 ----
  const timers = [];
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  global.setInterval = (fn, ms) => { const t = { fn, ms }; timers.push(t); return t; };
  global.clearInterval = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };

  let fetchCount = 0;
  api.fetchBets = async () => { fetchCount++; return []; };
  api.fetchPayloadByDate = async () => null;

  // 无 wx.request(node 冒烟) → 不得起表(onShow 仍会拉一次列表, 那是既有行为)
  ctx.onShow();
  assert.strictEqual(timers.length, 0, 'node 无 wx.request 不得起轮询表');
  await ctx.load(); // 让 onShow 逃逸的异步落地后再清计数
  fetchCount = 0;

  // 打开 wx.request → onShow 起表, 重复进入不叠加
  global.wx.request = function () {};
  ctx.onShow();
  assert.strictEqual(timers.length, 1, 'onShow 应起一张轮询表');
  assert.strictEqual(timers[0].ms, 300000, '轮询间隔应为 5 分钟');
  ctx.onShow();
  assert.strictEqual(timers.length, 1, '重复 onShow 不得叠加定时器');
  ctx.onHide();
  assert.strictEqual(timers.length, 0, 'onHide 应停表');
  ctx.onShow();
  assert.strictEqual(timers.length, 1);
  ctx.onUnload();
  assert.strictEqual(timers.length, 0, 'onUnload 应停表');

  await ctx.load();
  fetchCount = 0;

  // 无未完场腿 → tick 零请求
  ctx._bets = [{ id: 'x', status: 'miss', legs: [{ match: '008 a vs b', pick: '3', result: 'miss', finalScore: '1-3' }] }];
  await ctx.pollTick();
  assert.strictEqual(fetchCount, 0, '无未完场腿时 tick 零请求');

  // 有未完场腿 → 真请求且静默(不置 loading/不闪横幅)
  const pendingPoll = {
    id: 'p1', bet_date: DAY, source: 'jc', stakes: 1, unit: 2, amount: 2,
    status: 'pending', actual_payout: 0, profit: 0,
    legs: [{ match: '009 c vs d', home: '多特蒙德', away: '帕德博恩', pick: '3', odds: '1.22', league: '德甲' }],
  };
  api.fetchBets = async () => { fetchCount++; return [pendingPoll]; };
  ctx._bets = [pendingPoll];
  const setDataCalls = [];
  const realSetData = ctx.setData;
  ctx.setData = function (p) { setDataCalls.push(p); realSetData.call(this, p); };
  fetchCount = 0;
  ctx.data.loading = false;
  ctx.data.errMsg = '';
  await ctx.pollTick();
  assert.strictEqual(fetchCount, 1, '有未完场腿时应真发请求');
  assert.strictEqual(ctx.data.loading, false, '静默轮结束 loading 仍为 false');
  assert(!setDataCalls.some((p) => p.loading === true), '静默轮不得中途置 loading:true');

  // 静默轮失败 → 不改横幅
  api.fetchBets = async () => { throw new Error('boom'); };
  ctx.data.errMsg = '';
  await ctx.load(true);
  assert.strictEqual(ctx.data.errMsg, '', '静默轮失败不得闪横幅');
  ctx.setData = realSetData;

  global.setInterval = realSetInterval;
  global.clearInterval = realClearInterval;

  // ---- ⑫ 竞彩腿的取分键(2026-09-15 修): legKey 只认 match, 而 cart.buildLeg 的 jcHad/jcHhad
  //   腿**没有 match 字段**(只有 id) → 旧实现恒返回 '' →
  //   ①投注页同轮 scoreCache 槽位 bet_date|legKey 被所有竞彩腿共用, 先取到分的那条腿的比分
  //     被复制给其余竞彩腿(9-15 实判: 003 科莫 2-1 串给 004 都灵vs罗马, 真值 0-2, 客胜红写成黑,
  //     两张中奖票 3.11/4.67 元被误记为失);
  //   ②payloadScore 的 String(id).slice(-3)===key 对空 key 永不成立 → 竞彩腿 finalScore 回退失效。
  //   本段守住: 键必须非空、腿间互不相同、北单 match 取号不变、两腿各取各的比分结算。 ----
  const jcA = { kind: 'jcHad', id: '周一003', home: '科莫', away: '帕尔马', league: '意甲', pick: '3', odds: '1.12' };
  const jcB = { kind: 'jcHad', id: '周一004', home: '都灵', away: '罗马', league: '意甲', pick: '0', odds: '1.39' };
  assert.strictEqual(settle.legKey(jcA), '003', '竞彩腿(无 match)应兜底 leg.id 取三位场次号');
  assert.strictEqual(settle.legKey(jcB), '004', '不同竞彩腿必须是不同的键, 否则比分串味');
  assert.strictEqual(settle.legKey({ match: '011 比利亚雷 vs 贝蒂斯' }), '011', '北单腿 match 取号口径不变');
  const rJc = settle.settleBet(
    { stakes: 1, unit: 2, amount: 2, legs: [jcA, jcB] },
    (k) => ({ '003': '2-1', '004': '0-2' })[k] || null
  );
  assert(rJc && rJc.status === 'hit', 'jc 票应按各自场次号取分判红(003 主胜✓/004 客胜✓)');
  assert.strictEqual(rJc.actual_payout, 3.11, 'jc 票奖金=1.12×1.39×2=3.11');
  assert.deepStrictEqual(rJc.legs.map((l) => l.finalScore), ['2-1', '0-2'], '两腿必须各取各的比分');

  console.log('SMOKE_OK');
})().catch((e) => { console.error(e); process.exit(1); });
