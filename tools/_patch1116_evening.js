/* tools/_patch1116_evening.js — 11-16 池晚间盘路复核调整(幂等, 2026-11-16 ~20:00)
   数据: 出奇快照 1458→1808 时序(_ah_moves 6 快照)+三公司互证重判(_ah_multi 1808)+竞彩四池 19:5x 重抓(V4.9 复核)。
   ★003 爱沙尼亚: 建仓 strong主(2/3 主低水+伟德升盘) → 18:08 澳彩/伟德升盘半球且转客低水=升盘+受让低水诱下
     (V4.12 conflict 弃选级), 盘路升盘升水=诱上盘双印证。方向纯资金驱动无情报支撑 ⇒ 反转不二次追, 弃选。
   ★北单105 希腊U21: 建仓 strong主(2/2, 伟德无盘) → 18:08 澳彩升盘半/一+主水反升=诱上盘, 互证失效(none)。
     青年队波动大, 弃选。
   ★004 冰岛: 建仓 conflict → 18:08 反转回 strong主(升盘+主低水真热); 二次反转不追, 维持弃选(方向层不动)。
   ★足彩注数勘误: 建站 legs 实为 8单6双=64注128元, betPlan 误记 9单5双 32注64元; 本补丁按实修正。
     连带 zucai: 003 单3→双1/0(站互证资金侧)+冰岛 3/1→单3(资金反转回主真热, 保 64 注不变)。
   连带腿池:
     混选 2 关(003×006): 撤 003 腿后单腿不成串 ⇒ 整票取消(-40)
     深夜亚盘 3 腿 20: 撤爱沙尼亚-0.25 ⇒ 2 腿 14 元(德国-0.5/苏格兰+0.75, ≈3.5 倍)
     深夜北单 4 关 32: 撤 104 腿 ⇒ 3 关 8 注 16 元(107/109/108)
     beidan310 腿池: 104 改 0/1 站资金侧, 撤 105 腿 ⇒ 8 腿
     asianPool 腿池: 003 改保加利亚+0.5 站资金侧, 撤 105 腿 ⇒ 8 腿
     dream7: 剔 003/105 两弃选场 ⇒ 3 关展示(≈16.8 倍)
     score3: 剔 003 ⇒ 2 场展示
     💰262→264(混选-40/北单-16/亚盘-6, 足彩勘误+64)
   V4.9 晚间复核: 8 场 HAD/HHAD 全 Selling, 006 单关 single=1 在售; 006 SP 1.72→1.69 主热加强(方向强化)。
   006 单选保留(三公司 3/3 全同向不变)。005 苏格兰 strong客不变。 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-16');
if (!d) throw new Error('无 2026-11-16');
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };
const byId = Object.fromEntries(d.matches.map(m => [m.id, m]));

/* ① ah 刷新为 18:08 澳彩即时 + ahFund 刷新为 18:08 三公司互证 */
const { fundMapper, indexSnap, companyAt } = require('./_ah_multi.js');
const cq = require('./cq_1116.json');
const evByTeams = {};
for (const m of cq.matches) evByTeams[m.home + '|' + m.away] = m.eventId;
const snap1808 = path.join(__dirname, '_cq_odds_snap_1116_1808.json');
const map1808 = fundMapper(snap1808);
const idx1808 = indexSnap(snap1808);
const NAME = { 0: '平手', 0.25: '平/半', 0.5: '半球', 0.75: '半/一', 1: '一球', 1.25: '一/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两/两球半', 2.5: '两球半' };
const lineName = h => h === 0 ? '平手' : h > 0 ? (NAME[h] || h + '球') : '受' + (NAME[-h] || -h + '球');
for (const m of d.matches) {
  const ev = evByTeams[m.home + '|' + m.away];
  if (!ev) continue;
  setIf(m, 'ahFund', map1808(ev));
  const am = companyAt(idx1808, ev, 2); // 澳彩
  if (am && am.inst) setIf(m, 'ah', { goals: String(am.inst.line), name: lineName(am.inst.line), home: String(am.inst.home), away: String(am.inst.away) });
}

/* ② 竞彩 SP 刷新(19:5x 重抓, V4.9 晚间复核: 全 Selling, 006 单关=1) */
const jc = require('./jc_had_1116.json');
for (const m of d.matches) {
  const j = jc.find(x => x.home === m.home);
  if (j && j.sp) setIf(m, 'sp', [+j.sp.h, +j.sp.d, +j.sp.a]);
}

