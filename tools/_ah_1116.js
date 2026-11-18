/* tools/_ah_1112.js — 11-12 池澳彩即时盘(出奇 10:08 快照)+早盘(03:08 快照)
   11 场: 竞彩周四001-006 + 北单21-31(圣马力诺/巴西乙2/阿甲/中北美, 竞彩未开)。
   用法: node tools/_ah_1111.js */
'use strict';
const fs = require('fs');
const path = require('path');
const NAME = { 0: '平手', 0.25: '平/半', 0.5: '半球', 0.75: '半/一', 1: '一球', 1.25: '一/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两/两球半', 2.5: '两球半', 2.75: '两/三球', 3: '三球', 3.25: '三/三球半', 3.5: '三球半', 3.75: '三/四球', 4: '四球', 4.25: '四/四球半' };
const lineName = h => h === 0 ? '平手' : h > 0 ? (NAME[h] || h + '球') : '受' + (NAME[-h] || -h + '球');
function indexSnap(file) {
  const snap = JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  const oddsData = snap.data.odds.data, ahData = snap.data['odds.ah'].data, ouData = snap.data['odds.ou'].data;
  const ahByOddsId = {}, ouByOddsId = {}, byEvent = {};
  for (const r of ahData) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
  for (const r of ouData) (ouByOddsId[r[0]] = ouByOddsId[r[0]] || []).push(r);
  for (const r of oddsData) if ([2, 5, 26].includes(r[4])) (byEvent[r[3]] = byEvent[r[3]] || {}, (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]));
  return { ahByOddsId, ouByOddsId, byEvent };
}
function pick(snap, byId, eventId) {
  const supMap = snap.byEvent[eventId] || {};
  for (const sup of [2, 5, 26]) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of byId[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = mask => rows.filter(a => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    for (const pool of [sel(0x110), sel(0x130)]) {
      if (pool.length) { const a = pool[pool.length - 1]; return { line: a[1], l: +(1 + a[2]).toFixed(2), r: +(1 + a[3]).toFixed(2) }; }
    }
  }
  return null;
}
function shape(snap, eventId, ou) {
  const byId = ou ? snap.ouByOddsId : snap.ahByOddsId;
  const v = pick(snap, byId, eventId);
  if (!v) return null;
  return ou ? { line: String(v.line), over: String(v.l), under: String(v.r) }
    : { goals: String(v.line), name: lineName(v.line), home: String(v.l), away: String(v.r) };
}
const latest = indexSnap('_cq_odds_snap_1116_1458.json');
const open = indexSnap('_cq_odds_snap_1116_1458.json');
const cq = JSON.parse(fs.readFileSync(path.join(__dirname, 'cq_1116.json'), 'utf8'));
const pool = cq.matches.filter(m => (m.lottery === '竞彩' && String(m.period) === '20261116' && /^周一00[1-8]$/.test(m.label))
  || (m.lottery === '北单' && ['北单105','北单106','北单111'].includes(m.label)));
const out = {};
for (const m of pool) {
  const o = shape(open, m.eventId, false), l = shape(latest, m.eventId, false);
  const oo = shape(open, m.eventId, true), lo = shape(latest, m.eventId, true);
  out[m.label] = { home: m.home, away: m.away, time: m.time, eventId: m.eventId, ah: l, ou: lo, openAh: o, openOu: oo };
}
fs.writeFileSync(path.join(__dirname, '_ah_1116.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('✓ ' + Object.keys(out).length + ' 场 → _ah_1116.json');
for (const [k, v] of Object.entries(out)) {
  console.log(k, v.home + ' vs ' + v.away,
    '| AH', v.ah ? v.ah.name + ' ' + v.ah.home + '/' + v.ah.away : '无',
    v.openAh && v.ah ? '(' + v.openAh.name + ' ' + v.openAh.home + '/' + v.openAh.away + ')' : '',
    '| OU', v.ou ? v.ou.line + ' ' + v.ou.over + '/' + v.ou.under : '无',
    v.openOu && v.ou ? '(' + v.openOu.line + ' ' + v.openOu.over + '/' + v.openOu.under + ')' : '');
}
