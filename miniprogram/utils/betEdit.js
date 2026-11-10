/* betEdit.js — 注单卡「修改模式」的纯逻辑(微信小程序 / Node 双环境, 手写; 零 wx 依赖 → 冒烟直测)
 *
 * 为什么单独一个文件: 删腿/倍数/金额三件事全是纯运算, 抽出来才能在 node 冒烟里逐条断言,
 *   页面( pages/bets/bets.js )只留 touch 事件与 setData 的搬运。
 *
 * ★金额口径(全项目唯一杠杆是 unit, 别改):
 *   settle.js 结算走 acc = unit × ∏legSpFactor —— 倍数只能折进 unit(unit = 单注 × 倍数)。
 *   只把倍数乘进 amount 会让中奖的票显示成巨亏(投入三倍、奖金一倍)。
 *   expect_payout 仍按 cart.calc 的「2 元单注」既有口径, 不随倍数放大(见 bets.js previewOf 的告警)。
 *
 * ★倍数可反推, 所以反复编辑不叠乘:
 *   baseUnitOf(unit) 把已存票的 unit 拆回 {单注, 倍数} —— unit 是 2 的正整数倍时认定"单注 2 元 × N 倍"
 *   (2 → 1 倍、6 → 3 倍、12 → 6 倍), 拆不出整数倍(自定义单注 5 元 / 脏值)就退回 {unit, 1 倍}。
 *   两种情形 baseUnit × mult 恒等于原 unit → 不改倍数直接保存是零金额变更。 */

const cart = require('./cart.js');

const MIN_MULT = 1;
const MAX_MULT = 99;   // 倍数上限: 再高没有实际意义, 且防手滑把 unit 打成天文数字
const DEF_UNIT = 2;    // 全项目默认单注金额(与 bets.unit 列默认值 / settle 的 parseFloat(bet.unit) || 2 同源)
const DEL_W = 140;     // 左滑露出的「删除」宽度(rpx), 与 bets.wxss 的 .leg-del 宽度必须一致

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* 已存票的 unit → {baseUnit 单注, mult 倍数} —— 见文件头"倍数可反推" */
function baseUnitOf(unit) {
  const u = round2(parseFloat(unit));
  if (!isFinite(u) || u <= 0) return { baseUnit: DEF_UNIT, mult: 1 }; // 脏值/缺省 → 回到项目默认
  const m = u / DEF_UNIT;
  const mi = Math.round(m);
  if (Math.abs(m - mi) < 1e-9 && mi >= MIN_MULT && mi <= MAX_MULT) return { baseUnit: DEF_UNIT, mult: mi };
  return { baseUnit: u, mult: 1 }; // 自定义单注(5/3/1.5 元…) → 原样当单注, 倍数从 1 起
}

/* 草稿腿 + 单注 + 倍数 → 整票金额口径。
   stakes/expectPayout 复用 cart.calc(口径不动, 别在这里再乘一次倍数)。 */
function moneyOf(legs, baseUnit, mult) {
  const c = cart.calc(legs);
  const bu = parseFloat(baseUnit);
  const unit = round2((isFinite(bu) && bu > 0 ? bu : DEF_UNIT) * (parseInt(mult, 10) || MIN_MULT));
  return { stakes: c.stakes, unit: unit, amount: round2(c.stakes * unit), expectPayout: c.expectPayout };
}

/* 删一条腿 → 新数组; 越界或只剩一关返回 null(调用方 toast 拒绝)。
   串关至少留一关: 删空等于作废, 那该走整单「🗑 删除」而不是静默存一张空票。 */
function delLeg(legs, li) {
  const ls = (legs || []).slice();
  if (!(li >= 0) || li >= ls.length) return null;
  if (ls.length <= 1) return null;
  ls.splice(li, 1);
  return ls;
}

/* 倍数步进(clamp 1~99) */
function stepMult(mult, d) {
  const v = (parseInt(mult, 10) || MIN_MULT) + (parseInt(d, 10) || 0);
  return Math.max(MIN_MULT, Math.min(MAX_MULT, v));
}

/* 「当日」累计 = 列表里**最新 bet_date** 那些单的投入合计。
   刻意不用"今天"的日历日: 预测日的场次多在当晚~次日凌晨开球, 跨零点时"今天"≠ bet_date,
   按日历日会显示 0 元(用户刚存完却看不到累计)。取最新 bet_date 任何时候都有意义。 */
function todaySum(bets) {
  const ls = (bets || []).filter(Boolean);
  let date = '';
  ls.forEach(function (b) {
    const d = String((b && b.bet_date) || '');
    if (d > date) date = d;
  });
  if (!date) return { date: '', amount: 0, count: 0 };
  let amount = 0;
  let count = 0;
  ls.forEach(function (b) {
    if (String((b && b.bet_date) || '') !== date) return;
    amount += parseFloat(b.amount) || 0;
    count += 1;
  });
  return { date: date, amount: round2(amount), count: count };
}

/* ---- 左滑手势(项目里无先例, 手写) ----
   方向锁: 竖向优先放给页面滚动(小程序 touchmove 里没有 preventDefault, 只能靠"不响应"让路),
   确认横向(|dx| > |dy|×1.2)才接管; 位移夹在 [-DEL_W, 0]; 松手过半吸附、否则弹回。 */
function lockDir(dx, dy) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ay > 8 && ay >= ax) return 'v';
  if (ax > 8 && ax > ay * 1.2) return 'h';
  return '';
}

function clampDx(dx) {
  return Math.max(-DEL_W, Math.min(0, dx));
}

function snapDx(dx) {
  return dx <= -DEL_W / 2 ? -DEL_W : 0;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    baseUnitOf, moneyOf, delLeg, stepMult, todaySum,
    lockDir, clampDx, snapDx,
    DEL_W, MIN_MULT, MAX_MULT, DEF_UNIT,
  };
}
