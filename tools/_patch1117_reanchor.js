/* tools/_patch1117_reanchor.js — 11-17 池锚腿重审调整(幂等, 2026-11-17 午后)
   动因: ①用户拍板「一场错就全部都错」→ 砍单队多票敞口; ②事实纠错: 挪威非无欲——首回合挪威主胜丹麦,
        A4 前二进淘汰赛, 挪威赢球即凭交锋双杀反超丹麦抢第二 = 双方生死战, 丹麦锚腿降级;
        ③降盘/低水无升盘时序佐证的 ★2 一律降 ★1(11-16 苏格兰 ★2 翻车教训)。
   调整: 006 丹麦 单选级→双选(conf 1); 混选丹麦×日本 40→20 元(丹麦敞口 92→40);
        深夜北单 4 关撤 010 丹麦腿→011 威尔士 3/1(葡萄牙赢不到 2 球防冷腿);
        深夜亚盘 3 腿撤丹麦U21+1.25→卢顿-1(升盘佐证);
        002 巴林+0.5/005 瑞典+0.25 ★2→★1; 💰156→136。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-17');
if (!d) throw new Error('无 2026-11-17');
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };

/* ① 006 丹麦: 单选级→双选(conf 1), 情报纠错 */
const m6 = d.matches.find(m => m.id === '周二006');
setIf(m6, 'dirTag', '双选');
setIf(m6, 'confidence', 1);
setIf(m6, 'synthesis', '主胜双选(降权)——A4 末轮双方生死战: 丹麦 9 分赢球+葡萄牙输才争头名(平即保第二), 挪威 6 分赢球即凭首回合交锋优势反超抢第二; 丹麦 11-14 客 4-1 屠葡萄牙(霍伊伦德双响)状态火热+三公司平手→平/半升盘+主低水(strong 主 2/3+升盘), 但竞彩 2.40/2.29 近平手=市场视作均势, 锚腿降级');
setIf(m6, 'note', '信息面: 丹麦主场帕肯球场, 霍伊伦德连场进球; ★纠错: 挪威非无欲——首回合挪威主胜丹麦, 本场赢球即反超进前二(淘汰赛), 哈兰德+厄德高首发。盘口: 平手 主1.82/客2.02, 伟德平手→平/半升盘; 三公司互证站主队(2/3, strong, 盘路升)。');

/* ② ★2→★1(无升盘时序佐证) */
const m2 = d.matches.find(m => m.id === '周二002');
setIf(m2, 'ahConf', 1);
const m5 = d.matches.find(m => m.id === '周二005');
setIf(m5, 'ahConf', 1);
for (const l of d.asianPool.legs) {
  if (/巴林/.test(l.pick)) { setIf(l, 'conf', 1); setIf(l, 'note', 'strong 客 2/3 但无升盘时序佐证(盘口全程未动)=静态低水, 降 ★1。'); }
  if (/瑞典/.test(l.pick)) { setIf(l, 'conf', 1); setIf(l, 'note', 'strong 客 2/3 但无升盘佐证+波兰保级生死战战意倒挂, 降 ★1。'); }
}

/* ③ 深夜北单 4 关: 010 丹麦 3/1 → 011 威尔士 3/1(防冷腿) */
const lb = d.slot8.late.beidan;
const i10 = lb.legs.findIndex(l => l.bdNum === '010');
if (i10 >= 0 && lb.legs[i10].pick === '3/1') {
  lb.legs.splice(i10, 1, { bdNum: '011', match: '011 威尔士 vs 葡萄牙', pick: '3/1', handicap: 1, sp3: [6.75, 4.89, 1.41], note: '防冷腿: 葡萄牙赢不到 2 球(大轮换+威尔士主场)', result: null });
  touched++;
}
setIf(lb, 'review', '深夜(次日00:00-05:59)=欧国联末轮 6 场+U21 两场+英锦赛: 亚盘 3 腿 20 元(丹麦-0/北爱+0.5/卢顿-1) + 北单 4 关 16 注 32 元(011/012/014/006, 撤丹麦腿降单队敞口)。');

/* ④ 深夜亚盘 3 腿: 丹麦U21+1.25 → 卢顿-1 */
const la = d.slot8.late.asian;
const iU = la.legs.findIndex(l => /丹麦U21/.test(l.pick));
if (iU >= 0) {
  la.legs.splice(iU, 1, { id: '北单008', match: '北单008 卢顿 vs 彼得堡联', league: '英锦赛', pick: '卢顿-1', play: '亚盘', odds: '1.82', reason: '半/一→一球升盘有佐证+高两级, 替换丹麦U21 降同队敞口。', result: null });
  touched++;
}
setIf(la, 'totalOdds', (1.82 * 1.86 * 1.82).toFixed(1));

