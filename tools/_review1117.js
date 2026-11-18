/* tools/_review1117.js — 11-17 池(15场)终审(幂等, 2026-11-18 早)
   赛果: 东京 watch 11 场 + 本机 _live1117 补 3 场(U21), 14/15 已赛;
   周二010 智利 vs 哥伦比亚(07:00 场)进行中[半场 0-0], 弃选场不影响结算, 完场后定稿。
   ★方向 7红6黑/双选 10红2黑(83.3%)/0 胆 0 单选 push;
     **深夜北单 4 关 32 全红(011 让平 4.89/012 平 3.18/014 主 2.08/006 客 5.38, 名义回 348.0)=连续第二日一张全红北单票救主**;
     混选(丹麦黑)/夜场北单(日本断)/夜场亚盘(韩国-1 走水)/深夜亚盘(丹麦-0 断)/大小双黑全灭。
   ★26165 定格 14 场 8红6黑(后 6 腿 3红3黑), 票与任九早已灭, 官方开奖公告待回填。
   💰136 回 348.0(名义) 净 +212.0。
   ★001 新加坡场 direction「让负」修正为「让球负」(judgeDirection 只认让球X 三字形态, 11-15 芬兰场黑得无歧义未暴露)。
   DRY=1 只校验打印。 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'stats.js'));
const J = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'judge.js'));
const { settleSlot8, judgeOu } = require('./_slot8.js');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-17');
const d16 = days.find(x => x.date === '2026-11-16');
if (!d) throw new Error('无 2026-11-17');
const pending = d.matches.filter(m => !m.finalScore).map(m => m.id);
if (pending.some(id => id !== '周二010')) throw new Error('仍有未完场 ' + pending.join(','));
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };
const card = n => (d.plan || []).find(p => p.name === n);
const setCard = (n, v) => { const c = card(n); if (c) setIf(c, 'result', v); };
const findM = ref => {
  const s = String(ref || '');
  /* 队名优先: 北单腿号(004/006/009/010)与竞彩号(周二004/006/009/010)撞车时数字匹配会错场(本日实证) */
  const byName = d.matches.find(x => s.includes(x.home) && s.includes(x.away));
  if (byName) return byName;
  const num = s.match(/(\d{3})/);
  return num ? d.matches.find(x => String(x.id).slice(-3) === num[1]) : null;
};
const normScore = s => { const m = String(s || '').match(/(\d+)\s*[:：-]\s*(\d+)/); return m ? m[1] + '-' + m[2] : null; };
function ahResult(pick, m) { const team = J.ahTeamOf(pick), side = m.home.includes(team) || team.includes(m.home) ? 'home' : 'away'; return J.judgeAh(pick, m.finalScore, side); }
function bdResult(pick, handicap, score) {
  const s = S.parseScore(score), h = parseInt(handicap, 10) || 0;
  const adj = s.home + h, actual = adj > s.away ? '3' : adj < s.away ? '0' : '1';
  return { hit: String(pick).split('/').includes(actual), actual };
}

/* ⓪ 001 方向文本修正: 让负→让球负(语义不变, judgeDirection 只认让球X) */
const m1 = d.matches.find(m => m.id === '周二001');
setIf(m1, 'direction', '让球负');

/* ① 方向层(周二010 弃选待赛, 不计) */
let dirH = 0, dirN = 0, dblH = 0, dblM = 0, ditch = 0;
for (const m of d.matches) {
  const v = m.finalScore ? S.judgeDirection(m.direction, m.finalScore, m.spHandicap) : null;
  if (v === null) { ditch++; continue; }
  dirN++; if (v === 1) dirH++;
  const s = S.parseScore(m.finalScore), tag = String(m.dirTag || '');
  if (tag.includes('双选')) { const hit = v === 1 || s.home === s.away; hit ? dblH++ : dblM++; }
}
if (dirN !== 13 || dirH !== 7 || dblH !== 10 || dblM !== 2 || ditch !== 2) throw new Error('方向统计异常 ' + [dirH, dirN, dblH, dblM, ditch].join('/'));

/* ② 北单腿池(10腿): 004/012/006/013/014/009/011 红, 010/003 黑, 015 待赛 */
let bdH = 0, bdM = 0;
for (const l of d.beidan310.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  if (!m.finalScore) continue;
  const r = bdResult(l.pick, l.handicap, m.finalScore);
  r.hit ? bdH++ : bdM++;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', r.hit ? 'hit' : 'miss');
}
if (bdH !== 7 || bdM !== 2) throw new Error('腿池统计异常 ' + bdH + '/' + bdM);
setIf(d.beidan310, 'result', 'half');

