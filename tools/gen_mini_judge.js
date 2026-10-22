#!/usr/bin/env node
/* tools/gen_mini_judge.js — 从站点 stats.js 同源抽取判定函数, 生成 miniprogram/utils/judge.js
 * 用法: node tools/gen_mini_judge.js
 *
 * 同源策略:
 *   parseScore/judgeDirection/judgeOverUnder/judgeScore 逐字抽取自 stats.js
 *   (judgeOverUnder 依赖内部助手 parseOverUnder/judgeSegment, 一并抽取, 共 6 个函数),
 *   保证微信小程序与站点判定口径零漂移; stats.js 改动后重跑本脚本即可同步。
 * 新增(stats.js 中不存在, 手写内嵌于本脚本):
 *   judgeBd310  北单让球310 判定(口径对齐 stats.js computeBeidan 的 legs 判定)
 *   judgeAh     亚盘让球判定(赢全/赢半/走水/输半/输全)
 *   ahFactor    亚盘结果折算系数(串关结算用)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'stats.js');
const OUT = path.join(ROOT, 'miniprogram', 'utils', 'judge.js');

// 按平衡大括号抽取函数源码。
// 已人工核对: 目标函数体内的字符串/正则字面量均不含花括号, 简单配对即安全。
function extractFn(src, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const m = re.exec(src);
  if (!m) throw new Error('stats.js 中未找到函数 ' + name);
  const start = m.index;
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('函数 ' + name + ' 大括号不配对');
}

const src = fs.readFileSync(SRC, 'utf8');
const NAMES = ['parseScore', 'judgeDirection', 'parseOverUnder', 'judgeSegment', 'judgeOverUnder', 'judgeScore'];
const extracted = NAMES.map(n => extractFn(src, n)).join('\n\n');

const HEADER = `/* miniprogram/utils/judge.js — 腿判定函数库(微信小程序 / Node 双环境)
 * 由 tools/gen_mini_judge.js 生成, 勿手改; 重新生成: node tools/gen_mini_judge.js
 * parseScore/judgeDirection/judgeOverUnder/judgeScore(含内部助手 parseOverUnder/judgeSegment)
 * 逐字抽取自站点 stats.js, 判定口径与站点一致;
 * judgeBd310(北单让球310)/judgeAh(亚盘)/ahFactor(亚盘折算)/ahLineOf·ahTeamOf(亚盘盘口形态解析)
 * 为本模块新增。
 */
'use strict';

`;

// 新增函数(手写, 非 stats.js 抽取)。注意: 微信小程序部分基础库不支持 ?? / ?. , 保持 ES6 语法。
const EXTRA = `
// ---- 北单让球310 判定(新增; 口径对齐 stats.js computeBeidan 的 legs 判定) ----
// 主队比分 + parseInt(handicap) 后比大小定赛果 3(让后主胜)/1(让后平)/0(让后客胜);
// pick 按 '/' 分割(复式多选), 命中其一即 'hit', 否则 'miss';
// manualResult='push' 优先返回 'push'(腿无效不计入, 如北单未开售该场);
// finalScore 缺失/无法解析返回 null。
function judgeBd310(pick, handicap, finalScore, manualResult) {
  if (manualResult === 'push') return 'push';
  const s = parseScore(finalScore);
  if (!s) return null;
  const hc = parseInt(handicap, 10) || 0;
  const adj = s.home + hc;
  const actual = adj > s.away ? '3' : adj < s.away ? '0' : '1';
  const picks = String(pick || '').split('/');
  for (let i = 0; i < picks.length; i++) if (picks[i].trim() === actual) return 'hit';
  return 'miss';
}

// ---- 亚盘盘口形态解析(新增, 手写; judgeAh 与 settle.isAhPick/pickTeam 共用同一判据) ----
// 返回 { h: 盘口数, team: 命名队 } 或 null(不是亚盘形态)。h 从命名队视角取值:
//   负数 = 命名队让球(上盘), 正数 = 命名队受让(下盘)。
// 三种形态:
//   ① "美因茨-0.5"/"富勒姆+1.25"  带符号尾数 → 直接取值;
//   ② "埃门平手"/"米堡平手"       含"平手" → h=0;
//   ③ "斯托克城0"                 裸数字尾数(2026-09-19 复盘实测确认的新形态; 历史一律写作 "-0")
//      → 补负号(裸 0 ≡ -0 ≡ 平手盘), 与 _review0920.js 的 normAh 同口径。
// ★调用方必须共用本函数: 只认形态不判 / 只判不认形态, 会出现
//   "认得出但判不出"(judgeAh 返 null → 腿永远挂在待结算) 或
//   "判得出但认不出"(settleLeg 掉进竞彩方向分支 → 该腿**恒判 miss**)两种相反的坏法。
function ahShapeOf(pick) {
  const p = String(pick || '');
  const m = p.match(/([+-]\\d+(?:\\.\\d+)?)$/);
  if (m) return { h: parseFloat(m[1]), team: p.slice(0, p.length - m[1].length).trim() };
  if (p.indexOf('平手') !== -1) return { h: 0, team: p.replace(/平手/g, '').trim() }; // 平手盘: 无数字盘口, 按 0 处理
  // ③ 裸数字尾数 —— 判据必须窄, 否则会把别的形态误吃进来:
  //   · 含 '/'          → 不是亚盘(复式 310 码 "3/1"/"让-1 3/0" 的末段是纯码, 不是盘口数);
  //   · 尾数字前是空格 → 不是亚盘("让-1 3"/"让+1 0" 的尾数字由 settle 的让球分支处理);
  //   · 大/小开头        → 不是亚盘(大2.5/小3 是大小球形态, 走 judgeOverUnder);
  //   · 前导零          → 队名里的号(沙尔克04);
  //   · 超出 0~5 / 非 0.25 的整数倍 → 队名里的号(汉诺威96 / 沙特阿拉伯U23), 不是盘口线。
  if (p.indexOf('/') !== -1) return null;
  if (/^[大小]\\d/.test(p)) return null;
  const b = p.match(/([^\\s\\d])(\\d{1,2}(?:\\.\\d+)?)$/);
  if (!b || /^0\\d/.test(b[2])) return null;
  const v = parseFloat(b[2]);
  if (!(v >= 0 && v <= 5) || Math.round(v * 100) % 25 !== 0) return null;
  return { h: v === 0 ? 0 : -v, team: p.slice(0, p.length - b[2].length).trim() };
}

