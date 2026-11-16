/* tools/_ext_fetch.js — 外部预测采集器(前瞻跟踪, 2026-11-16 建)
   目的: 把 Forebet(agent-reach web read 整页) 的每场预测结构化落盘, 供终审按源对账,
        攒 2-4 周样本后回答「哪个网络意见源近期最准」(站内归因 41 条太薄的替代方案)。
   用法: node tools/_ext_fetch.js [MMDD]   (缺省=明天页, 建日当天下午抓今晚/明晨场)
   产出: tools/ext_preds_<MMDD>.json = [{home, away, homeEn, awayEn, src, pH, pD, pA, pred, side, kickoff}]
   依赖: agent-reach venv(见 skill external-sources.md); 队名别名 tools/_ext_teams.json。 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const mmdd = process.argv[2] || (() => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
})();
const ROOT = path.join(__dirname, '..');
const AR = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'agent-reach', '.venv', 'Scripts', 'agent-reach.exe');
const ALIAS = require('./_ext_teams.json');
const EN2CN = {};
for (const [cn, en] of Object.entries(ALIAS)) EN2CN[norm(en)] = cn;
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ''); }

/* 从 predictions.js 找当日池(若有) 做中文名→英文名映射补充 */
const days = require(path.join(ROOT, 'data', 'predictions.js'));
const day = days.find(d => d.date === '2026-' + mmdd.slice(0, 2) + '-' + mmdd.slice(2));

function fetchForebet(page) {
  const url = 'https://www.forebet.com/en/football-tips-and-predictions-' + page;
  const out = execSync('"' + AR + '" web read "' + url + '"', { encoding: 'utf8', timeout: 120000, env: { ...process.env, PYTHONUTF8: '1' } });
  const j = JSON.parse(out);
  if (!j.ok || !j.items || !j.items[0]) throw new Error('agent-reach 抓取失败: ' + out.slice(0, 200));
  return j.items[0].text;
}

/* 解析 Forebet 正文(exa 版, 2026-11-16 实测格式):
   每场块=「<主队><空格><客队> DD/MM/YYYY HH:MM」一行(两队名间无分隔符, 需别名表切分)
   下一行「42 44 14」=1X2 概率, 再下一行「X 1- 1」=推荐项+正确比分 */
function splitTeams(s) {
  const n = s.length;
  let best = null;
  for (let i = 2; i < n - 1; i++) {
    const h = s.slice(0, i).trim(), a = s.slice(i).trim();
    const hs = EN2CN[norm(h)] ? 2 : 0, as = EN2CN[norm(a)] ? 2 : 0;
    const score = hs + as;
    if (score && (!best || score > best.score)) best = { h, a, score };
  }
  if (best) return [best.h, best.a];
  // 兜底: 按词数对半切
  const ws = s.split(/\s+/), mid = Math.ceil(ws.length / 2);
  return [ws.slice(0, mid).join(' '), ws.slice(mid).join(' ')];
}
function parseForebet(text) {
  const preds = [];
  const lines = text.split('\n').map(s => s.replace(/\r$/, '')).filter(s => s.trim() !== '');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})\s*$/);
    if (!m) continue;
    const pLine = (lines[i + 1] || '').trim().match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
    const pickLine = (lines[i + 2] || '').trim().match(/^([12X])\s+(\d+)\s*-\s*(\d+)$/);
    if (!pLine && !pickLine) continue;
    const [home, away] = splitTeams(m[1]);
    const pH = pLine ? +pLine[1] : null, pD = pLine ? +pLine[2] : null, pA = pLine ? +pLine[3] : null;
    let side = null, pred = null;
    if (pickLine) { side = pickLine[1] === '1' ? '主' : pickLine[1] === '2' ? '客' : '平'; pred = pickLine[2] + '-' + pickLine[3]; }
    else if (pH != null) side = pH >= pD && pH >= pA ? '主' : pA >= pH && pA >= pD ? '客' : '平';
    preds.push({ home, away, kickoff: m[2] + ' ' + m[3], pH, pD, pA, pred, side });
  }
  return preds;
}

(async () => {
  const text = fetchForebet('for-tomorrow');
  fs.writeFileSync(path.join(__dirname, '_ext_forebet_raw.txt'), text);
  const preds = parseForebet(text);
  // 关联中文名(能挂上池内场的标 matchId)
  const pool = (day && day.matches) || [];
  const out = [];
  for (const p of preds) {
    const homeCn = EN2CN[norm(p.home)], awayCn = EN2CN[norm(p.away)];
    const hit = pool.find(m => (homeCn && m.home === homeCn) || (awayCn && m.away === awayCn)
      || (m.home.includes(p.home) || p.home.includes(m.home)) || (m.away.includes(p.away) || p.away.includes(m.away)));
    out.push({ ...p, homeCn: homeCn || null, awayCn: awayCn || null, matchId: hit ? hit.id : null, src: 'Forebet' });
  }
  const file = path.join(__dirname, 'ext_preds_' + mmdd + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('✓ Forebet 解析 ' + out.length + ' 场, 挂上池内 ' + out.filter(x => x.matchId).length + ' 场 → ' + path.basename(file));
  const un = out.filter(x => !x.homeCn).slice(0, 5).map(x => x.home + ' vs ' + x.away);
  if (un.length) console.log('未识别队名样例(补 _ext_teams.json):', un.join(' | '));
})().catch(e => { console.error('✗', e.message); process.exit(1); });
