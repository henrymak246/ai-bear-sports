/* miniprogram/utils/judge.js — 腿判定函数库(微信小程序 / Node 双环境)
 * 由 tools/gen_mini_judge.js 生成, 勿手改; 重新生成: node tools/gen_mini_judge.js
 * parseScore/judgeDirection/judgeOverUnder/judgeScore(含内部助手 parseOverUnder/judgeSegment)
 * 逐字抽取自站点 stats.js, 判定口径与站点一致;
 * judgeBd310(北单让球310)/judgeAh(亚盘)/ahFactor(亚盘折算) 为本模块新增。
 */
'use strict';

function parseScore(finalScore) {
    if (!finalScore) return null;
    const m = String(finalScore).trim().match(/^(\d+)\s*[-:：]\s*(\d+)$/);
    if (!m) return null;
    return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
  }

function judgeDirection(pred, finalScore) {
    if (!pred || pred === '放弃') return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const actual = s.home > s.away ? '主胜' : s.home < s.away ? '客胜' : '平';
    return pred === actual ? 1 : 0;
  }

function parseOverUnder(pred) {
    if (!pred) return null;
    const m = String(pred).trim().match(/^([大小])\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return { side: m[1], line: parseFloat(m[2]) };
  }

function judgeSegment(side, line, goals) {
    if (goals === line) return null;
    const overWin = goals > line;
    return (side === '大') === overWin ? 1 : 0;
  }

function judgeOverUnder(pred, finalScore) {
    const s = parseScore(finalScore);
    if (!s) return null;
    const goals = s.home + s.away;
    const t = String(pred || '').trim().match(/^(\d+)\s*球$/); // 竞彩总进球数：X球
    if (t) return goals === parseInt(t[1], 10) ? 1 : 0;
    const p = parseOverUnder(pred); // 亚盘大小球：大/小 + 盘口
    if (!p) return null;
    const quarter = Math.round(p.line * 100) % 50 === 25; // .25/.75 → 双段
    const lines = quarter ? [p.line - 0.25, p.line + 0.25] : [p.line];
    const results = lines.map(l => judgeSegment(p.side, l, goals));
    const valid = results.filter(r => r !== null);
    if (valid.length === 0) return null;             // 整盘走水，不计入统计
    if (valid.length !== results.length) return 0.5; // 含走水段 → 半中（赢/输一半）
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

function judgeScore(predArr, finalScore) {
    if (!Array.isArray(predArr) || predArr.length === 0) return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const norm = s.home + '-' + s.away;
    return predArr.some(p => String(p).replace(/[:：]/g, '-') === norm) ? 1 : 0;
  }

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

// ---- 亚盘让球判定(新增, stats.js 无此函数) ----
// pick 形态 "美因茨-0.5"/"巴竞技-0.25"/"富勒姆+1.25": 命名队 + 让球数
//   负数 = 命名队让球(上盘), 正数 = 命名队受让(下盘); 判定立场 = 买命名队这一边。
//   无正负数字但含"平手"二字(如 "埃门平手"/"米堡平手")按平手盘 h=0 处理(赢=win/平=push/负=lose)。
// side(可选): 'home' | 'away', 命名队的主客场; 省略时默认 'home'
//   (即"负=主队让/正=主队受让"; 命名队为客队时调用方必须显式传 'away')。
//  quarter 档(.25/.75)拆两半: 如 -0.25 → 0 与 -0.5 两半, +1.25 → +1 与 +1.5 两半;
//   两半结果不同取半档(winHalf/loseHalf), 皆走水为 push。
// 返回 'win'/'winHalf'/'push'/'loseHalf'/'lose'; 比分缺失或盘口无法解析返回 null。
function judgeAh(pick, finalScore, side) {
  const s = parseScore(finalScore);
  if (!s) return null;
  const m = String(pick || '').match(/([+-]\d+(?:\.\d+)?)$/);
  let h;
  if (m) h = parseFloat(m[1]);
  else if (String(pick || '').indexOf('平手') !== -1) h = 0; // 平手盘: 无数字盘口, 按 0 处理
  else return null;
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
  module.exports = { parseScore, judgeDirection, judgeOverUnder, judgeScore, judgeBd310, judgeAh, ahFactor };
}
