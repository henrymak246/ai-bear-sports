/* tools/_research_factors.js — 四因素准确率对比研究(2026-11-16, 用户拍板)
   口径: 全量 99 天已赛场; 命中=90 分钟赛果与判定库一致。
   ① 资金面 = ahPick 腿(全部站资金侧, 540 场) + 「跟资金」方向场(V4.8 后, sy 含跟资金)
   ② agent-reach 网络意见 = note 含「外部:」的场, 解析外部侧向(2-1主/客XX%/看X队)测外部命中率;
      并按「与外部同向/反向」分层看我们方向命中率
   ③ 消息面 = note 含伤停/战意/轮休/缺阵/复出关键词的场, 方向命中率 vs 无消息面场
   ④ 玄学 = dayNote 侧向(支克干=客侧/干克支·支生干=主侧), 按日测该日侧向胜率和按场测同侧双选命中
   基线 = 全量方向命中率/双选命中率。 */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'stats.js'));
const J = require(path.join(__dirname, '..', 'miniprogram', 'utils', 'judge.js'));
const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));

const INFO_RE = /伤停|伤缺|战意|轮休|缺阵|复出|停赛|伤病|轮换/;
const SIDE_RE = { '支克干': '客', '干克支': '主', '支生干': '主' };

function dirHit(m) { const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap); return v === null ? null : v === 1; }
function dblHit(m) {
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v === null) return null;
  const s = S.parseScore(m.finalScore);
  return v === 1 || s.home === s.away;
}
function ahHit(m) {
  const team = J.ahTeamOf(m.ahPick);
  const side = m.home.includes(team) || team.includes(m.home) ? 'home' : 'away';
  return J.judgeAh(m.ahPick, m.finalScore, side);
}
function extSide(note) {
  const t = String(note || '').match(/外部[:：]([^。]*)/);
  if (!t) return null;
  const s = t[1];
  let m2 = s.match(/\d+[-:]\d+\s*(主|客)/); if (m2) return m2[1];
  m2 = s.match(/(主|客)\s*\d+%/); if (m2) return m2[1];
  m2 = s.match(/(主|客)胜/); if (m2) return m2[1];
  return null;
}
const pct = (h, n) => n ? (100 * h / n).toFixed(1) + '%' : '—';

let baseN = 0, baseH = 0, dblN = 0, dblH = 0;
let ahN = 0, ahW = 0, ahWH = 0, ahP = 0, ahL = 0;
let fundN = 0, fundH = 0;
let extN = 0, extH = 0, sameN = 0, sameH = 0, diffN = 0, diffH = 0, extParsed = 0;
let infoN = 0, infoH = 0, noinfoN = 0, noinfoH = 0;
let infoDblN = 0, infoDblH = 0, noinfoDblN = 0, noinfoDblH = 0;
const xj = { 主: { dayN: 0, sideWin: 0, pickN: 0, pickH: 0 }, 客: { dayN: 0, sideWin: 0, pickN: 0, pickH: 0 } };
let xjDays = 0;

