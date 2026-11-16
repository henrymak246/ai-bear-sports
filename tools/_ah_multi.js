/* tools/_ah_multi.js — 三公司盘口互证提取器(澳彩/365/伟德, 即时+初盘) + 资金共识判定
   背景(2026-11-16, 用户拍板「资金面不应该开出与盘口完全相反的方向」):
     11-15 跟资金 1红2黑根因=只用澳彩单公司单时点水位。快照本身含 25 家 supplier 与初盘(0x130)/即时(0x110) 双池。
     回测: 004 柏场 365 平水+伟德反向(互证可拦)/008 芬兰场 365·伟德连升盘口与受让低水矛盾(降权可拦)/092 格拉纳达场集体降盘+受让低水(事后判诱下, 规则挡不住, 诚实记录)。
   判定口径:
     fundSide = 三家公司即时盘低水侧多数票(水位差≥0.05 才算有信号; 平水弃票)
     fundStrength = 同意票数(2/3 或 3/3 才算互证资金信号; 1 票=无信号)
     lineMove = 初盘→即时盘口方向多数票('升'=向主队加深/上盘热, '降'=变浅)
     conflict = 升盘+客低水(诱下, 弃选级) / soft = 降盘+主低水(降权级, 禁胆/单选/主仓)
     signal: strong(互证≥2且无矛盾) / conflict(升盘矛盾, 弃选级) / soft(降盘矛盾, 降权级) / none(无互证)
   用法(库): const { analyzeSnap, consensus } = require('./_ah_multi.js');
   用法(CLI): node tools/_ah_multi.js <snapshot.json> <eventId> */
'use strict';
const fs = require('fs');

const SUPS = [2, 5, 26];
const SUPN = { 2: '澳彩', 5: '365', 26: '伟德' };

function indexSnap(snapPath) {
  const snap = JSON.parse(fs.readFileSync(snapPath, 'utf8'));
  const oddsData = snap.data.odds.data, ahData = snap.data['odds.ah'].data;
  const ahBy = {};
  for (const r of ahData) (ahBy[r[0]] = ahBy[r[0]] || []).push(r);
  const byEvent = {};
  for (const r of oddsData) if (SUPS.includes(r[4])) (byEvent[r[3]] = byEvent[r[3]] || {}, (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]));
  return { ahBy, byEvent };
}

/* 单家公司: 取即时(0x110)/初盘(0x130) 各最新一条 */
function companyAt(idx, eventId, sup) {
  const ids = (idx.byEvent[eventId] || {})[sup] || [];
  const rows = [];
  for (const id of ids) for (const a of idx.ahBy[id] || []) rows.push(a);
  if (!rows.length) return null;
  const pick = mask => { const pool = rows.filter(a => (a[4] & ~1) === mask && (a[4] & 1) === 0); return pool.length ? pool[pool.length - 1] : null; };
  const fmt = a => a ? { line: a[1], home: +(1 + a[2]).toFixed(2), away: +(1 + a[3]).toFixed(2) } : null;
  return { inst: fmt(pick(0x110)), init: fmt(pick(0x130)) };
}

/* 共识判定: companies = { sup: companyAt 输出 } */
function consensus(companies) {
  const votes = [], moves = [];
  for (const sup of SUPS) {
    const c = companies[SUPN[sup]] || companies[sup];
    if (!c || !c.inst) continue;
    const dh = c.inst.home - c.inst.away;
    if (Math.abs(dh) >= 0.05) votes.push(dh < 0 ? '主' : '客'); // 低水侧
    if (c.init && c.inst.line !== c.init.line) moves.push(c.inst.line > c.init.line ? '升' : '降');
  }
  const count = (arr, v) => arr.filter(x => x === v).length;
  const vH = count(votes, '主'), vA = count(votes, '客');
  let fundSide = null, fundStrength = 0;
  if (vH > vA) { fundSide = '主'; fundStrength = vH; } else if (vA > vH) { fundSide = '客'; fundStrength = vA; }
  if (fundStrength < 2) { fundSide = null; fundStrength = 0; }
  const mU = count(moves, '升'), mD = count(moves, '降');
  const lineMove = mU > mD ? '升' : mD > mU ? '降' : null;
  // 矛盾两档(2026-11-16 回测校准):
  //   升盘+客低水=上盘热而受让便宜(诱下) ⇒ conflict 弃选级(008 芬兰场实证拦黑)
  //   降盘+主低水=上盘门槛降低还给低水 ⇒ soft 降权级(002 鹿岛红/010 西班牙黑互现, 不硬拦, 只禁胆/单选/主仓)
  const conflict = !!(fundSide && lineMove === '升' && fundSide === '客');
  const soft = !!(fundSide && lineMove === '降' && fundSide === '主');
  const signal = !fundSide ? 'none' : conflict ? 'conflict' : soft ? 'soft' : 'strong';
  return { fundSide, fundStrength, lineMove, conflict, soft, signal, votes: { 主: vH, 客: vA }, moves: { 升: mU, 降: mD } };
}

function analyzeSnap(snapPath, eventId) {
  const idx = indexSnap(snapPath);
  const companies = {};
  for (const sup of SUPS) companies[SUPN[sup]] = companyAt(idx, eventId, sup);
  return { eventId, companies, consensus: consensus(companies) };
}

if (require.main === module) {
  const [, , snapPath, ev] = process.argv;
  console.log(JSON.stringify(analyzeSnap(snapPath, Number(ev)), null, 1));
}

/* 建日便捷接口: 一次索引快照, 按 eventId 逐个出 ahFund(存 match.ahFund 供 check_daily 与页面消费) */
function fundMapper(snapPath) {
  const idx = indexSnap(snapPath);
  return eventId => {
    const companies = {};
    for (const sup of SUPS) companies[SUPN[sup]] = companyAt(idx, eventId, sup);
    const c = consensus(companies);
    return {
      side: c.fundSide, strength: c.fundStrength, move: c.lineMove,
      conflict: c.conflict, soft: c.soft, signal: c.signal,
      votes: c.votes, moves: c.moves,
      companies: Object.fromEntries(Object.entries(companies).map(([k, v]) => [k, v && v.inst ? { line: v.inst.line, home: v.inst.home, away: v.inst.away, initLine: v.init ? v.init.line : null } : null]))
    };
  };
}
module.exports = { indexSnap, companyAt, consensus, analyzeSnap, fundMapper, SUPS, SUPN };
