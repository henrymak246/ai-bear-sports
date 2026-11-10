/* tools/_patch1110_moves.js — 11-10 盘路判读写入 note/plan(幂等)
   盘路由 _ah_moves --write 生成; 本补丁只把四场真实信号写进 note 并提示赛前复核。
   用法: node tools/_patch1110_moves.js */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const day = days.find(d => d.date === '2026-11-10');
if (!day) throw new Error('无 2026-11-10 数据');

const ADD = {
  '北单008': '盘路: 09:08→11:45 让球两球退球半且主水2.01→1.63=资金反向下盘, 与主胜方向有张力; 深热让球盘本就不投注, 方向保留但信心下调。',
  '北单010': '盘路: 一/球半升球半且主水1.83→1.97=诱上盘(盘口虚抬水位不配合), 主队大胜不可信, 防平正确。',
  '北单011': '盘路: 半/一稳定且主水1.98→1.90=资金站主队, 支持主不败。',
  '周二002': '盘路: 受半球稳定但主水1.98→1.88=资金站主队(布罗姆利受让), 与客胜方向反向; 客不败含平仍成立, 亚盘米尔顿-0.5 信心下调, 赛前须复核。'
};
let n = 0;
day.matches.forEach(m => {
  const add = ADD[m.id];
  if (!add) return;
  if (String(m.note || '').includes('盘路:')) return; // 幂等
  m.note = (m.note || '') + ' ' + add;
  n++;
});

const pa = day.plan.find(p => p.name === '🌏 亚洲让球');
if (pa && !pa.text.includes('⚠️盘路')) pa.text += ' ⚠️盘路: 012 米尔顿-0.5 资金站主队(反向), 赛前21:00后复核水位, 反向则撤此腿只保留3关。';
const pj = day.plan.find(p => p.name === '🎯 胜平负');
if (pj && !pj.text.includes('盘路已入')) pj.text += ' 盘路已入: 008 资金反向下盘/010 诱上盘/011 资金站主队/012 资金站主队。';

console.log('追加盘路判读 ' + n + ' 场');
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写回');