for (const d of days) {
  const note = d.dayNote || '';
  let xjSide = null;
  for (const k of Object.keys(SIDE_RE)) if (note.includes(k)) { xjSide = SIDE_RE[k]; break; }
  let daySideMatches = 0, daySideWin = 0;
  for (const m of d.matches || []) {
    if (!m.finalScore) continue;
    const v = dirHit(m);
    if (v !== null) { baseN++; if (v) baseH++; }
    const dv = dblHit(m);
    if (dv !== null && String(m.dirTag || '').includes('双选')) { dblN++; if (dv) dblH++; }
    // ① 资金面 ahPick
    if (m.ahPick) {
      const r = ahHit(m);
      if (r) { ahN++; if (r === 'win') ahW++; else if (r === 'winHalf') ahWH++; else if (r === 'push') ahP++; else ahL++; }
    }
    // ①b 跟资金方向场
    if (/跟资金/.test(m.synthesis || '') && v !== null) { fundN++; if (v) fundH++; }
    // ② 外部意见
    const es = extSide(m.note);
    if (es) {
      extParsed++;
      const s = S.parseScore(m.finalScore);
      const actual = s.home > s.away ? '主' : s.home < s.away ? '客' : '平';
      extN++; if (actual === es) extH++;
      if (v !== null) {
        const our = m.direction === '主胜' ? '主' : m.direction === '客胜' ? '客' : null;
        if (our === es) { sameN++; if (v) sameH++; }
        else if (our) { diffN++; if (v) diffH++; }
      }
    }
    // ③ 消息面
    const hasInfo = INFO_RE.test(m.note || '');
    if (v !== null) { if (hasInfo) { infoN++; if (v) infoH++; } else { noinfoN++; if (v) noinfoH++; } }
    if (dv !== null && String(m.dirTag || '').includes('双选')) { if (hasInfo) { infoDblN++; if (dv) infoDblH++; } else { noinfoDblN++; if (dv) noinfoDblH++; } }
    // ④ 玄学: 该日侧向+该场方向在同侧的双选命中
    if (xjSide && String(m.dirTag || '').includes('双选') && dv !== null) {
      const ourSide = m.direction === '主胜' ? '主' : m.direction === '客胜' ? '客' : null;
      if (ourSide === xjSide) { xj[xjSide].pickN++; if (dv) xj[xjSide].pickH++; }
    }
    // ④ 玄学: 该日侧向实际胜率
    if (xjSide) {
      const s = S.parseScore(m.finalScore);
      const actual = s.home > s.away ? '主' : s.home < s.away ? '客' : '平';
      if (actual !== '平') { daySideMatches++; if (actual === xjSide) daySideWin++; }
    }
  }
  if (xjSide && daySideMatches >= 3) { xjDays++; xj[xjSide].dayN++; if (daySideWin > daySideMatches / 2) xj[xjSide].sideWin++; }
}

console.log('======== 四因素准确率对比(99 天, ' + baseN + ' 场有效方向) ========');
console.log('【基线】方向命中 ' + pct(baseH, baseN) + ' (' + baseH + '/' + baseN + ') · 双选命中 ' + pct(dblH, dblN) + ' (' + dblH + '/' + dblN + ')');
console.log('');
console.log('【① 资金面】ahPick 腿池 ' + ahN + ' 场: 红 ' + ahW + ' · 半红 ' + ahWH + ' · 走 ' + ahP + ' · 黑 ' + ahL
  + ' ⇒ 全红率 ' + pct(ahW, ahN) + ' · 不亏率(红+半红+走) ' + pct(ahW + ahWH + ahP, ahN));
console.log('        V4.8 跟资金方向场: ' + pct(fundH, fundN) + ' (' + fundH + '/' + fundN + ')');
console.log('');
console.log('【② agent-reach 网络意见】可解析外部侧向 ' + extParsed + ' 场: 外部自身命中 ' + pct(extH, extN) + ' (' + extH + '/' + extN + ')');
console.log('        我们方向与外部同向时: ' + pct(sameH, sameN) + ' (' + sameH + '/' + sameN + ') · 反向时: ' + pct(diffH, diffN) + ' (' + diffH + '/' + diffN + ')');
console.log('');
console.log('【③ 消息面】有伤停/战意等 note 场: 方向 ' + pct(infoH, infoN) + ' (' + infoH + '/' + infoN + ') · 双选 ' + pct(infoDblH, infoDblN) + ' (' + infoDblH + '/' + infoDblN + ')');
console.log('        无消息面 note 场: 方向 ' + pct(noinfoH, noinfoN) + ' (' + noinfoH + '/' + noinfoN + ') · 双选 ' + pct(noinfoDblH, noinfoDblN) + ' (' + noinfoDblH + '/' + noinfoDblN + ')');
console.log('');
console.log('【④ 玄学五式侧向】有侧向 ' + xjDays + ' 天:');
console.log('        主侧日: 侧向兑现(主胜率>50%) ' + xj.主.sideWin + '/' + xj.主.dayN + ' 天 · 主侧双选命中 ' + pct(xj.主.pickH, xj.主.pickN) + ' (' + xj.主.pickH + '/' + xj.主.pickN + ')');
console.log('        客侧日: 侧向兑现(客胜率>50%) ' + xj.客.sideWin + '/' + xj.客.dayN + ' 天 · 客侧双选命中 ' + pct(xj.客.pickH, xj.客.pickN) + ' (' + xj.客.pickH + '/' + xj.客.pickN + ')');
