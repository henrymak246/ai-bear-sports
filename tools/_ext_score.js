/* tools/_ext_score.js — 外部预测对账器(2026-11-16 建)
   读 tools/ext_preds_*.json, 按队名(中/英)与 predictions.js 全量已赛场对账,
   维护滚动台账 tmp/ext_ledger.json, 输出分源命中率(全期+近 14 天)。
   用法: node tools/_ext_score.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
/* 东京 cron 每日 05:30/13:30 UTC(北京 13:30/21:30) 自动采集(node _ext_fetch_server.js);
   评审前加 --pull 先 scp 回服务器最新 ext_preds_* 再对账。 */
if (process.argv.includes('--pull')) {
  try { execSync('scp -q "tokyo-via-proxy:/root/football/tools/ext_preds_*.json" "' + __dirname.replace(/\\/g, '/') + '/"', { stdio: 'inherit' }); } catch (e) { console.log('pull 失败(忽略, 用本地现有):', e.message.slice(0, 80)); }
}
const S = require(path.join(__dirname, '..', 'stats.js'));
const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));
const ALIAS = require('./_ext_teams.json');

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
const EN2CN = {};
for (const [cn, en] of Object.entries(ALIAS)) EN2CN[norm(en)] = cn;

/* 全量已赛场索引: 中文名/英文名 → {finalScore, date} */
const played = [];
for (const d of days) for (const m of d.matches || []) {
  if (!m.finalScore) continue;
  played.push({ date: d.date, home: m.home, away: m.away, homeEn: ALIAS[m.home] || null, awayEn: ALIAS[m.away] || null, finalScore: m.finalScore });
}
function findPlayed(p) {
  const h = norm(p.home), a = norm(p.away);
  return played.find(x =>
    (h && (norm(x.home) === h || norm(x.homeEn) === h) && a && (norm(x.away) === a || norm(x.awayEn) === a))
    || (p.homeCn && x.home === p.homeCn && p.awayCn && x.away === p.awayCn));
}

const ledgerPath = path.join(__dirname, '..', 'tmp', 'ext_ledger.json');
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : [];
const seen = new Set(ledger.map(l => l.key));
let added = 0, pending = 0;
for (const f of fs.readdirSync(__dirname).filter(f => /^ext_preds_\d{4}\.json$/.test(f))) {
  for (const p of JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'))) {
    const key = p.src + '|' + p.home + '|' + p.away + '|' + String(p.kickoff || '').slice(0, 10);
    if (seen.has(key)) continue;
    const m = findPlayed(p);
    if (!m) { pending++; continue; }
    const sc = S.parseScore(m.finalScore);
    const actual = sc.home > sc.away ? '主' : sc.home < sc.away ? '客' : '平';
    ledger.push({ key, date: m.date, src: p.src, home: p.home, away: p.away, side: p.side, pred: p.pred, pH: p.pH, pD: p.pD, pA: p.pA, finalScore: m.finalScore, actual, hit: p.side === actual, scoreHit: p.pred && p.pred.replace('-', ':') === m.finalScore.replace('-', ':') });
    added++;
  }
}
fs.mkdirSync(path.join(__dirname, '..', 'tmp'), { recursive: true });
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1));

const pct = (h, n) => n ? (100 * h / n).toFixed(1) + '%' : '—';
const cutoff = new Date(Date.now() - 14 * 86400e3).toISOString().slice(0, 10);
console.log('台账 ' + ledger.length + ' 条(新判 ' + added + ', 待赛 ' + pending + ')');
const bySrc = {};
for (const l of ledger) {
  const s = bySrc[l.src] = bySrc[l.src] || { n: 0, h: 0, sh: 0, rn: 0, rh: 0 };
  s.n++; if (l.hit) s.h++; if (l.scoreHit) s.sh++;
  if (l.date >= cutoff) { s.rn++; if (l.hit) s.rh++; }
}
for (const [src, s] of Object.entries(bySrc)) {
  console.log(src.padEnd(12), '方向', pct(s.h, s.n), '(' + s.h + '/' + s.n + ')', '· 比分', pct(s.sh, s.n), '(' + s.sh + ')', '· 近14天', pct(s.rh, s.rn), '(' + s.rh + '/' + s.rn + ')');
}
if (!ledger.length) console.log('(暂无已赛场可判, 今晚赛完后重跑)');