/* ③ 三时段票: 夜场北单(日本断)/夜场亚盘(韩国走水)/深夜亚盘(丹麦断)灭; 深夜北单 4 关全红 */
settleSlot8(d);
const night = d.slot8.night.beidan, lateB = d.slot8.late.beidan, lateA = d.slot8.late.asian, nightA = d.slot8.night.asian, early = d.slot8.early.beidan, earlyA = d.slot8.early.asian;
if (early.result !== null || earlyA.result !== null) throw new Error('早场应为空票');
if (night.result !== 'miss' || nightA.result !== 'miss' || lateA.result !== 'miss') throw new Error('夜场/深夜票态异常 ' + night.result + '/' + nightA.result + '/' + lateA.result);
if (lateB.result !== 'hit') throw new Error('深夜北单 4 关应全红 ' + lateB.result);
/* 名义回收: 011 让平(sp3[1]) × 012 平(sp3[1]) × 014 主胜(sp3[0]) × 006 客胜(sp3[2]) × 2 元 */
const lateRet = +(2 * lateB.legs[0].sp3[1] * lateB.legs[1].sp3[1] * lateB.legs[2].sp3[0] * lateB.legs[3].sp3[2]).toFixed(2);

/* ④ 亚盘腿池(15腿, 展示): 8红2半红2黑2半黑1走, 哥伦比亚-0.25 待赛 */
for (const l of d.asianPool.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  if (!m.finalScore) continue;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', ahResult(l.pick, m));
}
const poolStat = d.asianPool.legs.filter(l => l.result).map(l => l.result).join(',');
if (poolStat !== 'lose,push,win,win,win,winHalf,lose,win,win,win,loseHalf,winHalf,loseHalf,win') throw new Error('亚盘腿池异常 ' + poolStat);

