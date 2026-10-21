// _extract_ah_1022.js — 从 _cq_odds_raw_1022b.json 提取 10 场的亚盘/大小/欧赔(澳彩→365→伟德, 即时→初盘)
'use strict';
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(__dirname + '/_cq_odds_raw_1022b.json', 'utf8'));
const d = j.data;
const EV = {
  '周三004': 14860128, '周三005': 14860200, '周三006': 14614231, '周三007': 14860266,
  '周三008': 14860072, '周三009': 14860106, '周三010': 14860094, '周三011': 14860322,
  '周三012': 14860124, '周三013': 14949800,
};
const SUP = [2, 5, 26];
const SUPN = { 2: '澳彩', 5: '365', 26: '伟德' };
const od = d.odds.data;
const byId = {};   // odds id -> {eventid, sup}
const byEvent = {}; // eventid -> sup -> [odds ids]
od.forEach(r => {
  byId[r[0]] = { eventid: r[3], sup: r[4] };
  if (SUP.includes(r[4])) {
    byEvent[r[3]] = byEvent[r[3]] || {};
    (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
  }
});
const ahBy = {}, x2By = {}, ouBy = {};
for (const r of d['odds.ah'].data) (ahBy[r[0]] = ahBy[r[0]] || []).push(r);
for (const r of d['odds.1x2'].data) (x2By[r[0]] = x2By[r[0]] || []).push(r);
for (const r of d['odds.ou'].data) (ouBy[r[0]] = ouBy[r[0]] || []).push(r);

function pick(rowsBy, eventId, kind) {
  const supMap = byEvent[eventId] || {};
  for (const sup of SUP) {
    let rows = [];
    for (const id of supMap[sup] || []) for (const a of rowsBy[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = (mask) => rows.filter(a => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    const inst = sel(0x110), init = sel(0x130);
    for (const pool of [inst, init]) {
      if (pool.length) {
        const a = pool[pool.length - 1];
        return { row: a, sup, t: pool === inst ? '即时' : '初盘' };
      }
    }
  }
  return null;
}
for (const k in EV) {
  const ah = pick(ahBy, EV[k]);
  const x2 = pick(x2By, EV[k]);
  const ou = pick(ouBy, EV[k]);
  console.log(k,
    '| AH:', ah ? SUPN[ah.sup] + ah.t + ' ' + ah.row[1] + '/' + ah.row[2] + '/' + ah.row[3] : '无',
    '| 1x2:', x2 ? SUPN[x2.sup] + x2.t + ' ' + x2.row[1] + '/' + x2.row[2] + '/' + x2.row[3] : '无',
    '| OU:', ou ? SUPN[ou.sup] + ou.t + ' ' + ou.row[1] + '/' + ou.row[2] + '/' + ou.row[3] : '无');
}
