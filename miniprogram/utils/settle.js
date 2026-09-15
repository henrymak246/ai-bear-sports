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
 *   腿缺联赛中文名(北单/旧票)时按场次号在当日 MATCH_LEAGUES 里兜底;
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
  // 竞彩让球腿: pick='让-1 3'(盘口在 pick 里, 没有独立 handicap 字段, isAhPick 也判不出来)
  //   → 剥掉前缀按让球后赛果判。此前落到下面的方向分支, judgeDirection 严格全等中文赛果恒为 0
  //     → jcHhad 腿**恒判 miss**; 复式 '让-1 3/1' 的第二段 '1' 更会被当普通平局判, 与正确结论相反。
  const hm = String(leg.pick || '').match(/^让([+-]?\d+)\s+(.+)$/);
  if (hm) return judge.judgeBd310(hm[2], hm[1], finalScore, leg.result);
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

/* 腿的「场次号」键(3 位数字): 北单腿取 match("011 比利亚雷 vs 贝蒂斯"→'011'), 竞彩腿取
   id("周一003"→'003') —— ★竞彩腿**没有 match 字段**(cart.buildLeg 的 jcHad/jcHhad 只给 id),
   旧实现直接返回 '' , 于是同轮里所有竞彩腿共用一个键, 两处同时坏:
   ①投注页 scoreCache 的槽位是 bet_date|legKey → 竞彩腿全部挤在同一槽, 先取到分的那条腿的比分
     被复制给其余竞彩腿(2026-09-15 实判: 003 科莫 2-1 串给 004 都灵vs罗马, 真值 0-2, 客胜红被
     写成黑, 该票 3.11 元与另一票 4.67 元两注中奖被误记为失);
   ②payloadScore 的 String(id).slice(-3)===key 对空 key 永不成立 → 竞彩腿的 finalScore 回退
     彻底失效(ESPN 断链时永远等不到分)。
   取不到 3 位数字时返回原文(缺 match/id 的极老腿保持旧行为, 由调用方各自兜底)。 */
function legKey(leg) {
  const raw = String((leg && (leg.match || leg.id)) || '');
  const m = raw.match(/\d{3}/);
  return m ? m[0] : raw;
}

/* 命中项在 pick '/' 分段里的下标(不可判/找不到 → -1)。
   ★必须 kind-aware: 只改"竞彩方向"分支救不了 jcHhad —— 它没有 handicap 字段、isAhPick('让-1 3/1') 又是
     false(尾部不是 +/-数字), 会和 jcHad 走同一行。jcHhad 逐段剥盘口前缀后交 judgeBd310(单段→命中即该段);
     其余逐段 DIR_MAP 映射后 judgeDirection。 */
