/* tools/_patch1115_invest.js — 投资策略「昨日盈亏说明」数据回填(幂等, 2026-11-15)
   给 11-14/11-13 的 bank 补 detail(回收构成), 供 renderInvest 昨日盈亏说明展示。
   足彩 26163 期 80 元账挂 11-13(已在 stake/net 内, 已灭 回收 0)。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };

const d14 = days.find(x => x.date === '2026-11-14');
setIf(d14.bank, 'detail', '胆 10 元中 12.5 + 早场北单 3 关全红名义回 13.11(浮动 SP 口径); 大小 2 串/夜场 3 关/深夜 6 关/亚盘 3 腿全灭。');
const d13 = days.find(x => x.date === '2026-11-13');
setIf(d13.bank, 'detail', '早场北单 2 关全红名义回 23.97; 混选/大小/深夜/夜场/盘路 8 拖全灭; 足彩 26163 期 80 元(32 注 64+任九 16)已灭 回收 0, 损失已含在当日净盈亏内。');

fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ touched=' + touched);
