/* _uk1021_data.js — 10-21 凌晨英系 25 场数据提取: 北单SP(bd500_1021) + 出奇亚盘/欧赔(_cq_odds_snap_1021_0002.json)
   输出 _uk1021_data.json 供 _patch1021_uk.js 建日用 */
'use strict';
const fs = require('fs');
const path = require('path');

const cq = require('./cq_1021.json');
const bdRaw = fs.readFileSync(path.join(__dirname, 'bd500_1021.json'), 'utf8');
const bd = JSON.parse(bdRaw.slice(bdRaw.indexOf('[')));
const oddsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '_cq_odds_snap_1021_0002.json'), 'utf8'));

// 盘口索引(与 _ah_moves 同款)
const ahByOddsId = {};
for (const r of oddsRaw.data['odds.ah'].data) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
const x2ByOddsId = {};
for (const r of oddsRaw.data['odds.1x2'].data) (x2ByOddsId[r[0]] = x2ByOddsId[r[0]] || []).push(r);
const byEvent = {};
for (const r of oddsRaw.data.odds.data) {
  if ([2, 5, 26].includes(r[4])) {
    (byEvent[r[3]] = byEvent[r[3]] || {});
    (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
  }
}
const NAME = { 0: '平手', 0.25: '平/半', 0.5: '半球', 0.75: '半/一', 1: '一球', 1.25: '一/球半', 1.5: '球半', 1.75: '球半/两', 2: '两球', 2.25: '两/两球半', 2.5: '两球半', 2.75: '两球半/三', 3: '三球' };
const lineName = (h) => h === 0 ? '平手' : (h > 0 ? (NAME[Math.abs(h)] || Math.abs(h) + '球') : '受' + (NAME[Math.abs(h)] || Math.abs(h) + '球'));

function pickAh(ev) {
  const supMap = byEvent[ev] || {};
  for (const sup of [2, 5, 26]) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of ahByOddsId[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = (mask) => rows.filter((a) => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    for (const pool of [sel(0x110), sel(0x130)]) {
      if (pool.length) { const a = pool[pool.length - 1]; return { h: a[1], home: +(1 + a[2]).toFixed(2), away: +(1 + a[3]).toFixed(2) }; }
    }
  }
  return null;
}
function pickX2(ev) { // 欧赔: 澳彩优先, [id, 主, 平, 客, ...]? 探结构
  const supMap = byEvent[ev] || {};
  for (const sup of [2, 5, 26]) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of x2ByOddsId[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = (mask) => rows.filter((a) => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    for (const pool of [sel(0x110), sel(0x130)]) {
      if (pool.length) { const a = pool[pool.length - 1]; return a; }
    }
  }
  return null;
}

// 英系场: 北单 4-27/35(cq_1021)
const targets = cq.matches.filter(m => m.lottery === '北单' && /英格兰|苏格兰/.test(m.league || '') && (m.time || '').startsWith('2026-10-21 '));
const out = [];
for (const m of targets) {
  const bdRow = bd.find(x => Number(x.num) === Number(m.number));
  const ah = pickAh(m.eventId);
  const x2 = pickX2(m.eventId);
  out.push({
    bdNum: String(m.number), league: m.league.replace(/英格兰冠军联赛/, '英冠').replace(/英格兰甲组联赛/, '英甲').replace(/英格兰乙组联赛/, '英乙').replace(/苏格兰冠军联赛/, '苏冠'),
    time: m.time.slice(11), home: m.home, away: m.away, eventId: m.eventId,
    handicap: bdRow ? bdRow.handicap : null, sp: bdRow ? bdRow.sp : null, spv: bdRow ? bdRow.spv : null,
    ah: ah ? { goals: String(ah.h), name: lineName(ah.h), home: ah.home.toFixed(2), away: ah.away.toFixed(2) } : null,
    x2: x2 ? x2.slice(1, 4) : null,
  });
}
fs.writeFileSync(path.join(__dirname, '_uk1021_data.json'), JSON.stringify(out, null, 1));
console.log('提取 ' + out.length + ' 场');
out.forEach(m => console.log(`北单${m.bdNum} ${m.league} ${m.home}vs${m.away} | 北单让${m.handicap} sp=${m.sp ? m.sp.join('/') : '无'} | 亚盘=${m.ah ? m.ah.name + ' ' + m.ah.home + '/' + m.ah.away : '无'} | 欧=${m.x2 ? m.x2.join('/') : '无'}`));
