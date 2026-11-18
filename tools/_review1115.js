/* tools/_review1115.js — 11-15 池(15场)全日终审 + 足彩26163 余 6 场定格(幂等, 2026-11-16)
   赛果: 本机 _live1115.js 12 场(修 sed 残留日期 bug 后)+东京 watch 3 场, 15/15 齐。
   ★方向 2红8黑暗夜, 双选 4红5黑; 早场北单 4 关 32 全红(名义回 317.25)=唯一活票救主;
     夜场/深夜北单+早晚亚盘+大小+混选全灭。💰196 回 317.25(名义) 净 +121.25。
   ★26163 定格 14 场 8红6黑(新补 6 场 3红3黑), 票与任九早已灭。
   DRY=1 只校验打印。 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'stats.js'));
const J = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'judge.js'));
const { settleSlot8, judgeOu } = require('./_slot8.js');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-15');
const d13 = days.find(x => x.date === '2026-11-13');
if (!d) throw new Error('无 2026-11-15');
if (!d.matches.every(m => m.finalScore)) throw new Error('仍有未完场');
let touched = 0;
const setIf = (o, k, v) => { if (o && JSON.stringify(o[k]) !== JSON.stringify(v)) { o[k] = v; touched++; } };
const card = n => (d.plan || []).find(p => p.name === n);
const setCard = (n, v) => { const c = card(n); if (c) setIf(c, 'result', v); };
const findM = ref => {
  const s = String(ref || '');
  const num = s.match(/(\d{3})/);
  let m = num ? d.matches.find(x => String(x.id).slice(-3) === num[1]) : null;
  if (m) return m;
  return d.matches.find(x => s.includes(x.home) && s.includes(x.away)) || null;
};
const normScore = s => { const m = String(s || '').match(/(\d+)\s*[:：-]\s*(\d+)/); return m ? m[1] + '-' + m[2] : null; };
function ahResult(pick, m) { const team = J.ahTeamOf(pick), side = m.home.includes(team) || team.includes(m.home) ? 'home' : 'away'; return J.judgeAh(pick, m.finalScore, side); }
function bdResult(pick, handicap, score) {
  const s = S.parseScore(score), h = parseInt(handicap, 10) || 0;
  const adj = s.home + h, actual = adj > s.away ? '3' : adj < s.away ? '0' : '1';
  return { hit: String(pick).split('/').includes(actual), actual };
}

/* ① 方向层 */
let dirH = 0, dirN = 0, dblH = 0, dblM = 0, ditch = 0;
for (const m of d.matches) {
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v === null) { ditch++; continue; }
  dirN++; if (v === 1) dirH++;
  const s = S.parseScore(m.finalScore), tag = String(m.dirTag || '');
  if (tag.includes('双选')) { const hit = v === 1 || s.home === s.away; hit ? dblH++ : dblM++; }
}
if (dirN !== 10 || dirH !== 2 || dblH !== 4 || dblM !== 5 || ditch !== 5) throw new Error('方向统计异常 ' + [dirH, dirN, dblH, dblM, ditch].join('/'));

/* ② 北单腿池(11腿) */
let bdH = 0, bdM = 0;
for (const l of d.beidan310.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  const r = bdResult(l.pick, l.handicap, m.finalScore);
  r.hit ? bdH++ : bdM++;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', r.hit ? 'hit' : 'miss');
}
if (bdH !== 7 || bdM !== 4) throw new Error('腿池统计异常 ' + bdH + '/' + bdM);
setIf(d.beidan310, 'result', 'half');

/* ③ 三时段票 */
settleSlot8(d);
const early = d.slot8.early.beidan, night = d.slot8.night.beidan, lateB = d.slot8.late.beidan, lateA = d.slot8.late.asian, earlyA = d.slot8.early.asian;
if (early.result !== 'hit') throw new Error('早场北单 4 关应全红 ' + early.result);
if (night.result !== 'miss' || lateB.result !== 'miss') throw new Error('夜场/深夜北单票态异常 ' + night.result + '/' + lateB.result);
if (earlyA.result !== 'miss' || lateA.result !== 'miss') throw new Error('亚盘票态异常');
/* 早场 4 关名义回收: 080平(3.16)×083让平(3.88)×084平(3.45)×085让平(3.75) ×2元 */
const earlyRet = 2 * early.legs[0].sp3[1] * early.legs[1].sp3[1] * early.legs[2].sp3[1] * early.legs[3].sp3[1];

/* ④ 亚盘腿池(10腿, 展示) */
for (const l of d.asianPool.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', ahResult(l.pick, m));
}
const poolStat = d.asianPool.legs.map(l => l.result).join(',');
if (poolStat !== 'win,lose,lose,winHalf,lose,win,lose,win,lose,lose') throw new Error('亚盘腿池异常 ' + poolStat);

