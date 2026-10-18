/* _patch1019_ah.js — 10-19 深夜窗口 23 场亚盘盘口回填(出奇 odds 通道首用)
   数据源: tools/_cq_odds_raw.json = https://d.botidata8.com/odds/data?scheme=1&virtual=1&ps=0&choose=9984&special=true
          (2026-10-19 04:17 抓取; 出奇/初盘 赔率挂件渠道 choose=9984, 与比分挂件 458783 不同)
   结构: odds 表[id,gameid,groupid,eventid,supplierid,source,gameflags,rank,flags]
         odds.ah 表[oddsid,handicap,win,lost,flags]  win/lost=0.xx 纯水位
         flags: 0x130/0x131=初盘(主队盘/客队盘) 0x110/0x111=即时盘 0x410/0x411=滚球; &1=客队盘视角
   口径: 取澳彩(supplierid=2)主队盘, 即时(0x110)优先, 缺则初盘(0x130); 主队盘缺则客队盘镜像(h取负, 水对调);
         写入 ah={goals,name,home,away}, 水位统一 +1 成十进制(与 10-17/18 澳客口径一致, 如 0.86→1.86)
   用法: node tools/_patch1019_ah.js → 幂等写入 data/predictions.js 的 2026-10-19 日(按 id 北单NNN 匹配) */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'predictions.js');
const src = fs.readFileSync(file, 'utf8');
const days = eval('(' + src.slice(src.indexOf('['), src.lastIndexOf('];')) + ']' + ')');
const day = days.find(d => d.date === '2026-10-19');
if (!day) { console.error('未找到 2026-10-19 日'); process.exit(1); }

const oddsRaw = JSON.parse(fs.readFileSync(path.join(__dirname, '_cq_odds_raw.json'), 'utf8'));
const oddsTbl = oddsRaw.data.odds;
const ahTbl = oddsRaw.data['odds.ah'];

// eventid → 供应商 → [oddsId]; 澳彩(2)优先, 365(5)/伟德(26)兜底
const ahByOddsId = {};
for (const r of ahTbl.data) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
const SUP_ORDER = [2, 5, 26];
const byEvent = {};
for (const r of oddsTbl.data) {
  if (SUP_ORDER.includes(r[4])) {
    (byEvent[r[3]] = byEvent[r[3]] || {});
    (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
  }
}

// 北单号 → eventid(出奇北单期 26105 = 10-19 深夜窗口)
const cq = JSON.parse(fs.readFileSync(path.join(__dirname, 'cq_1019.json'), 'utf8'));
const evOf = {};
for (const m of cq.matches) {
  if (m.lottery === '北单' && m.period === 26105) evOf[Number(m.number)] = m.eventId;
}

const NAME = { 0: '平手', 0.25: '平手/半球', 0.5: '半球', 0.75: '半球/一球', 1: '一球', 1.25: '一球/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两球/两球半', 2.5: '两球半', 2.75: '两球半/三球', 3: '三球', 3.25: '三球/三球半', 3.5: '三球半', 3.75: '三球半/四球', 4: '四球' };
function lineName(h) {
  if (h === 0) return '平手';
  const abs = Math.abs(h);
  const n = NAME[abs] || (abs > 0 ? abs + '球' : '');
  return h > 0 ? n : '受' + n;
}
function w2(w) { return (1 + w).toFixed(2); }

function pickAh(eventId) {
  const supMap = byEvent[eventId] || {};
  // 供应商按 澳彩→365→伟德 兜底
  for (const sup of SUP_ORDER) {
    const ids = supMap[sup] || [];
    const rows = [];
    for (const id of ids) for (const a of ahByOddsId[id] || []) rows.push(a);
    if (!rows.length) continue;
    // 主盘 = flags 偶数列(0x130=初盘主盘 / 0x110=即时主盘); 奇数=附加盘, 不要
    // 即时优先, 缺则初盘; 列表按写入序, 最后一条=最新
    const sel = (mask) => rows.filter(a => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    const isMain = sel(0x110);
    const isInit = sel(0x130);
    for (const pool of [isMain, isInit]) {
      if (pool.length) {
        const a = pool[pool.length - 1];
        return { h: a[1], win: a[2], lost: a[3], t: (pool === isMain ? '即时' : '初盘') + '(' + { 2: '澳彩', 5: '365', 26: '伟德' }[sup] + ')' };
      }
    }
    // 主盘缺失时退附加盘(偶数不存在才用)
    for (const mask of [0x110, 0x130]) {
      const pool = rows.filter(a => (a[4] & ~1) === mask);
      if (pool.length) {
        const a = pool[pool.length - 1];
        return { h: a[1], win: a[2], lost: a[3], t: (mask === 0x110 ? '即时' : '初盘') + '(附加盘,' + { 2: '澳彩', 5: '365', 26: '伟德' }[sup] + ')' };
      }
    }
  }
  return null;
}

let patched = 0;
const missing = [];
for (const m of day.matches) {
  const num = Number(String(m.id).replace('北单', ''));
  const ev = evOf[num];
  if (!ev) { missing.push(m.id + ' 无eventId'); continue; }
  const ah = pickAh(ev);
  if (!ah) { missing.push(m.id + ' ' + m.home + ' 澳彩无盘口'); continue; }
  m.ah = { goals: String(ah.h), name: lineName(ah.h), home: w2(ah.win), away: w2(ah.lost) };
  console.log(`${m.id} ${m.home} vs ${m.away}: ${lineName(ah.h)} 主${w2(ah.win)}/客${w2(ah.lost)} [${ah.t}]`);
  patched++;
}
if (missing.length) console.log('缺失: ' + missing.join(' | '));

// 写回(保留原始头注释, 只重建数组体)
const head = src.slice(0, src.indexOf('['));
const newDays = JSON.stringify(days, null, 2);
fs.writeFileSync(file, head + newDays + ';\nif (typeof module !== 'undefined' && module.exports) module.exports = PREDICTION_DAYS;\n', 'utf8');
console.log('已回填 ' + patched + ' 场 → data/predictions.js');
