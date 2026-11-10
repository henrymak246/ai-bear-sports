/* tools/_patch1110_ah.js — 11-10 池 ahPick 与澳彩初盘对齐并补 asian7 水位(幂等)
   背景: _build1110 建日时盘口未到, ahPick 只写了方向队名; _cq_ah_patch 已回填澳彩初盘,
   本补丁按真实盘口改写 ahPick(命名队+让球数), 并把 asian7 四腿的水位补进 odds。
   用法: node tools/_patch1110_ah.js [--dry-run] */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const day = days.find(d => d.date === '2026-11-10');
if (!day) throw new Error('无 2026-11-10 数据');

// 按澳彩初盘(已写入 match.ah)确定的推荐方向: 名 = 推荐队, 让球数 = 该队盘口
const PICK = {
  '北单001': '巴尼特0',
  '北单002': '雷丁-0.5',
  '周二001': '伯顿-0.25',
  '北单004': '克鲁-0.25',
  '北单005': '莱斯特城-1.75',
  '北单006': '切斯特菲尔德+0.25',
  '北单007': '吉林汉姆+0.5',
  '北单008': '牛津联-1.5',
  '北单009': '普利茅斯-1.25',
  '北单010': '斯托克波特郡-1.5',
  '北单011': '布拉德福德城-0.75',
  '周二002': '米尔顿凯恩斯-0.5'
};

let changed = 0;
day.matches.forEach(m => {
  const want = PICK[m.id];
  if (!want) throw new Error('未定义 ahPick: ' + m.id);
  if (m.ahPick !== want) { m.ahPick = want; changed++; }
  if (!m.ah || m.ah.name === '待补') throw new Error('盘口未回填: ' + m.id);
});

// asian7 四腿按盘口补水位(主队用 ah.home, 客队用 ah.away)
const asianPick = { '北单001': '巴尼特0', '北单004': '克鲁-0.25', '北单006': '切斯特菲尔德+0.25', '周二002': '米尔顿凯恩斯-0.5' };
const asianTeam = { '北单001': '巴尼特', '北单004': '克鲁', '北单006': '切斯特菲尔德', '周二002': '布罗姆利' };
day.asian7.legs.forEach(leg => {
  const key = Object.keys(asianTeam).find(k => leg.match.includes(asianTeam[k]));
  if (!key) throw new Error('asian7 腿无法匹配: ' + leg.match);
  const m = day.matches.find(x => x.id === key);
  const wantOdds = (asianPick[key].indexOf(m.home) === 0) ? m.ah.home : m.ah.away;
  if (leg.pick !== asianPick[key]) { leg.pick = asianPick[key]; changed++; }
  if (leg.odds !== wantOdds) { leg.odds = wantOdds; changed++; }
});

// 一致性自检: ahPick 队名必须是本场主/客队, 让球数按该队视角(让=负/受=正)与 ah.goals 对齐
day.matches.forEach(m => {
  const digits = (m.ahPick.match(/([+-]?[\d.]+)$/) || [])[1];
  const team = m.ahPick.replace(/([+-]?[\d.]+)$/, '');
  if (team !== m.home && team !== m.away) throw new Error('ahPick 队名不在本场: ' + m.id + ' ' + m.ahPick);
  const g = Number(m.ah.goals); // 主队视角: 正=主让, 负=主受
  if (!isFinite(g)) throw new Error('盘口值非法: ' + m.id);
  const want = (team === m.home) ? -g : g;
  const got = Number(digits);
  if (Math.abs(want - got) > 1e-9) throw new Error('ahPick 让球数与盘口不符: ' + m.id + ' 盘口=' + m.ah.name + '(' + g + ') 期望=' + want + ' 实际=' + got);
});

console.log('ahPick 修正 ' + changed + ' 处, 一致性自检通过');
day.asian7.legs.forEach(l => console.log('  ' + l.match + ' → ' + l.pick + ' @' + l.odds));
if (process.argv.includes('--dry-run')) { console.log('DRY 不写盘'); process.exit(0); }
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写回 data/predictions.js');