/* ⑤ 大小 2 串 */
for (const l of d.ou2.legs) { const m = findM(l.match); setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', judgeOu(l.pick, m.finalScore)); }
setIf(d.ou2, 'result', d.ou2.legs.every(l => l.result === 'win') ? 'hit' : 'miss');
if (d.ou2.result !== 'miss') throw new Error('ou2 应断');

/* ⑥ 比分 3 场×3(展示) */
let scoreHits = 0;
for (const l of d.score3.legs) { const m = findM(l.match), hit = l.pick.some(p => normScore(p) === m.finalScore); if (hit) scoreHits++; setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', hit ? 'hit' : 'miss'); }
setIf(d.score3, 'result', scoreHits === 3 ? 'hit' : scoreHits ? 'half' : 'miss');
if (scoreHits !== 0) throw new Error('比分应 0/3, 实 ' + scoreHits);

/* ⑦ 梦想 5 关(展示): 让球胜平负口径 */
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
if (dreamH !== 1) throw new Error('梦想应 1/5, 实 ' + dreamH);

/* ⑧ bank + 回收构成 */
const ret = earlyRet;
setIf(d.bank, 'stake', 196);
setIf(d.bank, 'ret', +ret.toFixed(2));
setIf(d.bank, 'net', +(ret - 196).toFixed(2));
setIf(d.bank, 'detail', '早场北单 4 关全红名义回 ' + ret.toFixed(2) + '(080 平 3.16×083 让平 3.88×084 平 3.45×085 让平 3.75×2 元, 浮动 SP 以官方开奖为准); 混选 4 关/大小 2 串/夜场北单/深夜北单/早场亚盘/深夜亚盘全灭。');

/* ⑨ plan 卡 */
setCard('🎯 胜平负', 'push');
setCard('🔵 双选方向', 'miss');
setCard('🌏 亚洲让球', 'miss');
setCard('🟣 大小盘', 'miss');
setCard('🏅 比分', 'miss');
setCard('🀄 北单310', 'half');
setCard('🌍 胜负彩', 'miss');
setCard('💰 投注建议', 'hit');

/* ⑩ 足彩26163(挂 11-13): 余 6 场定格 */
if (d13 && d13.zucai310) {
  const z = d13.zucai310;
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
  if (nH !== 3 || nM !== 3) throw new Error('26163 余场判定异常 ' + nH + '/' + nM);
  const allH = z.legs.filter(l => l.result === 'hit').length, allM = z.legs.filter(l => l.result === 'miss').length;
  if (allH !== 8 || allM !== 6) throw new Error('26163 总数异常 ' + allH + '/' + allM);
  setIf(z, 'result', 'miss');
  setIf(z, 'note', (z.note || '') + '【11-16 定格】14 场全齐 8红6黑(余 6 场: 芬兰 7-2/比利时 4-1/克罗地亚 2-1 红, 塞浦路斯 1-4/拉脱维亚 0-0/西班牙 2-3 黑), 64 注票与任九早已灭, 官方开奖公告仅作记录不再影响账目。');
  if (z.rensuan9) setIf(z.rensuan9, 'result', 'miss');
}

/* ⑪ review 正文 */
const review = '【11-15 终审】15 场全齐。有效方向 10 场(弃选 5 场): 方向 2红8黑(红=002 鹿岛 3-2/011 比利时 4-1 战意兑现; 黑=001/003 双平场主胜黑/004 跟资金川崎 5-4 被翻/005 维特斯/007 塞浦路斯 1-4/008 芬兰 7-2 穿让 4/010 西班牙 2-3 43 场不败终结/092 格拉纳达 1-0)·双选 4红5黑(001/003 两平全罩)·0 胆 0 单选 push。' +
  '★弃选 5 场: 避黑 2(088 特内里费 2-0 主穿/095 埃瓦尔 1-1 资金侧红)+代价 1(009 克罗地亚 2-1 主胜本红, 资金侧捷克+1 走水)+中性 2(006 闷平/094 基本面红资金黑)。' +
  '主产品: 🀄北单腿池 7红4黑, **早场 4 关 32 元全红(080/083/084/085 四平让平, 名义回 317.25)**=全天唯一活票救主; 夜场 3 关(×4 倍投 32)/深夜 4 关 32 全灭(090/094 断缆); 🌏亚盘腿池 3红1半红6黑, 早场 3 腿(鹿岛红/樱花半红/川崎黑)与深夜 3 腿(加的斯红/圣马力诺/西班牙黑)双灭; 🟣大小 2 串断(007 塞浦路斯 1-4 打穿小 2.5, 006 小 2.25 红)=双证口径首黑; 🏅比分 0/3; 混选 4 关灭(005/010 断); 梦想 5 关 1红4黑。' +
  '💰196 回 317.25(名义) 净 **+121.25**。足彩 26163 定格 14 场 8红6黑(新补: 芬兰/比利时/克罗地亚红), 票与任九早已灭。' +
  '★复盘核心: ①方向层暗夜(2/10)靠一张全红北单票盈利=串关分散的结构价值, V4.11 集中与分散边界需再校准; ②"零战意=闷场"假设黑山场翻车(黑山进 4 球), 闷场结构须联赛分层; ③西班牙 43 场不败终结+芬兰穿 -4 深盘=贪狼忌日防守局只在早场兑现(001/003 双平), 深夜反成大比分夜(5-4/4-1/2-3); ④跟资金 1红2黑(川崎 5-4 被翻最痛), 高水热门反向信号单日失效。';
setIf(d, 'review', review);

if (process.env.DRY === '1') {
  console.log('DRY ok: 方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', '早场回收', earlyRet.toFixed(2), 'bank', JSON.stringify(d.bank), 'touched', touched);
  process.exit(0);
}
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ 终审落地, touched=' + touched, '方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', 'bank.net', d.bank.net);
