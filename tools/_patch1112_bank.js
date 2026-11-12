/* tools/_patch1112_bank.js — 给每个 day 回填结构化资金账 bank.{stake,ret,net}(幂等)
   来源: plan「💰 投注建议」的 pct 金额 + review 里的「净±N」；解析不到就留 null(前端显示 —)，绝不虚构。
   用法: node tools/_patch1112_bank.js [--dry] */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const DRY = process.argv.includes('--dry');

function stakeOf(d) {
  const c = (d.plan || []).find(p => String(p.name || '').indexOf('投注建议') >= 0);
  const txt = (c && (c.pct || '')) + ' ' + (c && (c.text || ''));
  // 「方案 80/142 元」这类双金额取第一个(标准方案), 否则取首个「N元」
  const pct = String(c && c.pct || '');
  const m0 = pct.match(/方案\s*(\d+(?:\.\d+)?)/);
  if (m0) return Number(m0[1]);
  const m = pct.match(/(\d+(?:\.\d+)?)\s*元/);
  if (m) return Number(m[1]);
  const r = String(d.review || '');
  const m2 = r.match(/💰\s*(\d+(?:\.\d+)?)\s*元/);
  if (m2) return Number(m2[1]);
  const m3 = r.match(/(\d+(?:\.\d+)?)\s*元\s*(?:方案|:)/);
  if (m3) return Number(m3[1]);
  return null;
}
function netOf(d) {
  const r = String(d.review || '');
  const m = r.match(/净(?:亏|赚|盈利)?\s*(?:约|≈|大约)?\s*([+-]?\d+(?:\.\d+)?)/);
  if (m) return Number(m[1].replace(/^\+/, ''));
  return null;
}

let set = 0, miss = 0;
days.forEach(d => {
  const stake = stakeOf(d);
  const net = netOf(d);
  if (stake == null && net == null) { miss++; return; }
  const ret = stake != null && net != null ? Number((stake + net).toFixed(2)) : null;
  const bank = { stake, ret, net };
  if (JSON.stringify(d.bank) !== JSON.stringify(bank)) { d.bank = bank; set++; }
});
console.log('可核算 ' + days.filter(d => d.bank && d.bank.net != null).length + ' 天 / 共 ' + days.length + ' 天; 本次更新 ' + set + ' 天; 无数据 ' + miss + ' 天');
if (!DRY) {
  const src = fs.readFileSync(file, 'utf8');
  const header = src.slice(0, src.indexOf('const PREDICTION_DAYS'));
  fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
  console.log('✓ 已写回 predictions.js');
}