function hitPickIndex(leg, finalScore) {
  if (!leg) return -1;
  const raw = String(leg.pick === undefined || leg.pick === null ? '' : leg.pick);
  const segs = raw.split('/');
  const hm = raw.match(/^让([+-]?\d+)\s+/);
  for (let i = 0; i < segs.length; i++) {
    if (hm) {
      const code = segs[i].trim().replace(/^让[+-]?\d+\s+/, ''); // 首段带盘口, 后续段只有码
      if (judge.judgeBd310(code, hm[1], finalScore) === 'hit') return i;
    } else {
      const code = segs[i].trim();
      if (judge.judgeDirection(DIR_MAP[code] || code, finalScore) === 1) return i;
    }
  }
  return -1;
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
  // 竞彩腿(胜平负/让球): 按**命中项**的下标取 SP —— 复式 '3/1' 命中第 2 码时不能还按第 1 码算奖金。
  //   此前这里直接 return odds(odds 开头就 split('/')[0] 只取首段) → 复式腿奖金算错(偏小或偏大)。
  //   下标 -1(不可判/找不到)或该段为空 → 回退首段(= 旧行为); 绝不能返回 0:
  //   legSpFactor 返回 0 会让 acc=0, 整票仍判 'hit' 但 actual_payout=0、profit=-amount,
  //   界面当下看不出坏, 而票已写成"命中/回收 0.00"、betNeedsPoll 又不会再碰它。
  const idx = hitPickIndex(leg, finalScore);
  const picked = idx >= 0 ? parseFloat(String(leg.odds || '').split('/')[idx]) : NaN;
  return picked > 0 ? picked : odds;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/* 整串结算: 全腿有结果 或 任一腿 miss → {status, actual_payout, profit, settled_at, legs} | null
   串关一腿失即全失, miss 判定不依赖其他腿 → 一旦有腿 miss 立即结算(奖金 0), 不等其余腿完场;
   无 miss 则必须全腿完场才能连乘(缺任一腿结果 → null, 调用方做腿级就地展示)。
   提前判死时未完场腿以 result=null/finalScore='' 一并返回, 调用方据此继续更新展示。 */
function settleBet(bet, scoreOf) {
  if (!bet || !Array.isArray(bet.legs) || !bet.legs.length) return null;
  const legs = bet.legs.map(function (leg) {
    const key = legKey(leg);
    const fs = leg.finalScore || (scoreOf ? scoreOf(key, leg) : null) || null;
    const result = settleLeg(leg, fs);
    return Object.assign({}, leg, { finalScore: fs || leg.finalScore || '', result: result });
  });
  const miss = legs.some(function (l) { return l.result === 'miss'; });
  if (!miss && legs.some(function (l) { return !l.result; })) return null; // 无 miss 且有未完场, 不结算
  const unit = parseFloat(bet.unit) || 2;
  const amount = parseFloat(bet.amount) || 0;
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

/* 是否还需继续查腿(结算/轮询的目标筛选): 整票未结算, 或任一腿尚无判定。
   不能用 status==='pending' 当判据: 提前判死后(miss)其余未完场腿仍要继续更新展示。
   腿判定走 settleLeg(leg, leg.finalScore): 已判/可判(含人工回填、北单未开售 push)即算已定。 */
function betNeedsPoll(bet) {
  if (!bet || !Array.isArray(bet.legs) || !bet.legs.length) return false;
  if (!bet.status || bet.status === 'pending') return true; // 含"回写失败"自愈
  return bet.legs.some(function (leg) {
    return !settleLeg(leg, (leg && leg.finalScore) || null);
  });
}

/* YYYYMMDD(UTC 基准) */
function ymd(ms) {
  const d = new Date(ms);
  return '' + d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
}

/* 腿缺联赛中文名时的兜底: 用场次号(前三位)在当日 MATCH_LEAGUES('周一002'→'esp.1')里按后缀比对
   —— 键含星期, 由 gen_mini_espn.js 每日从最新 _live<MMDD>.js 重生成, 故不写死"周X";
   历史票的场次不在当日表 → undefined(行为同"缺联赛", 仍回退 finalScore)。 */
function matchLeagueCode(leg) {
  const num = legKey(leg);
  if (!/^\d{3}$/.test(num)) return undefined;
  const keys = Object.keys(espn.MATCH_LEAGUES || {});
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].slice(-3) === num) return espn.MATCH_LEAGUES[keys[i]];
  }
  return undefined;
}

/* ESPN 查腿完场比分 → 'h-a' | null。betDate(YYYY-MM-DD) 驱动取两日板
   (预测日场次落在当日晚~次日凌晨, ET 口径覆盖), 缺省回退 DATES()(北京今日/明日)。 */
async function fetchScoreForLeg(leg, betDate, fetcher) {
  try {
    // 有中文联赛名以 LEAGUE_MAP 为准(含"韩职"等显式死链 null); 缺名字(北单/旧票) → 场次号兜底
    const lname = (leg && leg.league) || '';
    const code = Object.prototype.hasOwnProperty.call(espn.LEAGUE_MAP, lname)
      ? espn.LEAGUE_MAP[lname]
      : matchLeagueCode(leg);
    if (!code) return null; // 死链联赛/无兜底 → 调用方回退
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
    hitPickIndex, betNeedsPoll,
  };
}
