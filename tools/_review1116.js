/* tools/_review1116.js — 11-16 池(11场)终审(幂等, 2026-11-17 早; 同日中午北单111 4-1 完场后定格)
   赛果: 东京 watch 8 场 + 本机 _live1116 补 3 场(含北单111 加拿大 4-1), 11/11 全齐。
   ★方向 2红1黑/双选 1红1黑/0胆 push/单选德国 5-0 红(官方 SP 1.69, 50 回 84.5);
     弃选 8 场=避黑 5(001/003/008/106/111)+代价 1(004 冰岛)+中性 2;
     夜场/深夜北单+深夜亚盘+大小+足彩(第 1 腿法罗即断)全灭。
   💰264 回 84.5 净 -179.5。
   DRY=1 只校验打印。 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'stats.js'));
const J = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'judge.js'));
const { settleSlot8, judgeOu } = require('./_slot8.js');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const d = days.find(x => x.date === '2026-11-16');
if (!d) throw new Error('无 2026-11-16');
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

/* ① 方向层(弃选 8 场不计) */
let dirH = 0, dirN = 0, dblH = 0, dblM = 0, ditch = 0;
for (const m of d.matches) {
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v === null) { ditch++; continue; }
  dirN++; if (v === 1) dirH++;
  const s = S.parseScore(m.finalScore), tag = String(m.dirTag || '');
  if (tag.includes('双选')) { const hit = v === 1 || s.home === s.away; hit ? dblH++ : dblM++; }
}
if (dirN !== 3 || dirH !== 2 || dblH !== 1 || dblM !== 1 || ditch !== 8) throw new Error('方向统计异常 ' + [dirH, dirN, dblH, dblM, ditch].join('/'));

/* ② 北单腿池(8腿): 107/110/102/108 红 */
let bdH = 0, bdM = 0;
for (const l of d.beidan310.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  const r = bdResult(l.pick, l.handicap, m.finalScore);
  r.hit ? bdH++ : bdM++;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', r.hit ? 'hit' : 'miss');
}
if (bdH !== 4 || bdM !== 4) throw new Error('腿池统计异常 ' + bdH + '/' + bdM);
setIf(d.beidan310, 'result', 'half');

/* ③ 三时段票: 早场空票, 夜场/深夜北单与深夜亚盘全灭 */
settleSlot8(d);
const night = d.slot8.night.beidan, lateB = d.slot8.late.beidan, lateA = d.slot8.late.asian, early = d.slot8.early.beidan, earlyA = d.slot8.early.asian;
if (early.result !== null || earlyA.result !== null) throw new Error('早场应为空票');
if (night.result !== 'miss' || lateB.result !== 'miss') throw new Error('夜场/深夜北单票态异常 ' + night.result + '/' + lateB.result);
if (lateA.result !== 'miss') throw new Error('深夜亚盘票态异常 ' + lateA.result);

/* ④ 亚盘腿池(8腿, 展示): 德国-0.5 红/塞尔维亚+1.25 半红/塞尔塔B+1 走/危地马拉+2.25 黑 */
for (const l of d.asianPool.legs) {
  const m = findM(l.match); if (!m) throw new Error('腿池找不到 ' + l.match);
  if (!m.finalScore) continue;
  setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', ahResult(l.pick, m));
}
const poolStat = d.asianPool.legs.filter(l => l.result).map(l => l.result).join(',');
if (poolStat !== 'win,lose,winHalf,lose,loseHalf,lose,push,lose') throw new Error('亚盘腿池异常 ' + poolStat);

