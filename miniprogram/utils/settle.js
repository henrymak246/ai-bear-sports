/* settle.js — 投注结算模块(微信小程序 / Node 双环境, 手写)
 * settleLeg(leg, finalScore)      单腿判定 → 'hit'|'miss'|'half'|'push'|null(未完场)
 *   分派: 有 handicap 字段 → 北单 judgeBd310;
 *         pick 含 +/-数字盘口或"平手" → 亚盘 judgeAh(side 自动推导);
 *         否则 → 竞彩方向 judgeDirection('3'→主胜/'1'→平/'0'→客胜, 多选按 '/' 拆)。
 *   leg.result 已是 hit/miss/half/push 时直接沿用(人工回填/北单未开售 push 优先)。
 * settleBet(bet, scoreOf)         全腿有结果才结算, 否则返回 null(调用方做腿级就地展示)。
 *   状态: 任一 miss → miss(奖金 0); 无 miss 有 half → half; 其余 → hit(push 腿不计断)。
 *   奖金: 命中腿 SP 连乘 × unit(北单按让球后赛果列取 sp3 / 竞彩取 odds 首段 /
 *         亚盘 win=odds、winHalf=(odds-1)/2+1、loseHalf=0.5、push 不入连乘)。
 * fetchScoreForLeg(leg, betDate, fetcher)  ESPN 按 league 查完场比分(STATUS_FULL_TIME 才返回,
 *   死链联赛/未命中/未完场 → null, 调用方回退 prediction_days 的 finalScore)。
 * calcStats(bets)                 统计卡: 总投入/总回收/净盈亏/命中率(hit+0.5×half 占已结算比)。
 */
'use strict';

const judge = require('./judge.js');
const espn = require('./espn.js');

const DIR_MAP = { '3': '主胜', '1': '平', '0': '客胜' };
const RESULT_VOCAB = { hit: 1, miss: 1, half: 1, push: 1 };
const AH2VOCAB = { win: 'hit', winHalf: 'half', push: 'push', loseHalf: 'half', lose: 'miss' };

/* 队名别名(双向比对): 腿 pick 命名队 ↔ leg.home/away 常用名 */
const TEAM_ALIAS = [
  ['巴竞技', '巴拉纳竞技'],
  ['RB莱比锡', '莱红牛'],
  ['蔚山HD', '蔚山现代'],
  ['哈马费萨', 'Al Faisaly'],
];

function aliasesOf(name) {
  const low = String(name || '').toLowerCase();
  const out = [];
  TEAM_ALIAS.forEach(function (pair) {
    if (low === pair[0].toLowerCase()) out.push(pair[1]);
    if (low === pair[1].toLowerCase()) out.push(pair[0]);
  });
  return out;
}

function nameEq(a, b) {
  if (!a || !b) return false;
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  return x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
}

/* pick 是否亚盘形态: 尾部 +/-数字盘口(美因茨-0.5/富勒姆+1.25)或含"平手" */
function isAhPick(pick) {
  const p = String(pick || '');
  return /[+-]\d+(?:\.\d+)?$/.test(p) || p.indexOf('平手') !== -1;
}

/* pick 截掉尾部盘口数字/平手二字 → 命名队 */
function pickTeam(pick) {
  return String(pick || '')
    .replace(/[+-]\d+(?:\.\d+)?$/, '')
    .replace(/平手/g, '')
    .trim();
}

/* side 推导: 命名队与 leg.home/away 子串比对(不区分大小写) → 'home'|'away';
   直比对失败走别名容错, 仍失败默认 'home' 并标 sideGuess。 */
function deriveAhSide(pick, home, away) {
  const team = pickTeam(pick);
  const candidates = [team].concat(aliasesOf(team));
  for (let i = 0; i < candidates.length; i++) {
    if (nameEq(candidates[i], home)) return { side: 'home', sideGuess: false, team: team };
    if (nameEq(candidates[i], away)) return { side: 'away', sideGuess: false, team: team };
  }
  return { side: 'home', sideGuess: true, team: team };
}

