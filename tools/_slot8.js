/* tools/_slot8.js — 三时段8拖共用结构/校验(2026-11-08起)
   早场=06:00-17:59, 夜场=18:00-23:59, 深夜=次日00:00-05:59。 */
'use strict';
const SLOTS = ['early', 'night', 'late'];
function slotOf(time) {
  const m = String(time || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  return h < 6 ? 'late' : h < 18 ? 'early' : 'night';
}
function makeAsian(legs) {
  const numeric = legs.every(l => Number.isFinite(Number(l.odds)) && Number(l.odds) > 0);
  return { legs, cost: 2, totalOdds: numeric ? legs.reduce((n, l) => n * Number(l.odds), 1).toFixed(1) : '待补', result: null };
}
function makeBeidan(issue, legs, unit) {
  const doubles = legs.filter(l => String(l.pick).includes('/')).length;
  if (legs.some(l => !String(l.pick).includes('/') && String(l.handicap || '0') !== '0')) throw new Error('北单让球场禁单选');
  const u = unit == null ? 2 : unit;
  return { issue, legs, stakes: 2 ** doubles, unit: u, cost: 2 ** doubles * u, result: null };
}
function validateSlot8(day) {
  const errors = [];
  for (const slot of SLOTS) {
    const b = day.slot8 && day.slot8[slot];
    if (!b) { errors.push(slot + '缺slot8'); continue; }
    const asianMatches = new Set();
    for (const l of b.asian.legs || []) {
      const m = (day.matches || []).find(x => x.id === l.id);
      if (!m) errors.push(slot + '亚盘腿无场次 ' + l.id);
      else if (slotOf(m.time) !== slot) errors.push(slot + '亚盘腿时段错误 ' + l.id + '=' + m.time);
      const key = l.id || String(l.match || '').slice(0, 3);
      if (asianMatches.has(key)) errors.push(slot + '混编票同一场重复 ' + key + '(让球/大小球只能保留一个)');
      asianMatches.add(key);
    }
    for (const l of b.beidan.legs || []) {
      if (!l.bdNum || !l.pick) errors.push(slot + '北单腿字段缺失');
      if (!String(l.pick).includes('/') && String(l.handicap || '0') !== '0') errors.push(slot + '北单让球场单选 ' + l.bdNum);
    }
    const expected = 2 ** (b.beidan.legs || []).filter(l => String(l.pick).includes('/')).length;
    const unit = b.beidan.unit == null ? 2 : b.beidan.unit; // 2026-11-12 起支持每注 6 元(单位由建日声明)
    if (b.beidan.stakes !== expected || b.beidan.cost !== expected * unit) errors.push(slot + '北单注数/金额错误');
  }
  return errors;
}
function judgeOu(pick, finalScore) {
  const J = require('../miniprogram/utils/judge.js');
  const s = J.parseScore(finalScore), m = String(pick || '').match(/^([大小])\s*(\d+(?:\.\d+)?)/);
  if (!s || !m) return null;
  const side = m[1], line = Number(m[2]), goals = s.home + s.away;
  const lines = Math.round(line * 100) % 50 === 25 ? [line - 0.25, line + 0.25] : [line];
  let w = 0, l = 0, p = 0;
  for (const L of lines) {
    const dv = goals - L, r = dv === 0 ? 0 : side === '大' ? (dv > 0 ? 1 : -1) : (dv > 0 ? -1 : 1);
    if (r > 0) w++; else if (r < 0) l++; else p++;
  }
  if (!l && !p) return 'win'; if (!w && !p) return 'lose'; if (!w && !l) return 'push';
  return w ? 'winHalf' : 'loseHalf';
}
function settleSlot8(day) {
  const J = require('../miniprogram/utils/judge.js');
  let changed = 0;
  for (const slot of SLOTS) {
    const b = day.slot8 && day.slot8[slot]; if (!b) continue;
    for (const l of b.asian.legs || []) {
      const m = (day.matches || []).find(x => x.id === l.id), score = m && m.finalScore;
      if (!score || l.result) continue;
      if (/^[大小]\s*\d/.test(l.pick)) l.result = judgeOu(l.pick, score);
      else {
        const team = J.ahTeamOf(l.pick), side = m.home.includes(team) || team.includes(m.home) ? 'home' : 'away';
        l.result = J.judgeAh(l.pick, score, side);
      }
      l.finalScore = score; if (l.result) changed++;
    }
    for (const l of b.beidan.legs || []) {
      const m = (day.matches || []).find(x => String(l.match || '').startsWith(String(x.id).slice(-3) + ' '))
        || (day.matches || []).find(x => String(l.match || '').indexOf(x.home) >= 0);
      const score = l.finalScore || (m && m.finalScore);
      if (!score || l.result) continue;
      l.result = J.judgeBd310(l.pick, l.handicap, score); l.finalScore = score; changed++;
    }
    const al = b.asian.legs || [], bl = b.beidan.legs || [];
    if (al.length && al.every(l => l.result)) b.asian.result = al.every(l => l.result === 'win') ? 'hit' : 'miss';
    if (bl.length && bl.every(l => l.result)) b.beidan.result = bl.every(l => l.result === 'hit') ? 'hit' : 'miss';
  }
  return changed;
}
module.exports = { SLOTS, slotOf, makeAsian, makeBeidan, validateSlot8, judgeOu, settleSlot8 };
