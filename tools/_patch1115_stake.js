/* tools/_patch1115_stake.js — 11-15 池仓位集中调整(幂等, 2026-11-15)
   用户拍板「去单关10元之类, 中了也回不了本」:
   ① 夜场亚盘 2 腿 10 元取消实投(腿保留在 asianPool 展示) ② 夜场北单 3 关 ×4 倍投 16→32 元。
   仅动未开赛票(夜场 21:00+/深夜 01:00+), 早场已开赛票不动。
   💰190→196。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-15');
if (!d) throw new Error('无 2026-11-15');
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };

/* ① 夜场亚盘取消实投 */
const na = d.slot8.night.asian;
setIf(na, 'legs', []);
setIf(na, 'cost', 0);
setIf(na, 'totalOdds', '0');
setIf(na, 'result', null);
setIf(d.slot8.night, 'review', '夜场(18:00-23:59)=荷乙+欧国联 C+西乙: 北单 3 关 8 注×4 元=32 元(092/088 跟资金); 亚盘 2 腿取消实投(10 元级小票新规, 腿并入腿池展示)。');

/* ② 夜场北单倍投 ×4 */
const nb = d.slot8.night.beidan;
setIf(nb, 'unit', 4);
setIf(nb, 'cost', 32);

/* ③ betPlan: 删夜场亚盘行, 夜场北单改 32 */
const rows = d.betPlan.rows;
const iA = rows.findIndex(r => r.name === '亚盘 2 腿');
if (iA >= 0) { rows.splice(iA, 1); touched++; }
const rNb = rows.find(r => r.name === '北单 3 关' && r.tier === '夜场');
if (rNb) { setIf(rNb, 'detail', '090 3/1 · 092 0/1 · 088 0/1（8 注×4 元）'); setIf(rNb, 'stake', 32); }
setIf(d.betPlan, 'total', 196);
setIf(d.bank, 'stake', 196);

/* ④ 文案同步 */
const pc = n => (d.plan || []).find(p => p.name === n);
const cardBd = pc('🀄 北单310');
if (cardBd) {
  setIf(cardBd, 'pct', '腿池11腿+三票96元');
  setIf(cardBd, 'text', '北单 26117 期腿池 11 腿按信心排名(083 鹿岛/098 比利时/100 西班牙 领衔); 实下三票: 早场 4 关 32 元 + 夜场 3 关 ×4 倍投 32 元 + 深夜 4 关 32 元, 全双选(忌日禁单锚)。');
}
const cardAh = pc('🌏 亚洲让球');
if (cardAh) {
  setIf(cardAh, 'pct', '腿池10腿+两票40元');
  setIf(cardAh, 'text', '亚盘腿池 10 腿按信心排名(全站资金侧): 鹿岛-0.5★3/西班牙-0.5★3/川崎+0.5★3 领衔。实下两票: 早场 3 腿 20(鹿岛/樱花/川崎)+深夜 3 腿 20(西班牙/圣马力诺/加的斯); 夜场 2 腿取消实投(10 元级小票新规)。');
}
const cardMoney = pc('💰 投注建议');
if (cardMoney) {
  setIf(cardMoney, 'pct', '方案196元');
  setIf(cardMoney, 'text', '💰196 元(日预算 300-500)=混选 4 关 40(约 10.0 倍: 鹿岛/西班牙/比利时主胜+维特斯客胜) + 大小 2 串 20 + 北单三票 96(早场 4 关 32/夜场 3 关 ×4 倍投 32/深夜 4 关 32) + 亚盘两票 40(早 20/深夜 20; 夜场 10 元小票取消实投)。0 胆 0 单选 5 弃选; 比分/梦想 5 关只展示。');
}
if (d.dailyPost) {
  setIf(d.dailyPost, 'content', String(d.dailyPost.content).replace(
    '**方案 190 元**: 混选 4 关 40(约 10 倍: 鹿岛/西班牙/比利时主胜+维特斯客胜) + 大小 2 串 20(塞浦路斯/拉脱维亚两场闷场小球, 双证收紧) + 北单三票 80 + 亚盘三票 50。',
    '**方案 196 元**: 混选 4 关 40(约 10 倍: 鹿岛/西班牙/比利时主胜+维特斯客胜) + 大小 2 串 20(塞浦路斯/拉脱维亚两场闷场小球, 双证收紧) + 北单三票 96(夜场 ×4 倍投 32) + 亚盘两票 40(夜场 10 元小票已按新规取消实投)。'));
}

fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ touched=' + touched, 'stake', d.bank.stake, '夜场北单 cost', d.slot8.night.beidan.cost, '夜场亚盘 legs', d.slot8.night.asian.legs.length);