// 亚盘盘口数(不是亚盘形态 → null) / 命名队(非亚盘形态原样返回)
function ahLineOf(pick) { const a = ahShapeOf(pick); return a ? a.h : null; }
function ahTeamOf(pick) { const a = ahShapeOf(pick); return a ? a.team : String(pick || '').trim(); }

// ---- 亚盘让球判定(新增, stats.js 无此函数) ----
// pick 形态 "美因茨-0.5"/"巴竞技-0.25"/"富勒姆+1.25"/"斯托克城0": 命名队 + 让球数
//   负数 = 命名队让球(上盘), 正数 = 命名队受让(下盘); 判定立场 = 买命名队这一边。
//   无正负数字但含"平手"二字(如 "埃门平手"/"米堡平手")按平手盘 h=0 处理(赢=win/平=push/负=lose);
//   裸数字尾数(漏写正负号, 如 "斯托克城0")同样按补负号处理 —— 形态识别统一走 ahShapeOf。
// side(可选): 'home' | 'away', 命名队的主客场; 省略时默认 'home'
//   (即"负=主队让/正=主队受让"; 命名队为客队时调用方必须显式传 'away')。
//  quarter 档(.25/.75)拆两半: 如 -0.25 → 0 与 -0.5 两半, +1.25 → +1 与 +1.5 两半;
//   两半结果不同取半档(winHalf/loseHalf), 皆走水为 push。
// 返回 'win'/'winHalf'/'push'/'loseHalf'/'lose'; 比分缺失或盘口无法解析返回 null。
function judgeAh(pick, finalScore, side) {
  const s = parseScore(finalScore);
  if (!s) return null;
  const shape = ahShapeOf(pick);
  if (!shape) return null;
  const h = shape.h;
  const diff = side === 'away' ? s.away - s.home : s.home - s.away; // 命名队净胜球
  const quarter = Math.round(Math.abs(h) * 100) % 50 === 25;        // .25/.75 → 拆两半
  const lines = quarter ? [h - 0.25, h + 0.25] : [h];
  let sum = 0;
  for (let i = 0; i < lines.length; i++) {
    const r = diff + lines[i];
    sum += r > 0 ? 1 : r < 0 ? -1 : 0; // 每半: 赢 +1 / 走水 0 / 输 -1
  }
  if (lines.length === 1) return sum > 0 ? 'win' : sum < 0 ? 'lose' : 'push';
  if (sum === 2) return 'win';
  if (sum === 1) return 'winHalf';   // 一半赢一半走水
  if (sum === -1) return 'loseHalf'; // 一半输一半走水
  if (sum === -2) return 'lose';
  return 'push';                     // 两半皆走水
}

// ---- 亚盘结果折算系数(新增, 串关结算用) ----
// win=1 / winHalf=0.5 / push=0 / loseHalf=-0.5 / lose=-1; 未知结果返回 null。
function ahFactor(r) {
  const F = { win: 1, winHalf: 0.5, push: 0, loseHalf: -0.5, lose: -1 };
  return Object.prototype.hasOwnProperty.call(F, r) ? F[r] : null;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseScore, judgeDirection, judgeOverUnder, judgeScore,
    judgeBd310, judgeAh, ahFactor, ahLineOf, ahTeamOf,
  };
}
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, HEADER + extracted + '\n' + EXTRA, 'utf8');
console.log('已生成 ' + path.relative(ROOT, OUT).replace(/\\/g, '/')
  + ' (stats.js 抽取 ' + NAMES.length + ' 函数: ' + NAMES.join('/') + ' + 新增 judgeBd310/judgeAh/ahFactor/ahLineOf/ahTeamOf)');
