/* _cq_odds_check_1021.js — 只读: 抓出奇盘口临场版(20:4x) 与 18:1x 快照(_cq_odds_raw_1020b.json) 对比 8 场水位/盘口变化
   用法: node tools/_cq_odds_check_1021.js  (不写 predictions.js) */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
const REFERER = 'https://live.chuqi.com/football/freecall';
const ODDS_URL = 'https://d.botidata8.com/odds/data?scheme=1&virtual=1&ps=0&choose=9984&special=true';
const SUP_ORDER = [2, 5, 26];
const SUP_NAME = { 2: '澳彩', 5: '365', 26: '伟德' };

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, 'Referer': REFERER, 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (res.headers['content-encoding'] === 'gzip') buf = require('zlib').gunzipSync(buf);
        resolve(buf);
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('超时')));
  });
}

function indexRaw(oddsRaw) {
  const ahByOddsId = {};
  for (const r of oddsRaw.data['odds.ah'].data) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
  const byEvent = {};
  for (const r of oddsRaw.data.odds.data) {
    if (SUP_ORDER.includes(r[4])) {
      (byEvent[r[3]] = byEvent[r[3]] || {});
      (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
    }
  }
  // 欧赔 1x2
  const x2ByOddsId = {};
  const x2Table = oddsRaw.data['odds.1x2'];
  if (x2Table && x2Table.data) for (const r of x2Table.data) (x2ByOddsId[r[0]] = x2ByOddsId[r[0]] || []).push(r);
  return { ahByOddsId, byEvent, x2ByOddsId };
}

function pickAh(idx, eventId) {
  const supMap = idx.byEvent[eventId] || {};
  for (const sup of SUP_ORDER) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of idx.ahByOddsId[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = (mask) => rows.filter((a) => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    for (const pool of [sel(0x110), sel(0x130)]) {
      if (pool.length) {
        const a = pool[pool.length - 1];
        return { h: a[1], win: a[2], lost: a[3], t: (pool === sel(0x110) ? '即时' : '初盘') + '(' + SUP_NAME[sup] + ')' };
      }
    }
  }
  return null;
}

async function main() {
  // 场次→eventId: 用 cq_1021.json
  const cq = JSON.parse(fs.readFileSync(path.join(__dirname, 'cq_1021.json'), 'utf8'));
  const evOfLabel = {};
  for (const m of cq.matches) if (m.lottery === '竞彩' && m.label) evOfLabel[m.label] = m.eventId;

  const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));
  const day = days.find((d) => d.date === '2026-10-21');
  if (!day) { console.error('无 10-21'); process.exit(1); }

  const oldRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '_cq_odds_raw_1020b.json'), 'utf8'));
  const oldIdx = indexRaw(oldRaw);

  console.log('抓出奇盘口临场版…');
  const newBuf = await get(ODDS_URL);
  fs.writeFileSync(path.join(__dirname, '_cq_odds_raw_1021_eve.json'), newBuf);
  const newIdx = indexRaw(JSON.parse(newBuf));

  console.log('场次 | 18:1x 盘口 主/客 | 临场 盘口 主/客 | 变化');
  for (const m of day.matches) {
    const ev = evOfLabel[m.id];
    if (!ev) { console.log(`${m.id} ${m.home}vs${m.away}: 无eventId`); continue; }
    const o = pickAh(oldIdx, ev);
    const n = pickAh(newIdx, ev);
    const fmt = (x) => x ? `${x.h} ${(1 + x.win).toFixed(2)}/${(1 + x.lost).toFixed(2)}[${x.t}]` : '无';
    let chg = '';
    if (o && n) {
      if (o.h !== n.h) chg += `盘口 ${o.h}→${n.h} `;
      const dh = ((1 + n.win) - (1 + o.win)).toFixed(2);
      const da = ((1 + n.lost) - (1 + o.lost)).toFixed(2);
      chg += `主水 ${dh >= 0 ? '+' : ''}${dh} 客水 ${da >= 0 ? '+' : ''}${da}`;
    }
    console.log(`${m.id} ${m.home}vs${m.away} | ${fmt(o)} | ${fmt(n)} | ${chg}`);
  }
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
