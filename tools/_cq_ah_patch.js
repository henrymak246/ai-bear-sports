/* _cq_ah_patch.js — 出奇赔率通道: 给指定日期的场次补写亚盘盘口(澳彩主盘) —— 2026-10-19 建成
   背景: 球探 WAF 九天+澳客日历页开赛后下架+?date= 被 405 ⇒ 深夜/北单窗口的已开赛场次盘口无处可查;
         出奇 d.botidata8.com 赔率挂件渠道 choose=9984 的 /odds/data 全量盘口表可查(含已开赛),
         澳彩即时盘(0x110)/初盘(0x130) 主盘=偶数列, 已实测与澳客日历数值一致(河床 1.94/1.84 vs 1.95/1.83)。
   用法: node tools/_cq_ah_patch.js <YYYY-MM-DD> [--dry-run] [--snapshot <cq_<MMDD>.json>]
   步骤: ① 读(或抓)出奇比分快照 cq_<MMDD>.json 建 场次→eventId(北单号/竞彩 label/队名对)
         ② 抓 /odds/data?scheme=1&virtual=1&ps=0&choose=9984&special=true 缓存 _cq_odds_raw_<MMDD>.json
         ③ 对当日每场: 澳彩(2)→365(5)→伟德(26) 兜底, 即时主盘(flags&~1==0x110 且偶数)→初盘(0x130)
         ④ 写 ah={goals,name,home,away}(水位+1 成十进制, 与 10-17/18 澳客口径一致)
   注意: 幂等(已有 ah 且 --force 未传则跳过); 低频使用, 勿高频轮询。 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0';
const REFERER = 'https://live.chuqi.com/football/freecall';
const ODDS_URL = 'https://d.botidata8.com/odds/data?scheme=1&virtual=1&ps=0&choose=9984&special=true';
const SUP_ORDER = [2, 5, 26];
const SUP_NAME = { 2: '澳彩', 5: '365', 26: '伟德' };
const NAME = { 0: '平手', 0.25: '平手/半球', 0.5: '半球', 0.75: '半球/一球', 1: '一球', 1.25: '一球/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两球/两球半', 2.5: '两球半', 2.75: '两球半/三球', 3: '三球', 3.25: '三球/三球半', 3.5: '三球半', 3.75: '三球半/四球', 4: '四球' };
const lineName = (h) => h === 0 ? '平手' : (h > 0 ? (NAME[Math.abs(h)] || Math.abs(h) + '球') : '受' + (NAME[Math.abs(h)] || Math.abs(h) + '球'));

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

async function main() {
  const args = process.argv.slice(2);
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const dry = args.includes('--dry-run');
  const force = args.includes('--force');
  if (!date) { console.error('用法: node tools/_cq_ah_patch.js <YYYY-MM-DD> [--dry-run] [--force]'); process.exit(1); }
  const mmdd = date.slice(5).replace('-', '');

  const file = path.join(__dirname, '..', 'data', 'predictions.js');
  const src = fs.readFileSync(file, 'utf8');
  const head = src.slice(0, src.indexOf('['));
  const days = eval('(' + src.slice(src.indexOf('['), src.lastIndexOf('];')) + ']' + ')');
  const day = days.find((d) => d.date === date);
  if (!day) { console.error('predictions.js 无 ' + date + ' 日'); process.exit(1); }

  // ① 比分快照(场次→eventId)
  let cqFile = path.join(__dirname, 'cq_' + mmdd + '.json');
  if (!fs.existsSync(cqFile)) {
    console.log('无 ' + cqFile + ', 抓出奇比分快照…');
    const qs = `?scheme=1&ps=5000&choose=458783&virtual=1&lottery=true`;
    const buf = await get('https://d.botidata8.com/score/data' + qs);
    fs.writeFileSync(cqFile, buf);
  }
  const cq = JSON.parse(fs.readFileSync(cqFile, 'utf8'));
  const evOfBd = {};    // 北单号 → eventId
  const evOfLabel = {}; // 竞彩 label(周日022) → eventId
  const evOfPair = {};  // home|away → eventId
  for (const m of cq.matches) {
    if (m.lottery === '北单') evOfBd[Number(m.number)] = m.eventId;
    if (m.lottery === '竞彩' && m.label) evOfLabel[m.label] = m.eventId;
    evOfPair[m.home + '|' + m.away] = m.eventId;
  }

  // ② 盘口全量表(缓存)
  const oddsFile = path.join(__dirname, '_cq_odds_raw_' + mmdd + '.json');
  if (!fs.existsSync(oddsFile)) {
    console.log('抓出奇盘口全量表…');
    fs.writeFileSync(oddsFile, await get(ODDS_URL));
  }
  const oddsRaw = JSON.parse(fs.readFileSync(oddsFile, 'utf8'));
  const ahByOddsId = {};
  for (const r of oddsRaw.data['odds.ah'].data) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
  const byEvent = {};
  for (const r of oddsRaw.data.odds.data) {
    if (SUP_ORDER.includes(r[4])) {
      (byEvent[r[3]] = byEvent[r[3]] || {});
      (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
    }
  }

  function pickAh(eventId) {
    const supMap = byEvent[eventId] || {};
    for (const sup of SUP_ORDER) {
      const rows = [];
      for (const id of supMap[sup] || []) for (const a of ahByOddsId[id] || []) rows.push(a);
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

  // ③ 逐场补写
  let patched = 0, skipped = 0;
  const missing = [];
  for (const m of day.matches) {
    if (m.ah && !force) { skipped++; continue; }
    const num = Number(String(m.id).replace('北单', ''));
    let ev = String(m.id).startsWith('北单') ? evOfBd[num] : (evOfLabel[m.id] || evOfPair[m.home + '|' + m.away]);
    if (!ev) { missing.push(m.id + ' ' + m.home + ' 无eventId'); continue; }
    const ah = pickAh(ev);
    if (!ah) { missing.push(m.id + ' ' + m.home + ' 无盘口'); continue; }
    m.ah = { goals: String(ah.h), name: lineName(ah.h), home: (1 + ah.win).toFixed(2), away: (1 + ah.lost).toFixed(2) };
    console.log(`${m.id} ${m.home} vs ${m.away}: ${lineName(ah.h)} 主${(1 + ah.win).toFixed(2)}/客${(1 + ah.lost).toFixed(2)} [${ah.t}]`);
    patched++;
  }
  if (missing.length) console.log('缺失: ' + missing.join(' | '));
  console.log(`回填 ${patched} / 跳过(已有) ${skipped} / 缺失 ${missing.length}`);

  if (!dry && patched) {
    fs.writeFileSync(file, head + JSON.stringify(days, null, 2) + ";\nif (typeof module !== 'undefined' && module.exports) module.exports = PREDICTION_DAYS;\n", 'utf8');
    console.log('已写回 data/predictions.js(记得跑 sync-data.js + 部署东京)');
  }
}

main().catch((e) => { console.error('ERR', e.message); process.exit(1); });
