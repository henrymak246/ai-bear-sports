/* tools/_research_extsrc.js — 外部预测源分源命中率(2026-11-16, 用户拍板)
   解析 note「外部:」段, 按源提取方向侧向, 与 90 分钟赛果对账。
   源识别(按历史 note 实际写法):
     Forebet/FB=Forebet; FP=FootballPredictions; FW=Forebet简写变体; SM=Sports Mole; TipIQ;
     模型/Model=stats 模型; 知乎/网易/Opta/SI/ESPN/OneFootball/FN/TC/Dimers/BC/theyscored/DailySports/UD/澳门推介/SZ 等。
   侧向解析顺序: 「2-1主」「主51%」「主胜/客胜」>「队名+胜/看队名」>「偏主/偏客」。
   分期: 近 30 天(10-18 起) vs 更早。 */
'use strict';
const path = require('path');
const S = require(path.join(__dirname, '..', 'stats.js'));
const days = require(path.join(__dirname, '..', 'data', 'predictions.js'));

const SRC_MAP = [
  [/\bForebet|\bFB(?=[^\sa-z]|$)/i, 'Forebet'],
  [/\bFP(?=[^\sa-z]|$)/, 'FootballPredictions'],
  [/\bFW(?=[^\sa-z]|$)/, 'Forebet(FW)'],
  [/\bSM(?=[^\sa-z]|$)/, 'SportsMole'],
  [/TipIQ/i, 'TipIQ'],
  [/模型/, '模型'],
  [/知乎/, '知乎'], [/网易/, '网易'],
  [/Opta/i, 'Opta'], [/\bSI(?=[^\sa-z]|$)/, 'SI'], [/ESPN/i, 'ESPN'],
  [/OneFootball/i, 'OneFootball'], [/\bFN(?=[^\sa-z]|$)/, 'FN'],
  [/\bTC(?=[^\sa-z]|$)/, 'TC'], [/Dimers/i, 'Dimers'], [/\bBC(?=[^\sa-z]|$)/, 'BC'],
  [/theyscored/i, 'theyscored'], [/DailySports/i, 'DailySports'], [/\bUD(?=[^\sa-z]|$)/, 'UD'],
  [/澳门推介/, '澳门推介'], [/\bSZ(?=[^\sa-z]|$)/, 'SZ'],
];

/* 从「源名及其后 20 字」推断侧向 */
function sideOf(seg, m) {
  let x = seg.match(/(\d+)[-:](\d+)\s*(主|客)/); if (x) return x[3];
  x = seg.match(/(主|客)\s*\d+%/); if (x) return x[1];
  x = seg.match(/偏(主|客)/); if (x) return x[1];
  x = seg.match(/(主|客)胜/); if (x) return x[1];
  x = seg.match(/看([^,，、\s]{2,8})/); if (x) return teamSide(x[1], m);
  x = seg.match(/^[\w.()]+(?:模型)?([^,，、\s]{2,8})胜/); if (x) return teamSide(x[1], m);
  return null;
}
function teamSide(name, m) {
  if (!name) return null;
  if (m.home.includes(name) || name.includes(m.home)) return '主';
  if (m.away.includes(name) || name.includes(m.away)) return '客';
  return null;
}

const RECENT = '2026-10-18';
const stats = {}; // src -> {n,h, rn,rh, byDate}
let parsedTotal = 0, skipped = 0;
for (const d of days) {
  for (const m of d.matches || []) {
    if (!m.finalScore) continue;
    const t = String(m.note || '').match(/外部[:：]([^。]*)/);
    if (!t) continue;
    const seg = t[1];
    const sc = S.parseScore(m.finalScore);
    const actual = sc.home > sc.away ? '主' : sc.home < sc.away ? '客' : '平';
    let hitAny = false;
    for (const [re, name] of SRC_MAP) {
      const sm = seg.match(new RegExp(re.source + '.{0,20}', re.flags.replace('g', '')));
      if (!sm) continue;
      // 只取源名第一次出现处的紧邻文
      const side = sideOf(sm[0], m);
      if (!side) continue;
      hitAny = true;
      const st = stats[name] = stats[name] || { n: 0, h: 0, rn: 0, rh: 0 };
      st.n++; if (actual === side) st.h++;
      if (d.date >= RECENT) { st.rn++; if (actual === side) st.rh++; }
    }
    if (hitAny) parsedTotal++; else skipped++;
  }
}
const pct = (h, n) => n ? (100 * h / n).toFixed(0) + '%' : '—';
console.log('可解析方向性预测 ' + parsedTotal + ' 条(跳过非方向/无法归因 ' + skipped + ' 段), 近 30 天阈值 ' + RECENT + '\n');
console.log('源 | 全期命中 | 样本 | 近30天命中 | 样本');
const rows = Object.entries(stats).sort((a, b) => (b[1].n - a[1].n));
for (const [name, st] of rows) {
  console.log(name.padEnd(22), pct(st.h, st.n).padStart(5), ('(' + st.h + '/' + st.n + ')').padStart(9), pct(st.rh, st.rn).padStart(6), '(' + st.rh + '/' + st.rn + ')');
}