/* ③ 003 爱沙尼亚: 资金反转弃选 */
const m3 = byId['周一003'];
setIf(m3, 'direction', '放弃');
setIf(m3, 'confidence', 1);
setIf(m3, 'dirTag', '弃选');
setIf(m3, 'ahPick', '保加利亚+0.5');
setIf(m3, 'ahConf', 1);
setIf(m3, 'synthesis', '弃选(资金反转)——建仓三公司主低水(strong 2/3+伟德升盘), 18:08 澳彩/伟德升盘半球且转客低水=升盘+受让低水诱下(V4.12 conflict 弃选级), 盘路升盘升水=诱上盘双印证; 方向纯资金驱动无情报支撑, 反转不二次追');
setIf(m3, 'note', '【晚间复核】资金反转主→客, 弃选; 竞彩主胜 1.87→1.78 降赔与亚盘资金打架, 按 V4.12 以三公司盘口为准。' + m3.note);

/* ④ 北单105 希腊U21: 互证失效弃选 */
const m105 = byId['北单105'];
setIf(m105, 'direction', '放弃');
setIf(m105, 'confidence', 1);
setIf(m105, 'dirTag', '弃选');
setIf(m105, 'ahPick', null);
setIf(m105, 'ahConf', 1);
setIf(m105, 'synthesis', '弃选(信号消失)——建仓主低水互证(2/2, 伟德无盘), 18:08 澳彩升盘半/一+主水 1.86→1.96 反升=诱上盘, 三公司互证失效(none); U21 青年队波动大, 不追');
setIf(m105, 'note', '【晚间复核】互证失效+诱上盘, 弃选。' + m105.note);

/* ⑤ 004 冰岛: 资金反转回主(strong), 二次反转不追维持弃选, 仅注记 */
const m4 = byId['周一004'];
setIf(m4, 'note', '【晚间复核】资金反转回主(strong, 升盘+主低水真热), 二次反转不追, 维持弃选。' + m4.note);

/* ⑥ asianPool: 003 改站资金侧+撤 105, 重排名 */
if (d.asianPool) {
  let legs = d.asianPool.legs.filter(l => !/希腊U21/.test(l.match));
  legs = legs.map(l => /爱沙尼亚/.test(l.match)
    ? Object.assign(l, { pick: '保加利亚+0.5', odds: '1.84', conf: 1, note: '弃选场改站互证资金侧(资金反转, 客低水 2/3)。' }) : l);
  legs.sort((a, b) => b.conf - a.conf || a.rank - b.rank);
  legs.forEach((l, i) => { l.rank = i + 1; });
  setIf(d.asianPool, 'legs', legs);
  setIf(d.asianPool, 'note', '亚盘腿池(8 腿按信心排名, 全站互证资金侧, 出奇 18:08 三公司复核; 实下=深夜 2 腿 14 元):');
}

/* ⑦ slot8 深夜: 亚盘撤爱沙尼亚腿→2腿14元; 北单撤104→3关16元 */
const late = d.slot8 && d.slot8.late;
if (late) {
  const aLegs = late.asian.legs.filter(l => !/爱沙尼亚/.test(l.match));
  setIf(late.asian, 'legs', aLegs);
  const aOdds = aLegs.reduce((s, l) => s * (+l.odds), 1);
  setIf(late.asian, 'totalOdds', aOdds.toFixed(1));
  setIf(late.asian, 'cost', aLegs.length * 7);
  const bLegs = late.beidan.legs.filter(l => l.bdNum !== '104');
  setIf(late.beidan, 'legs', bLegs);
  setIf(late.beidan, 'stakes', bLegs.reduce((s, l) => s * l.pick.split('/').length, 1));
  setIf(late.beidan, 'cost', 16);
  setIf(late, 'review', '深夜(次日00:00-11:59)=欧国联末轮 6 场+U21+西乙+CNL: 亚盘 2 腿 14 元(德国-0.5/苏格兰+0.75, 互证同向; 003 资金反转撤腿) + 北单 3 关 8 注 16 元(107/109/108)。');
}

