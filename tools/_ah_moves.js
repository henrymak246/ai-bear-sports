/* _ah_moves.js — 亚盘盘路变动分析(盘路时序 → 庄家意图四象限判读)
   数据源: 本机 tools/_cq_odds_snap_<MMDD>_<HHmm>.json 时间戳快照序列(_cq_odds_relay.js 每小时产出)
           + 兼容历史手动快照 _cq_odds_raw_<MMDD>b.json / _cq_odds_raw_<MMDD>_eve.json(按文件 mtime 入序)
   判读(主队视角, handicap h>0=主队让球, h 增大=升盘):
     升盘+主水降 → 真热上盘(资金实入)   升盘+主水升 → 诱上盘(虚抬不配合)
     降盘+主水升 → 真冷(上盘被弃)       降盘+主水降 → 资金反向下盘
     盘稳+水位单边动≥0.05 → 资金站队方向  全程变动<0.05 → 无明显资金信号
   输出: 终端汇总表; --write 时把 ahMoves={open,latest,dH,dHome,dAway,verdict,snapshots} 幂等写入 match(权威写在本机, 再 _deploy_watch.sh+sync-data.js)。
   用法: node tools/_ah_moves.js 2026-10-21 [--write] */
'use strict';
const fs = require('fs');
const path = require('path');

const NAME = { 0: '平手', 0.25: '平/半', 0.5: '半球', 0.75: '半/一', 1: '一球', 1.25: '一/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两/两球半', 2.5: '两球半', 2.75: '两球半/三', 3: '三球', 3.25: '三/三球半', 3.5: '三球半', 3.75: '三球半/四', 4: '四球' };
const lineName = (h) => h === 0 ? '平手' : (h > 0 ? (NAME[Math.abs(h)] || Math.abs(h) + '球') : '受' + (NAME[Math.abs(h)] || Math.abs(h) + '球'));