/* 亚盘腿判定(保留 judgeAh 原始五值, 供冒烟/诊断用) → {result, side, sideGuess, team} */
function judgeAhLeg(leg, finalScore) {
  const d = deriveAhSide(leg && leg.pick, leg && leg.home, leg && leg.away);
  const result = judge.judgeAh(leg && leg.pick, finalScore, d.side);
  return { result: result, side: d.side, sideGuess: d.sideGuess, team: d.team };
}

/* 单腿判定 → 'hit'|'miss'|'half'|'push'|null */
function settleLeg(leg, finalScore) {
  if (!leg) return null;
  if (RESULT_VOCAB[leg.result]) return leg.result; // 人工/已判结果优先(含北单未开售 push)
  if (leg.handicap !== undefined && leg.handicap !== null && leg.handicap !== '') {
    return judge.judgeBd310(leg.pick, leg.handicap, finalScore, leg.result);
  }
  if (isAhPick(leg.pick)) {
    const r = judge.judgeAh(leg.pick, finalScore, deriveAhSide(leg.pick, leg.home, leg.away).side);
    return r ? AH2VOCAB[r] : null;
  }
  // 竞彩方向腿: '3'/'1'/'0' 映射主胜/平/客胜, 多选按 '/' 拆, 命中其一即红
  const s = judge.parseScore(finalScore);
  if (!s) return null;
  const picks = String(leg.pick || '').split('/');
  let judgeable = false;
  for (let i = 0; i < picks.length; i++) {
    const text = DIR_MAP[picks[i].trim()] || picks[i].trim();
    const r = judge.judgeDirection(text, finalScore);
    if (r === 1) return 'hit';
    if (r === 0) judgeable = true;
  }
  return judgeable ? 'miss' : null;
}

/* 腿的 match 键: 前三位数字(竞彩/北单场次号)否则全文 */
function legKey(leg) {
  const m = String((leg && leg.match) || '');
  return /^\d{3}/.test(m) ? m.slice(0, 3) : m;
}