/* ⑤ 大小 2 串: 002 小 2.25(4 球)黑, 003 小 2.5(3 球)黑 */
for (const l of d.ou2.legs) { const m = findM(l.match); setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', judgeOu(l.pick, m.finalScore)); }
setIf(d.ou2, 'result', d.ou2.legs.every(l => l.result === 'win') ? 'hit' : 'miss');
if (d.ou2.result !== 'miss') throw new Error('ou2 应断');

/* ⑥ 比分 3 场×3(展示): 全黑 */
let scoreHits = 0;
for (const l of d.score3.legs) { const m = findM(l.match), hit = l.pick.some(p => normScore(p) === m.finalScore); if (hit) scoreHits++; setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', hit ? 'hit' : 'miss'); }
setIf(d.score3, 'result', scoreHits === 3 ? 'hit' : scoreHits ? 'half' : 'miss');
if (scoreHits !== 0) throw new Error('比分应 0/3, 实 ' + scoreHits);

/* ⑦ 梦想 3 关(展示): 日本-1 黑, 爱尔兰-1/卢顿-1 红 */
let dreamH = 0;
for (const l of d.dream7.legs) {
  const m = findM(l.match); if (!m) throw new Error('梦想腿找不到 ' + l.match);
  const s = S.parseScore(m.finalScore);
  const hm = String(l.pick).match(/让球?([主客])胜?\(?([+-]?\d+)\)?/);
  if (!hm) throw new Error('梦想腿口径不明 ' + l.pick);
  const side = hm[1], h = parseInt(hm[2], 10);
  const adj = s.home + h;
  const hit = side === '主' ? adj > s.away : adj < s.away;
  if (hit) dreamH++;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', hit ? 'hit' : 'miss');
}
setIf(d.dream7, 'result', dreamH === d.dream7.legs.length ? 'hit' : 'miss');
if (dreamH !== 2) throw new Error('梦想应 2/3, 实 ' + dreamH);

/* ⑧ 足彩26165(挂 11-16): 后 6 腿定格 3红3黑 → 全期 14 场 8红6黑 */
if (d16 && d16.zucai310) {
  const z = d16.zucai310;
  let nH = 0, nM = 0;
  for (const l of z.legs) {
    if (l.result) continue;
    const m = findM(l.match);
    if (!m || !m.finalScore) continue;
    const s = S.parseScore(m.finalScore), actual = s.home > s.away ? '3' : s.home < s.away ? '0' : '1';
    const hit = String(l.pick).split('/').includes(actual);
    hit ? nH++ : nM++;
    setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', hit ? 'hit' : 'miss');
  }
  if (nH !== 3 || nM !== 3) throw new Error('26165 后 6 腿判定异常 ' + nH + '/' + nM);
  const allH = z.legs.filter(l => l.result === 'hit').length, allM = z.legs.filter(l => l.result === 'miss').length;
  if (allH !== 8 || allM !== 6) throw new Error('26165 总数异常 ' + allH + '/' + allM);
  setIf(z, 'result', 'miss');
  setIf(z, 'note', (z.note || '') + '【11-18 定格】14 场全齐 8红6黑(后 6 腿: 波黑 2-1/爱尔兰 3-0/威尔士 2-3 红, 丹麦 2-3/匈牙利 1-1/波兰 1-1 黑), 64 注票与任九早已灭(第 1 腿法罗), 官方开奖公告待回填仅作记录。');
}

/* ⑨ bank + 回收构成(深夜北单全红=唯一回收) */
setIf(d.bank, 'stake', 136);
setIf(d.bank, 'ret', lateRet);
setIf(d.bank, 'net', +(lateRet - 136).toFixed(2));
setIf(d.bank, 'detail', '深夜北单 4 关全红名义回 ' + lateRet.toFixed(2) + '(011 威尔士让平 4.89×012 北爱平 3.18×014 爱尔兰主 2.08×006 丹麦U21 客 5.38×2 元, 浮动 SP 以官方开奖为准); 混选(丹麦黑)/夜场北单(日本断)/夜场亚盘(韩国-1 走水)/深夜亚盘(丹麦-0 断)/大小 2 串(双黑)全灭。');
setIf(d.bank, 'summary', '深夜北单全红救主, 锚腿重审减损');

/* ⑩ betPlan 行级 result */
for (const r of (d.betPlan && d.betPlan.rows) || []) {
  if (/北单 4 关/.test(r.name)) setIf(r, 'result', 'hit');
  else setIf(r, 'result', 'miss');
}

/* ⑪ plan 卡 */
setCard('🎯 胜平负', 'push');
setCard('🔵 双选方向', 'hit');
setCard('🌏 亚洲让球', 'miss');
setCard('🟣 大小盘', 'miss');
setCard('🏅 比分', 'miss');
setCard('🀄 北单310', 'hit');
setCard('🌍 胜负彩', 'push');
setCard('💰 投注建议', 'hit');

/* ⑫ review 正文 */
const review = '【11-17 终审】14/15 场已赛(周二010 智利 07:00 场半场 0-0 进行中, 弃选场不影响结算, 完场定稿)。有效方向 13 场: 方向 7红6黑·**双选 10红2黑(83.3%)**(黑=003 日本 1-2 主场翻车/006 丹麦 2-3 输挪威)·4 平局全罩(002 国足 2-2/005 波兰 1-1/008 匈牙利 1-1/北单007)·0 胆 0 单选 push·让球-only 001 巴西 0-7 让负红。' +
  '★弃选 2 场: 中性 1(北单005 捷克U21 1-1 闷平)+待赛 1(010)。' +
  '主产品: **深夜北单 4 关 32 全红(011 威尔士让平 4.89[葡萄牙 3-2 赢恰好 1 球]/012 北爱平 3.18/014 爱尔兰 2.08/006 丹麦U21 客 5.38, 名义回 348.0)=连续第二日一张全红北单票救主**; 🀄腿池 7红2黑(004 韩国让平红[赢恰好 1 球]/013 瑞典平/009 波黑/011/012/014/006 红; 010 丹麦/003 日本黑); 夜场北单 3 关(日本 3/1 断)/深夜亚盘 3 腿(丹麦-0 断, 北爱+0.5/卢顿-1 红)/夜场亚盘 2 腿(韩国-1 走水断, 巴林+0.5 红)/混选 2 关(丹麦黑)/大小 2 串(国足 2-2+日本 1-2 双大黑)全灭; 🏅比分 0/3; 梦想 3 关 2红1黑; 🌏亚盘腿池 8红2半红1走2黑2半黑(010 待赛, 瑞典+0.25/土耳其U21+0.25 半红, 爱尔兰U21/葡萄牙-1.25 半黑)。' +
  '🌍足彩 26165 定格 14 场 8红6黑(后 6 腿: 波黑/爱尔兰/威尔士红, 丹麦/匈牙利/波兰黑), 票与任九早已灭, 官方开奖公告待回填。' +
  '💰136 回 348.0(名义) 净 **+212.0**。' +
  '★复盘核心: ①**午后锚腿重审救命**——丹麦降级+撤腿后敞口 92→40, 丹麦 2-3 真输挪威: 若按初版(混选 40 重仓+深夜双票带丹麦腿)直接多亏 ~60 元, 「挪威赢球反超进前二」的双方生死战判断完全兑现; ②用户纠出的「挪威无欲」臆断=胆锚三级校验(晋级规则+H2H+资金时序)首日立功; ③★2 降 ★1 双腿方向全对(巴林+0.5 红/瑞典+0.25 红): 静态低水无升盘佐证=星级降级但方向仍可用, 口径自洽; ④深夜北单换入 011 威尔士防冷腿直接救票(葡萄牙赢恰好 1 球让平 4.89); ⑤日本主场 1-2 输巴拉圭: soft 降盘读出「穿盘信心减」对, 但方向层主胜仍黑=友谊赛强队方向要再降权(日本全主力预期落空); ⑥大小球双证连黑两天(昨日 007/今日 002+003), 友谊赛节奏(国足 2-2)与末轮开放局判断需单列校准。';
setIf(d, 'review', review);

if (process.env.DRY === '1') {
  console.log('DRY ok: 方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', '深夜回收', lateRet, 'bank', JSON.stringify(d.bank), 'touched', touched);
  process.exit(0);
}
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ 终审落地, touched=' + touched, '方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', 'bank.net', d.bank.net);