/* ⑤ betPlan: 混选 40→20, 深夜两票明细, 总额 156→136 */
for (const r of d.betPlan.rows) {
  if (r.name === '混选 2 关') { setIf(r, 'detail', '006 丹麦 主胜 2.40(双方生死战降仓) / 003 日本 主胜 1.57'); setIf(r, 'stake', 20); setIf(r, 'payout', (20 * 2.4 * 1.57).toFixed(1)); }
  if (r.name === '北单 4 关') setIf(r, 'detail', '011 3/1 · 012 0/1 · 014 3/1 · 006 0/1（16 注×2 元）');
  if (r.name === '亚盘 3 腿') { setIf(r, 'detail', '丹麦-0 / 北爱尔兰+0.5 / 卢顿-1'); setIf(r, 'odds', (1.82 * 1.86 * 1.82).toFixed(1)); setIf(r, 'payout', (20 * 1.82 * 1.86 * 1.82).toFixed(1)); }
}
setIf(d.betPlan, 'total', 136);
setIf(d.bank, 'stake', 136);

/* ⑥ plan 卡同步 */
const card = n => (d.plan || []).find(p => p.name === n);
const c1 = card('🎯 胜平负');
if (c1) {
  setIf(c1, 'pct', '0单选0胆+2场弃选');
  setIf(c1, 'text', '零单选零胆: 原单选级 006 丹麦降级——★纠错: 挪威首回合赢过丹麦, 本场赢球即凭交锋反超抢第二(前二进淘汰赛)=双方生死战非丹麦单方背水, 竞彩 2.40/2.29 近平手=市场视作均势, 不配当锚; 日本 1.57 超胆区间+soft; 韩国为北单场无竞彩胆通道。弃选 2 场=010 智利(conflict)+北单005(none)。001 新加坡让球-only 让负表达。');
}
const c3 = card('🌏 亚洲让球');
if (c3) setIf(c3, 'text', '亚盘腿池 15 腿(V4.4 不留空): ★2=丹麦-0(升盘+战意)/韩国-1(3/3+升盘)/北爱+0.5(平即锁头名)/丹麦U21+1.25(3/3); ★1=巴林+0.5/瑞典+0.25(低水无升盘佐证, 降级)。实下: 夜场 2 腿 20(巴林+0.5/韩国-1)+深夜 3 腿 20(丹麦-0/北爱+0.5/卢顿-1)。');
const c4 = card('🀄 北单310');
if (c4) setIf(c4, 'text', '北单 26116 期腿池 10 腿按信心(010 丹麦/004 韩国/012 北爱 领衔); 实下两票: 夜场 3 关 8 注×3=24(002/003/004)+深夜 4 关 32(011 威尔士防冷腿/012/014/006, ★撤丹麦腿降单队敞口), 全双选合规。');
const c8 = card('💰 投注建议');
if (c8) {
  setIf(c8, 'pct', '方案136元');
  setIf(c8, 'text', '💰136 元(忌日减量+锚腿安全重构)=混选 2 关 20(丹麦×日本≈3.8 倍, 双方生死战降仓) + 北单两票 56(夜场 3 关 24/深夜 4 关 32) + 亚盘两票 40(夜场 2 腿 20/深夜 3 腿 20) + 大小 2 串 20。★单队敞口上限 40 元(丹麦 20 混选+20 亚盘且平手盘走水保护; 韩国 44=24 北单+20 亚盘为全池最实锚: 孙兴慜首发+卡塔尔 0-3 输澳大利亚)。0 胆 0 单关 2 弃选; 比分/梦想 3 关只展示。');
}

/* ⑦ dayNote 追加调整注记 */
setIf(d, 'dayNote', (d.dayNote || '') + '【午后锚腿重审】挪威非无欲(赢球即反超丹麦进前二)=006 丹麦单选级撤→双选, 混选降仓 40→20, 深夜北单撤丹麦腿换 011 威尔士防冷腿, 深夜亚盘丹麦U21→卢顿-1; 丹麦总敞口 92→40 元。');

if (process.env.DRY === '1') { console.log('DRY ok, touched', touched, 'stake', d.bank.stake); process.exit(0); }
const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 锚腿重审落地, touched=' + touched, '💰', d.bank.stake);
