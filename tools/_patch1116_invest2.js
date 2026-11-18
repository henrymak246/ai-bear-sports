/* tools/_patch1116_invest2.js — 方案分配判定列+记录表简短总结 数据回填(幂等, 2026-11-16)
   ① 混选行补 result(页面结构映射覆盖不到混选, 行级 result 优先) ② 近 7 天 bank.summary 简短总结。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };
const day = dt => days.find(x => x.date === dt);

const ROW_RES = { '2026-11-15': { '混选 4 关': 'miss' }, '2026-11-13': { '混选 3 关': 'miss' } };
for (const dt of Object.keys(ROW_RES)) {
  const d = day(dt); if (!d || !d.betPlan) continue;
  for (const r of d.betPlan.rows) if (ROW_RES[dt][r.name]) setIf(r, 'result', ROW_RES[dt][r.name]);
}
const SUMMARY = {
  '2026-11-15': '早场北单全红救主',
  '2026-11-14': '胆红+早场北单红',
  '2026-11-13': '仅早场北单红, 足彩灭',
  '2026-11-12': '全灭',
  '2026-11-11': '全灭',
  '2026-11-10': '北单4关全红',
  '2026-11-08': '大小/比分/北单全红'
};
for (const dt of Object.keys(SUMMARY)) { const d = day(dt); if (d && d.bank) setIf(d.bank, 'summary', SUMMARY[dt]); }

fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ touched=' + touched);