function indexRaw(oddsRaw) {
  const ahByOddsId = {};
  for (const r of oddsRaw.data['odds.ah'].data) (ahByOddsId[r[0]] = ahByOddsId[r[0]] || []).push(r);
  const byEvent = {};
  for (const r of oddsRaw.data.odds.data) {
    if ([2, 5, 26].includes(r[4])) {
      (byEvent[r[3]] = byEvent[r[3]] || {});
      (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
    }
  }
  return { ahByOddsId, byEvent };
}

/* 取某快照内某场的澳彩盘口: 即时主盘(0x110 偶数) 优先, 无则初盘(0x130) */
function pickAh(idx, eventId) {
  const supMap = idx.byEvent[eventId] || {};
  for (const sup of [2, 5, 26]) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of idx.ahByOddsId[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = (mask) => rows.filter((a) => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    for (const pool of [sel(0x110), sel(0x130)]) {
      if (pool.length) { const a = pool[pool.length - 1]; return { h: a[1], home: +(1 + a[2]).toFixed(2), away: +(1 + a[3]).toFixed(2), live: pool === sel(0x110) }; }
    }
  }
  return null;
}

function verdictOf(open, latest) {
  const dH = +(latest.h - open.h).toFixed(2);
  const dHome = +(latest.home - open.home).toFixed(2);
  const dAway = +(latest.away - open.away).toFixed(2);
  if (dH > 0 && dHome <= -0.04) return { dH, dHome, dAway, verdict: `升盘降水(主让加深 ${lineName(open.h)}→${lineName(latest.h)}, 主水 ${open.home}→${latest.home})=真热上盘, 资金实入主队` };
  if (dH > 0 && dHome >= 0.04) return { dH, dHome, dAway, verdict: `升盘升水(主让加深 ${lineName(open.h)}→${lineName(latest.h)}, 主水 ${open.home}→${latest.home})=诱上盘, 盘口虚抬水位不配合` };
  if (dH < 0 && dHome >= 0.04) return { dH, dHome, dAway, verdict: `降盘升水(主让退 ${lineName(open.h)}→${lineName(latest.h)}, 主水 ${open.home}→${latest.home})=真冷, 上盘被资金抛弃` };
  if (dH < 0 && dHome <= -0.04) return { dH, dHome, dAway, verdict: `降盘降水(主让退 ${lineName(open.h)}→${lineName(latest.h)}, 主水 ${open.home}→${latest.home})=资金反向下盘` };
  if (dHome <= -0.05) return { dH, dHome, dAway, verdict: `盘稳主水降(${open.home}→${latest.home})=资金站主队` };
  if (dAway <= -0.05) return { dH, dHome, dAway, verdict: `盘稳客水降(${open.away}→${latest.away})=资金站客队` };
  if (dHome >= 0.05) return { dH, dHome, dAway, verdict: `盘稳主水升(${open.home}→${latest.home})=主队资金退场` };
  if (dAway >= 0.05) return { dH, dHome, dAway, verdict: `盘稳客水升(${open.away}→${latest.away})=客队资金退场` };
  return { dH, dHome, dAway, verdict: '无明显资金信号(全程变动<0.05)' };
}

function main() {
  const args = process.argv.slice(2);
  const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const write = args.includes('--write');
  if (!date) { console.error('用法: node tools/_ah_moves.js <YYYY-MM-DD> [--write]'); process.exit(1); }
  const mmdd = date.slice(5).replace('-', '');

  /* ① 收集快照序列: 窗口=比赛日前一日 12:00 北京时间 ~ 比赛日+1 06:00 */
  const t0 = new Date(date + 'T12:00:00+08:00').getTime() - 24 * 3600 * 1000;
  const t1 = new Date(date + 'T06:00:00+08:00').getTime() + 24 * 3600 * 1000;
  const snaps = [];
  for (const f of fs.readdirSync(__dirname)) {
    let t = null;
    let m = f.match(/^_cq_odds_snap_(\d{2})(\d{2})_(\d{2})(\d{2})\.json$/);
    if (m) t = new Date(`2026-${m[1]}-${m[2]}T${m[3]}:${m[4]}:00+08:00`).getTime();
    else if (/^_cq_odds_raw_\d{4}(b|_eve)?\.json$/.test(f)) t = fs.statSync(path.join(__dirname, f)).mtimeMs;
    if (t && t >= t0 && t <= t1) snaps.push({ f, t });
  }
  snaps.sort((a, b) => a.t - b.t);
  if (snaps.length < 2) { console.error(`快照不足 2 个(窗口内 ${snaps.length} 个), 先跑 _cq_odds_relay.js 积累时序`); process.exit(1); }
  console.log(`快照序列 ${snaps.length} 个: ${snaps.map(s => s.f.replace(/_cq_odds_(snap|raw)_/, '')).join(' → ')}`);

  /* ② 当日场次 → eventId */
  const cqFile = path.join(__dirname, 'cq_' + mmdd + '.json');
  const cq = JSON.parse(fs.readFileSync(cqFile, 'utf8'));
  const evOfLabel = {}, evOfBd = {}, evOfPair = {};
  for (const m of cq.matches) {
    if (m.lottery === '北单') evOfBd[Number(m.number)] = m.eventId;
    if (m.lottery === '竞彩' && m.label) evOfLabel[m.label] = m.eventId;
    evOfPair[m.home + '|' + m.away] = m.eventId;
  }

  const pjFile = path.join(__dirname, '..', 'data', 'predictions.js');
  const days = require(pjFile);
  const day = days.find((d) => d.date === date);
  if (!day) { console.error('predictions.js 无 ' + date); process.exit(1); }

  /* ③ 逐场首末快照对比(中间点只计数) */
  const idxCache = snaps.map((s) => indexRaw(JSON.parse(fs.readFileSync(path.join(__dirname, s.f), 'utf8'))));
  let analyzed = 0;
  const missing = [];
  for (const m of day.matches) {
    const num = Number(String(m.id).replace('北单', ''));
    const ev = String(m.id).startsWith('北单') ? evOfBd[num] : (evOfLabel[m.id] || evOfPair[m.home + '|' + m.away]);
    if (!ev) { missing.push(m.id + ' 无eventId'); continue; }
    let open = null, latest = null;
    for (const idx of idxCache) { const a = pickAh(idx, ev); if (a) { if (!open) open = a; latest = a; } }
    if (!open || open === latest) { missing.push(m.id + ' 有效盘口点<2'); continue; }
    const r = verdictOf(open, latest);
    m.ahMoves = { open: { h: open.h, home: open.home, away: open.away }, latest: { h: latest.h, home: latest.home, away: latest.away }, dH: r.dH, dHome: r.dHome, dAway: r.dAway, verdict: r.verdict, snapshots: idxCache.length, analyzedAt: new Date().toISOString() };
    analyzed++;
    console.log(`${m.id} ${m.home}vs${m.away}: ${lineName(open.h)} ${open.home}/${open.away} → ${lineName(latest.h)} ${latest.home}/${latest.away} | ${r.verdict}`);
  }
  if (missing.length) console.log('未覆盖: ' + missing.join(' | '));
  console.log(`分析 ${analyzed}/${day.matches.length} 场`);

  if (write && analyzed) {
    delete require.cache[pjFile];
    const src = fs.readFileSync(pjFile, 'utf8');
    const head = src.slice(0, src.indexOf('['));
    let json = JSON.stringify(days, null, 2);
    json = json.split('\n').map((x) => (x.startsWith('  ') ? x.slice(2) : x)).join('\n');
    json = json.replace(/\n\]$/, '];');
    const footer = '\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n';
    fs.writeFileSync(pjFile, head.split('const PREDICTION_DAYS')[0] + 'const PREDICTION_DAYS = ' + json + footer, 'utf8');
    console.log('✓ ahMoves 已写入 predictions.js(部署: bash tools/_deploy_watch.sh ' + mmdd + ' && node tools/sync-data.js)');
  }
}

main();