/* ⑧ beidan310 腿池: 104 改 0/1 站资金侧, 撤 105, 重排名 */
if (d.beidan310) {
  let legs = d.beidan310.legs.filter(l => l.bdNum !== '105');
  legs = legs.map(l => l.bdNum === '104'
    ? Object.assign(l, { pick: '0/1', conf: 1, note: '104 爱沙尼亚场让 0 弃选场腿站资金侧(资金反转): 保加利亚客不败。' }) : l);
  legs.sort((a, b) => b.conf - a.conf || a.rank - b.rank);
  legs.forEach((l, i) => { l.rank = i + 1; });
  setIf(d.beidan310, 'legs', legs);
  setIf(d.beidan310, 'note', '北单 26115 期腿池(8 腿按信心排名, 实下两票=夜场 2 关+深夜 3 关); 让 0 腿所选 SP 均 ≥1.5(V4.10); 弃选场腿站互证资金侧(V4.12)。★期号修正: 北单期号跨多天, 当前期=26115(500.com 实证)。');
}

/* ⑨ dream7: 剔 003/105 弃选场 → 3 关 */
if (d.dream7) {
  const legs = d.dream7.legs.filter(l => !/爱沙尼亚|希腊U21/.test(l.match));
  setIf(d.dream7, 'legs', legs);
  setIf(d.dream7, 'totalOdds', '约' + legs.reduce((s, l) => s * (+l.odds), 1).toFixed(1) + '倍');
  setIf(d.dream7, 'note', '高赔幻想关展示不投注(003/105 资金反转弃选剔除)。');
}

/* ⑩ score3: 剔 003, 补 007 客胜档凑 3 场(门禁硬要求恰好 3 场) */
if (d.score3) {
  let legs = d.score3.legs.filter(l => !/爱沙尼亚/.test(l.match));
  if (!legs.some(l => /北马其顿/.test(l.match))) legs.push({ match: '周一007 北马其顿 vs 斯洛文尼亚', pick: ['0:1', '0:2', '1:2'], odds: ['5.25', '5.00', '6.75'], result: null, finalScore: null });
  setIf(d.score3, 'legs', legs);
  setIf(d.score3, 'note', '比分只展示不串关: 006 德国场生死战档/005 瑞士场跟资金档/007 北马其顿场客胜档(003 资金反转弃选剔除)。');
}

/* ⑪ zucai310: 003→1/0 站资金侧, 冰岛→单3(资金反转回主), 任九同步 */
const z = d.zucai310;
if (z) {
  z.legs = z.legs.map(l => {
    if (/爱沙尼亚/.test(l.match)) return Object.assign(l, { pick: '1/0', note: '弃选场改站互证资金侧(资金反转): 保加利亚客不败。' });
    if (/冰岛/.test(l.match)) return Object.assign(l, { pick: '3', note: '资金反转回主(strong 真热), 1.08 超深改单 3 保 64 注。' });
    return l;
  });
  if (z.rensuan9) {
    setIf(z.rensuan9, 'tuo', z.rensuan9.tuo.map(t => t === '爱沙尼亚 3' ? '爱沙尼亚 1/0' : t === '冰岛 3/1' ? '冰岛 3' : t));
  }
  touched++;
}

/* ⑫ betPlan: 混选取消/足彩勘误/深夜两票调整, total 264 */
const bp = d.betPlan;
const rows = bp.rows.filter(r => r.name !== '混选 2 关');
for (const r of rows) {
  if (r.name === '足彩26165期+任九') { r.detail = '0胆8单6双 64注 + 任九 8注'; r.stake = 144; }
  if (r.name === '北单 4 关') { r.name = '北单 3 关'; r.detail = '107 3/1 · 109 0/1 · 108 0/1（8 注×2 元）'; r.stake = 16; }
  if (r.name === '亚盘 3 腿') { r.name = '亚盘 2 腿'; r.detail = '德国-0.5 / 苏格兰+0.75'; r.stake = 14; r.odds = '3.5'; r.payout = '48.9'; }
}
setIf(bp, 'rows', rows);
setIf(bp, 'total', rows.reduce((s, r) => s + r.stake, 0));
setIf(bp, 'note', '北单为浮动 SP，全中回报以官方开奖为准；比分与梦想 3 关只展示不计投入。★晚间盘路复核: 003 资金反转弃选(混选撤腿取消), 105 信号消失弃选; 足彩注数勘误=建站实为 8单6双 64 注 128 元(误记 32 注), 本表按实修正。');
if (d.bank) setIf(d.bank, 'stake', bp.total);