/* 命中腿 SP 连乘因子 */
function legSpFactor(leg, finalScore, result) {
  if (result === 'push') return 1;
  const odds = parseFloat(String((leg && leg.odds) || '').split('/')[0]) || 0;
  if (leg.handicap !== undefined && leg.handicap !== null && leg.handicap !== '') {
    // 北单: 按让球后赛果列取 sp3('3'→[0]/'1'→[1]/'0'→[2]), 缺 sp3/无比分回退 odds 首段
    const s = judge.parseScore(finalScore);
    if (s && Array.isArray(leg.sp3) && leg.sp3.length >= 3) {
      const hc = parseInt(leg.handicap, 10) || 0;
      const adj = s.home + hc;
      const actual = adj > s.away ? '3' : adj < s.away ? '0' : '1';
      const sp = parseFloat(leg.sp3[actual === '3' ? 0 : actual === '1' ? 1 : 2]);
      if (sp > 0) return sp;
    }
    return odds;
  }
  if (isAhPick(leg.pick)) {
    if (result === 'hit') return odds; // win 全赢
    if (result === 'half') {
      const raw = judge.judgeAh(leg.pick, finalScore, deriveAhSide(leg.pick, leg.home, leg.away).side);
      return raw === 'winHalf' ? (odds - 1) / 2 + 1 : 0.5; // winHalf 折算 / loseHalf 输半
    }
    return odds;
  }
  return odds; // 竞彩腿 odds 单值
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* 整串结算: 全腿有结果才结算 → {status, actual_payout, profit, settled_at, legs} | null */
function settleBet(bet, scoreOf) {
  if (!bet || !Array.isArray(bet.legs) || !bet.legs.length) return null;
  const legs = bet.legs.map(function (leg) {
    const key = legKey(leg);
    const fs = leg.finalScore || (scoreOf ? scoreOf(key, leg) : null) || null;
    const result = settleLeg(leg, fs);
    return Object.assign({}, leg, { finalScore: fs || leg.finalScore || '', result: result });
  });
  if (legs.some(function (l) { return !l.result; })) return null; // 有未完场, 不结算
  const unit = parseFloat(bet.unit) || 2;
  const amount = parseFloat(bet.amount) || 0;
  const miss = legs.some(function (l) { return l.result === 'miss'; });
  const half = legs.some(function (l) { return l.result === 'half'; });
  const status = miss ? 'miss' : half ? 'half' : 'hit';
  let payout = 0;
  if (!miss) {
    let acc = unit;
    legs.forEach(function (l) { acc *= legSpFactor(l, l.finalScore, l.result); });
    payout = round2(acc);
  }
  return {
    status: status,
    actual_payout: payout,
    profit: round2(payout - amount),
    settled_at: new Date().toISOString(),
    legs: legs,
  };
}

/* YYYYMMDD(UTC 基准) */
function ymd(ms) {
  const d = new Date(ms);
  return '' + d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
}

/* ESPN 查腿完场比分 → 'h-a' | null。betDate(YYYY-MM-DD) 驱动取两日板
   (预测日场次落在当日晚~次日凌晨, ET 口径覆盖), 缺省回退 DATES()(北京今日/明日)。 */
async function fetchScoreForLeg(leg, betDate, fetcher) {
  try {
    const code = espn.LEAGUE_MAP[(leg && leg.league) || ''];
    if (!code) return null; // 死链联赛(韩职等显式 null)/缺联赛 → 调用方回退
    let home = leg.home;
    let away = leg.away;
    if (!home || !away) {
      const m = String(leg.match || '').replace(/^\d+\s*/, '');
      const parts = m.split(/\s+vs\s+/);
      home = home || parts[0] || '';
      away = away || parts[1] || '';
    }
    if (!home || !away) return null;
    let dates;
    if (betDate && /^\d{4}-\d{2}-\d{2}$/.test(betDate)) {
      const t = Date.parse(betDate + 'T00:00:00Z');
      dates = [ymd(t), ymd(t + 86400000)];
    } else {
      dates = espn.DATES();
    }
    const boards = [];
    for (let i = 0; i < dates.length; i++) {
      try {
        const rows = await espn.fetchBoard(code, dates[i], fetcher);
        boards.push.apply(boards, rows);
      } catch (e) { /* 单日拉取失败忽略, 看另一日 */ }
    }
    const ev = espn.findScore(boards, home, away);
    if (!ev || ev.st !== 'STATUS_FULL_TIME') return null; // 未完场不返分
    return ev.hs + '-' + ev.as;
  } catch (e) {
    return null;
  }
}

/* 统计卡: 命中率=已结算中 (hit + 0.5×half) 占比(%, 一位小数, 无已结算为 null) */
function calcStats(bets) {
  const st = {
    count: 0, pending: 0, settled: 0, hit: 0, half: 0, miss: 0,
    totalAmount: 0, totalPayout: 0, profit: 0, hitRate: null,
  };
  (bets || []).forEach(function (b) {
    st.count++;
    st.totalAmount += parseFloat(b.amount) || 0;
    if (!b.status || b.status === 'pending') { st.pending++; return; }
    st.settled++;
    st.totalPayout += parseFloat(b.actual_payout) || 0;
    st.profit += parseFloat(b.profit) || 0;
    if (b.status === 'hit') st.hit++;
    else if (b.status === 'half') st.half++;
    else if (b.status === 'miss') st.miss++;
  });
  st.totalAmount = round2(st.totalAmount);
  st.totalPayout = round2(st.totalPayout);
  st.profit = round2(st.profit);
  st.hitRate = st.settled > 0 ? Math.round(((st.hit + st.half * 0.5) / st.settled) * 1000) / 10 : null;
  return st;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    settleLeg, settleBet, fetchScoreForLeg, calcStats,
    judgeAhLeg, deriveAhSide, isAhPick, legKey, legSpFactor,
  };
}
