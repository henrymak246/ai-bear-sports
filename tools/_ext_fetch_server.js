/* tools/_ext_fetch_server.js — 东京服务器版外部预测采集器(自包含, 2026-11-16)
   与本机 _ext_fetch.js 同口径, 但不经 agent-reach: 直调 exa 免费 MCP(mcp.exa.ai/mcp, 无需 key),
   东京直连 Forebet 403(Cloudflare 拦机房 IP)⇒ 必须走 exa 代理读。
   部署: /root/football/tools/ 下, cron 每日两次(UTC 05:30/13:30 = 北京 13:30/21:30)。
   用法: node _ext_fetch_server.js [MMDD]  (缺省=北京时间的明天, 即 tomorrow 页面对应的池日)
   产出: /root/football/tools/ext_preds_<MMDD>.json (与本机版同格式, 评审前 scp 回本机对账) */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ALIAS = require('./_ext_teams.json');
const EN2CN = {};
for (const [cn, en] of Object.entries(ALIAS)) EN2CN[norm(en)] = cn;
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, ''); }

const bjNow = new Date(Date.now() + 8 * 3600 * 1000);
const mmdd = process.argv[2] || (() => {
  const t = new Date(bjNow.getTime() + 24 * 3600 * 1000);
  return String(t.getUTCMonth() + 1).padStart(2, '0') + String(t.getUTCDate()).padStart(2, '0');
})();

function exaFetch(url) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'web_fetch_exa', arguments: { urls: [url], maxCharacters: 60000 } } });
    const req = https.request('https://mcp.exa.ai/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body) },
      timeout: 90000,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const payloads = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
        try {
          const msg = JSON.parse(payloads.length ? payloads[payloads.length - 1] : raw);
          const text = ((msg.result || {}).content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
          if (!text) return reject(new Error('exa 空响应: ' + raw.slice(0, 200)));
          resolve(text);
        } catch (e) { reject(new Error('exa 响应解析失败: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('exa 超时')));
    req.end(body);
  });
}

function splitTeams(s) {
  let best = null;
  for (let i = 2; i < s.length - 1; i++) {
    const h = s.slice(0, i).trim(), a = s.slice(i).trim();
    const score = (EN2CN[norm(h)] ? 2 : 0) + (EN2CN[norm(a)] ? 2 : 0);
    if (score && (!best || score > best.score)) best = { h, a, score };
  }
  if (best) return [best.h, best.a];
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
  const text = await exaFetch('https://www.forebet.com/en/football-tips-and-predictions-for-tomorrow');
  const preds = parseForebet(text);
  const out = preds.map(p => ({ ...p, homeCn: EN2CN[norm(p.home)] || null, awayCn: EN2CN[norm(p.away)] || null, src: 'Forebet' }));
  const file = path.join(__dirname, 'ext_preds_' + mmdd + '.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log('✓ ' + out.length + ' 场 → ' + file);
})().catch(e => { console.error('✗', e.message); process.exit(1); });