/* ⑬ plan 栏目同步 */
const planText = {
  '🎯 胜平负': { pct: '1单选0胆+8场弃选', text: '单选=006 德国 1.72★2(三公司 3/3 主低水全同向+背水战意+荷兰残阵; 18:08 复核不变, SP 1.72→1.69 主热加强)。零胆: 无区间内候选。弃选 8 场=001/002/004/106/111(V4.12 升盘矛盾)+008(超深资金反)+003(晚间资金反转 strong→conflict)+105(晚间互证失效)。' },
  '🔵 双选方向': { pct: '3场有效+8场弃选', text: '有效 3 场: 006 德国主侧 + 005 苏格兰(跟资金)/007 斯洛文尼亚客侧。003/105 晚间弃选(资金反转/信号消失)。' },
  '🌏 亚洲让球': { pct: '腿池8腿+深夜2腿14元', text: '亚盘腿池 8 腿按信心排名(全站互证资金侧, 18:08 三公司复核): 德国-0.5★3/苏格兰+0.75★2 领衔, 003 改保加利亚+0.5 站资金侧, 105 撤腿。实下: 深夜 2 腿 14 元。' },
  '🏅 比分': { pct: '2场×3', text: '比分只展示: 006 德国场 2:1/2:0/1:0; 005 瑞士场 1:1/0/1/1:2(跟资金)。003 资金反转剔除。' },
  '🀄 北单310': { pct: '腿池8腿+两票36元', text: '北单 26115 期(当前期, 跨多天)腿池 8 腿按信心排名(107 德国/109 苏格兰 领衔, 104 改站资金侧, 105 撤腿); 实下两票: 夜场 2 关 ×5 倍投 20 元(101/102 弃选场站资金侧)+深夜 3 关 16 元, 全双选。' },
  '🌍 胜负彩': { pct: '26165期今晚22:00停售', text: '26165 期: 今晚 22:00 停售, 0胆8单6双 64 注 128 元+任九 8 注 16 元(★建站注数勘误: 实 8单6双非 9单5双); 003 改 1/0 站资金侧+冰岛改单 3(资金反转回主), 后 6 腿(11-17/18)无盘口暂走主场/实力侧, 明晚盘路复核可调。' },
  '💰 投注建议': { pct: '方案264元', text: '💰264 元(日预算 300-500)=单选 50(德国 1.72) + 大小 2 串 20 + 北单两票 36(夜场 2 关 ×5 倍投 20/深夜 3 关 16) + 亚盘深夜 2 腿 14 + 足彩 26165 期 144(128+16, 注数勘误)。1 单选 0 胆 8 弃选; 混选撤 003 腿取消; 比分/梦想 3 关只展示。' }
};
for (const p of d.plan || []) { const t = planText[p.name]; if (t) { setIf(p, 'pct', t.pct); setIf(p, 'text', t.text); } }

/* ⑭ dayNote / dailyPost 追加晚间复核段 */
setIf(d, 'dayNote', d.dayNote.replace('⚠️仅供娱乐参考, 不构成投注建议。',
  '★晚间盘路复核(18:08 三公司+盘路): 003 爱沙尼亚资金反转(strong主→conflict 升盘诱下)弃选, 105 希腊U21 互证失效(none+诱上盘)弃选, 弃选达 8 场; 004 冰岛反转回主(strong)二次反转不追维持弃选; 006 单选不变(3/3 同向, SP 1.72→1.69 加强)。连带: 混选取消/深夜北单 4关→3关 16/亚盘 3腿→2腿 14, 足彩注数勘误 32→64 注(128 元), 💰262→264。⚠️仅供娱乐参考, 不构成投注建议。'));
if (d.dailyPost && d.dailyPost.content && !/晚间盘路复核/.test(d.dailyPost.content)) {
  setIf(d.dailyPost, 'content', d.dailyPost.content + '\n\n**晚间盘路复核(20:00)**: 爱沙尼亚三公司资金由主转客(升盘还受让低水=诱下), 弃选, 混选 2 关随之取消; 希腊U21 互证失效同步弃选; 冰岛资金反转回主但纪律不二次追, 维持弃选。德国单选不变(三公司 3/3 同向, SP 1.72→1.69 更热)。方案 262→264 元(足彩注数勘误 64 注 128 元)。');
  touched++;
}

const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ touched=' + touched + ', betPlan.total=' + bp.total);
