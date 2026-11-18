/* tools/_ah_1117.js — 11-17 池澳彩即时盘+大小盘(出奇 11:22 快照)
   15 场: 竞彩周二001-010(001 让球-only)+北单补 004/005/006/007/008(竞彩未开)。
   北单编号以 500.com(bd500_1117)为准, 出奇按队名匹配。用法: node tools/_ah_1117.js */
'use strict';
const fs = require('fs');
const path = require('path');
const NAME = { 0: '平手', 0.25: '平/半', 0.5: '半球', 0.75: '半/一', 1: '一球', 1.25: '一/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两/两球半', 2.5: '两球半', 2.75: '两/三球', 3: '三球', 3.25: '三/三球半', 3.5: '三球半', 4: '四球', 4.5: '四球半', 4.75: '四半/五', 5: '五球' };
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
const latest = indexSnap('_cq_odds_snap_1117_1122.json');
const cq = JSON.parse(fs.readFileSync(path.join(__dirname, 'cq_1117.json'), 'utf8'));
const pool = [
  ['周二001', '新加坡', '巴西'], ['周二002', '中国', '巴林'], ['周二003', '日本', '巴拉圭'],
  ['周二004', '波黑', '罗马尼亚'], ['周二005', '波兰', '瑞典'], ['周二006', '丹麦', '挪威'],
  ['周二007', '威尔士', '葡萄牙'], ['周二008', '匈牙利', '北爱尔兰'], ['周二009', '爱尔兰', '科索沃'],
  ['周二010', '智利', '哥伦比亚'],
  ['北单004', '卡塔尔', '韩国'], ['北单005', '捷克U21', '土耳其U21'], ['北单006', '荷兰U21', '丹麦U21'],
  ['北单007', '爱尔兰U21', '芬兰U21'], ['北单008', '卢顿', '彼得堡联']
];
const out = {};
for (const [id, h, a] of pool) {
  const ev = cq.matches.find(m => !m.played && m.time >= '2026-11-17 12:00' && m.home.includes(h) && m.away.includes(a));
  if (!ev) { console.log('⚠️ 出奇未找到', id, h, 'vs', a); continue; }
  out[id] = { home: ev.home, away: ev.away, time: ev.time, eventId: ev.eventId, ah: shape(latest, ev.eventId, false), ou: shape(latest, ev.eventId, true) };
}
fs.writeFileSync(path.join(__dirname, '_ah_1117.json'), JSON.stringify(out, null, 1), 'utf8');
console.log('✓ ' + Object.keys(out).length + ' 场 → _ah_1117.json');
for (const [k, v] of Object.entries(out)) {
  console.log(k, v.home + ' vs ' + v.away,
    '| AH', v.ah ? v.ah.name + ' ' + v.ah.home + '/' + v.ah.away : '无',
    '| OU', v.ou ? v.ou.line + ' ' + v.ou.over + '/' + v.ou.under : '无');
}