/* ⑤ 大小 2 串: 001 小 2.25 红(1 球), 007 小 2.25 黑(3 球) */
for (const l of d.ou2.legs) { const m = findM(l.match); setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', judgeOu(l.pick, m.finalScore)); }
setIf(d.ou2, 'result', d.ou2.legs.every(l => l.result === 'win') ? 'hit' : 'miss');
if (d.ou2.result !== 'miss') throw new Error('ou2 应断');

/* ⑥ 比分 3 场×3(展示): 全黑 */
let scoreHits = 0;
for (const l of d.score3.legs) { const m = findM(l.match), hit = l.pick.some(p => normScore(p) === m.finalScore); if (hit) scoreHits++; setIf(l, 'finalScore', m.finalScore); setIf(l, 'result', hit ? 'hit' : 'miss'); }
setIf(d.score3, 'result', scoreHits === 3 ? 'hit' : scoreHits ? 'half' : 'miss');
if (scoreHits !== 0) throw new Error('比分应 0/3, 实 ' + scoreHits);

/* ⑦ 梦想 3 关(展示): 德国-1/斯洛文尼亚+1 红, 苏格兰+1 黑 */
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

/* ⑧ 单选德国(官方封盘 SP 1.69, jc_had_1116 实证) */
const singleRet = +(50 * 1.69).toFixed(2);

/* ⑨ 足彩26165: 前 8 腿已赛 5红3黑, 票灭于第 1 腿(法罗); 后 6 腿(11-17/18)仅作记录 */
{
  const z = d.zucai310;
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
  const judged = z.legs.filter(l => l.result);
  const allH = judged.filter(l => l.result === 'hit').length, allM = judged.filter(l => l.result === 'miss').length;
  if (judged.length !== 8 || allH !== 5 || allM !== 3) throw new Error('26165 前 8 腿判定异常 已判' + judged.length + ' ' + allH + '/' + allM);
  setIf(z, 'result', 'miss');
  setIf(z, 'note', (z.note || '') + '【11-17 补判】前 8 腿已赛 5红3黑(哈萨克平/冰岛/德国/希腊/斯洛文尼亚红; 法罗 1-0/爱沙尼亚 2-1/瑞士 4-0 黑), 64 注票灭于第 1 腿法罗, 任九同灭(法罗/爱沙尼亚拖腿黑); 后 6 腿 11-17/18 仅作记录。注数勘误=实 8单6双 64 注 128 元(原 note 9单5双 32 注系建站期误记, betPlan 已按 144 计)。');
  if (z.rensuan9) setIf(z.rensuan9, 'result', 'miss');
}

/* ⑩ bank + 回收构成(足彩 64 注与任九灭, 串关全灭, 唯一回收=单选) */
setIf(d.bank, 'stake', 264);
setIf(d.bank, 'ret', singleRet);
setIf(d.bank, 'net', +(singleRet - 264).toFixed(2));
setIf(d.bank, 'detail', '单选 006 德国主胜 5-0 红(官方 SP 1.69, 50 回 84.50)=全天唯一回收; 夜场北单 2 关(101 法罗断)/深夜北单 3 关(109 瑞士断)/深夜亚盘 2 腿(苏格兰+0.75 断)/大小 2 串(007 北马其顿 0-3 打穿小 2.25 断)/足彩 26165 64 注+任九(第 1 腿法罗即断)全灭。');
setIf(d.bank, 'summary', '单选德国独红, 串关全灭');

/* ⑪ betPlan 行级 result(判定列口径) */
for (const r of (d.betPlan && d.betPlan.rows) || []) {
  if (/单选/.test(r.name)) { setIf(r, 'result', 'hit'); setIf(r, 'payout', String(singleRet.toFixed(1))); }
  else setIf(r, 'result', 'miss');
}

/* ⑫ plan 卡 */
setCard('🎯 胜平负', 'hit');
setCard('🔵 双选方向', 'half');
setCard('🌏 亚洲让球', 'miss');
setCard('🟣 大小盘', 'miss');
setCard('🏅 比分', 'miss');
setCard('🀄 北单310', 'half');
setCard('🌍 胜负彩', 'miss');
setCard('💰 投注建议', 'miss');

/* ⑬ review 正文 */
const review = '【11-16 终审】11 场全齐(北单111 加拿大 4-1 已补)。有效方向 3 场: 方向 2红1黑(红=006 德国 5-0 屠残阵荷兰/007 斯洛文尼亚 0-3; 黑=005 瑞士 4-0, 降盘+客低水跟资金失灵)·双选 1红1黑·0 胆 push·**单选 006 德国 1.72★2 红(官方 SP 1.69)**=全天唯一产品级命中。' +
  '★弃选 8 场: 避黑 5(001 法罗 1-0/003 爱沙尼亚 2-1[资金反转弃选判对]/008 希腊 1-0/106 阿尔瓦塞特 1-0/111 加拿大 4-1, 互证资金侧全黑)+代价 1(004 冰岛 3-0, strong 真热二次反转不追的代价)+中性 2(002 哈萨克 2-2 双选本罩平/105 希腊U21 1-1 闷平)。' +
  '主产品: 🀄北单腿池 4红4黑(107 德国/110 北马其顿让 1 客/102 平/108 希腊让平红); 夜场北单 2 关(101 断)/深夜北单 3 关(109 断)/深夜亚盘 2 腿(德国-0.5 红·苏格兰+0.75 断)/大小 2 串(001 小红·007 断)全灭; 🌏亚盘腿池 1红1半红5黑1走; 🏅比分 0/3; 梦想 3 关 2红1黑(苏格兰+1 断)。' +
  '🌍足彩 26165 前 8 腿 5红3黑, 64 注票与任九灭于第 1 腿(法罗 1-0 站资金侧客黑), 后 6 腿 11-17/18 仅作记录; 注数勘误=实 8单6双 64 注 128 元(建站期 note 误记 9单5双 32 注, betPlan 已按 144 计)。' +
  '💰264 回 84.5 净 **-179.5**。' +
  '★复盘核心: ①薄日单锚独红串关全灭, 与 11-15(北单全红救主)互为镜像=分散结构两日对冲各兑现一次; ②V4.12 互证口径弃选 8 场避黑 5 代价 1, 弃选纪律单日净正, 唯一明确代价=004 冰岛(strong 真热场二次反转不追); ③005 瑞士「降盘+客低水」跟资金失灵(4-0), 与 092 格拉纳达同类=降盘矛盾信号在深盘主场依旧脆弱, 此类只配「不得逆」不配「跟」; ④006 德国背水+三公司 3/3 全同向=全池最干净信号兑现(5-0), V4.10 主仓 SP≥1.5 单选纪律首日兑现。';
setIf(d, 'review', review);

if (process.env.DRY === '1') {
  console.log('DRY ok: 方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', '单选回收', singleRet, 'bank', JSON.stringify(d.bank), 'touched', touched);
  process.exit(0);
}
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n');
console.log('✓ 终审落地, touched=' + touched, '方向', dirH + '/' + dirN, '双选', dblH + '红' + dblM + '黑', '腿池', bdH + '红' + bdM + '黑', 'bank.net', d.bank.net);
