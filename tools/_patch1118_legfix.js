/* tools/_patch1118_legfix.js — 11-17 池腿级星级同步 + day.updates 盘中调整记录(幂等, 2026-11-18)
   ① beidan310 腿 010 丹麦 conf 3→1: 11-17 午后锚腿重审已把丹麦从单选级降级(双方生死战),
      但当时只改了 match/asianPool, 腿池 conf/note 漏同步 = 页面仍挂 ★3「全池最干净」(用户抓获)。
   ② day.updates[] 盘中调整时间线(新机制): 今后一切盘中撤腿/降仓/降级必须在此登记, 页面日卡醒目渲染。
   注: 星级修正的是赛前已发生的降级决策(非赛后马后炮), 决策时点见 11-17 午后 patch 记录。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-17');
if (!d) throw new Error('无 2026-11-17');
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };

/* ① 腿 010 丹麦: ★3→★1, 依据改写(降级系赛前午后决策, 非赛后修改) */
const leg = d.beidan310.legs.find(l => l.bdNum === '010');
setIf(leg, 'conf', 1);
setIf(leg, 'note', '丹麦让 0 主不败: 午后重审由 ★3 降级——挪威首回合赢过丹麦, 本场赢球即凭交锋反超进前二(淘汰赛)=双方生死战非单方背水, 低水升盘仍站主但战意不再单边。');

/* ② day.updates 盘中调整时间线 */
const updates = [
  { tag: '11-17 午后 锚腿重审', text: '★挪威非无欲(首回合赢丹麦, 本场赢球即反超进前二=双方生死战): 006 丹麦单选级撤→双选, 混选 40→20 元, 深夜北单撤丹麦腿换 011 威尔士防冷腿, 深夜亚盘丹麦U21→卢顿-1; 丹麦总敞口 92→40 元。巴林+0.5/瑞典+0.25 ★2→★1(低水无升盘时序佐证=静态定价非资金流)。' }
];
setIf(d, 'updates', updates);

if (process.env.DRY === '1') { console.log('DRY ok, touched', touched); process.exit(0); }
const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 腿级星级同步+updates 落地, touched=' + touched);
