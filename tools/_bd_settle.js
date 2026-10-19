/* 北单310 复式结算工具(复盘通用): 按 legs 的临场参考 SP(sp3 三列) 估算
   成本 / 实际中奖 / 理论全中奖金 / 净盈亏, 并打印每腿命中 SP 明细。
   规则: 单注 2 元; 单注奖金=2×命中SP连乘(北单 SP 为彩池净赔率, 已含 65% 返奖率——
         实证: sp3 三列倒数和≈1.07, 若再乘 0.65 隐含概率和=1.65 荒谬; 不再乘 65%);
         复式注数=各腿选项数乘积; N 关串必须全红才有奖(断 1 腿=0); push(无效腿)不计入。
   用法: node tools/_bd_settle.js [日期=2026-09-11]
   注意: sp3 为 500.com 临场参考 SP, 北单为浮动 SP, 实际以官方开奖 SP 为准, 金额为估算。 */
const path = require("path");
const days = require(path.join(__dirname, "..", "data", "predictions.js"));
const stats = require(path.join(__dirname, "..", "stats.js"));

const dateArg = process.argv[2] || "2026-09-11";
const day = days.find(x => x.date === dateArg);
if (!day || !day.beidan310) { console.log("无 " + dateArg + " 北单数据"); process.exit(1); }

const UNIT = 2; // 北单SP已含65%返奖率, 奖金=2×SP连乘, 不再乘REBATE
const legs = day.beidan310.legs || [];
let stakes = 1, hitSpProd = 1, fullSpProd = 1, reds = 0, blacks = 0, pushes = 0, unknown = 0;
const lines = [];

for (const l of legs) {
  const tag = (l.bdNum ? "北单" + l.bdNum : l.match) + " " + l.pick + "(让" + (l.handicap || 0) + ")";
  if (l.result === "push") { pushes++; lines.push("  " + tag + " → 无效(push,不计入)"); continue; }
  // 找赛果: 竞彩场=当日 match.finalScore; 期次场=leg.finalScore
  const num = String(l.match || "").slice(0, 3);
  const mm = (day.matches || []).find(x => x.id && String(x.id).slice(-3) === num);
  const fs = mm ? mm.finalScore : (l.finalScore || null);
  const s0 = stats.parseScore(fs);
  if (!s0) { unknown++; lines.push("  " + tag + " → 赛果未知, 跳过"); continue; }
  const hc = parseInt(l.handicap, 10) || 0;
  const adjH = s0.home + hc;
  const oc = adjH > s0.away ? "3" : adjH < s0.away ? "0" : "1"; // 让球后官方赛果
  const ocTxt = oc === "3" ? "主胜" : oc === "1" ? "平" : "客胜";
  const idx = oc === "3" ? 0 : oc === "1" ? 1 : 2;
  const sp = Array.isArray(l.sp3) ? parseFloat(l.sp3[idx]) : NaN;
  const opts = String(l.pick || "").split("/").map(s => s.trim());
  stakes *= opts.length;
  const hit = opts.includes(oc);
  if (isNaN(sp)) { lines.push("  " + tag + " → 赛果" + ocTxt + " 缺SP, 金额不精确"); }
  if (!isNaN(sp)) fullSpProd *= sp;
  if (hit) { reds++; if (!isNaN(sp)) hitSpProd *= sp; lines.push("  " + tag + " → ✓赛果" + ocTxt + " @" + l.sp3[idx]); }
  else { blacks++; lines.push("  " + tag + " → ✗赛果" + ocTxt + "(不在" + l.pick + ") @" + (l.sp3 ? l.sp3[idx] : "?")); }
}

const cost = stakes * UNIT;
// 复式全红时: 每注组合都中奖, 总奖金 = 2 × Π(各腿选中项 SP 之和); 有黑腿则串关断缆=0
let comboS = 1;
for (const l of legs) {
  if (l.result === "push") continue;
  const opts = String(l.pick || "").split("/").map(s => s.trim());
  let s = 0;
  for (const o of opts) {
    const oi = o === "3" ? 0 : o === "1" ? 1 : 2;
    if (Array.isArray(l.sp3) && !isNaN(parseFloat(l.sp3[oi]))) s += parseFloat(l.sp3[oi]);
  }
  comboS *= s;
}
const payout = (blacks === 0 && unknown === 0) ? UNIT * comboS : 0;
const fullPayout = UNIT * fullSpProd;

console.log("【北单310 " + dateArg + " 结算】(临场参考SP估算, 以官方开奖为准)");
lines.forEach(s => console.log(s));
console.log("  注数=" + stakes + " 成本=" + cost + "元 | " + reds + "红" + blacks + "黑" + (pushes ? pushes + "无效 " : "") + (unknown ? unknown + "未知" : ""));
console.log("  实际中奖=" + payout.toFixed(2) + "元 | 净盈亏=" + (payout - cost).toFixed(2) + "元");
console.log("  理论全中=" + fullPayout.toFixed(2) + "元(≈" + (fullPayout / cost).toFixed(1) + "倍成本)");
