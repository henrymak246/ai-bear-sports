/* cart.js — 组串登记计算(微信小程序 / Node 双环境, 手写)。
 * calc(legs): 复式注数=各腿 pick 按 '/' 分割的选项数乘积(单选腿=1);
 *   理论奖金=各腿首选 SP(odds 首段 parseFloat)连乘 × 2 元。
 * buildLeg(match, kind, subPick?):
 *   'jcHad'  竞彩胜平负, pick='3'|'1'|'0'(默认取 match.direction), odds=match.sp[0/1/2]
 *   'jcHhad' 竞彩让球, pick 含 match.spHandicap 文本(空格分隔, 防复式按 '/' 误拆), odds=match.hhad 对应项
 *   'bd'     北单腿整腿透传(match 参数即腿对象)
 *   'ah'     亚盘, pick=match.ahPick, odds=(1+让球方水位).toFixed(2)
 *            水位选择: 命名队≈主队取 ah.home, ≈客队取 ah.away;
 *            主客比对=双向包含优先, 再退最长公共子串≥2 字(容级别名 "巴竞技"="巴拉纳竞技")
 * detectSource(legs): 全 bd='bd' / 全 ah='ah' / 其余(含混合)='jc'。 */

function firstSp(odds) {
  const v = parseFloat(String(odds === undefined || odds === null ? '' : odds).split('/')[0]);
  return isNaN(v) ? 0 : v;
}

function calc(legs) {
  let stakes = 1;
  let payout = 1;
  (legs || []).forEach((leg) => {
    const pick = leg && leg.pick !== undefined && leg.pick !== null ? String(leg.pick) : '';
    const opts = pick.split('/').filter((s) => s !== '').length || 1;
    stakes *= opts;
    payout *= firstSp(leg && leg.odds);
  });
  return { stakes, expectPayout: Math.round(payout * 2 * 100) / 100 };
}

const PICK_LABEL = { '3': '主胜', '1': '平', '0': '客胜' };

/* direction('主胜'/'客胜'/'平') → 310 代码 */
function dirToPick(direction) {
  const d = String(direction || '');
  if (d.indexOf('主') !== -1) return '3';
  if (d.indexOf('平') !== -1) return '1';
  if (d.indexOf('客') !== -1) return '0';
  return '3';
}

function pickIndex(pick) {
  return pick === '3' ? 0 : pick === '1' ? 1 : 2;
}

/* ahPick 中的命名队: 去掉末尾让球数("美因茨-0.5"→"美因茨")或"平手"后缀 */
function ahNamedTeam(ahPick) {
  return String(ahPick || '')
    .replace(/[+-]\d+(?:\.\d+)?$/, '')
    .replace(/平手$/, '')
    .trim();
}

/* 最长公共子串长度(队名很短, O(n*m) DP 足够) */
function lcsLen(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b) return 0;
  let prev = new Array(b.length + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

/* 命名队 ≈ 主队还是客队: 双向包含优先; 否则最长公共子串≥2 字取较大侧(别名容错) */
function teamSide(named, home, away) {
  const n = String(named || '');
  const h = String(home || '');
  const a = String(away || '');
  if (!n) return 'home';
  if (h && (h.indexOf(n) !== -1 || n.indexOf(h) !== -1)) return 'home';
  if (a && (a.indexOf(n) !== -1 || n.indexOf(a) !== -1)) return 'away';
  const lh = lcsLen(n, h);
  const la = lcsLen(n, a);
  if (lh >= 2 || la >= 2) return la > lh ? 'away' : 'home';
  return 'home';
}

function buildLeg(match, kind, subPick) {
  // 北单: 整腿透传
  if (kind === 'bd') {
    const leg = Object.assign({}, match);
    leg.kind = 'bd';
    leg.desc = '北单' + (leg.bdNum || '') + ' ' + (leg.match || '') +
      ' ' + (leg.pick || '') + '@' + String(leg.odds === undefined ? '' : leg.odds).split('/')[0];
    return leg;
  }

  const m = match || {};
  const head = (m.id || '') + ' ' + (m.home || '') + 'vs' + (m.away || '');

  if (kind === 'jcHhad') {
    const pick = subPick || dirToPick(m.direction);
    const hcap = m.spHandicap;
    const hcapText = '让' + (hcap > 0 ? '+' + hcap : hcap);
    const raw = m.hhad && m.hhad[pickIndex(pick)];
    const odds = raw === undefined || raw === null ? '' : String(raw);
    return {
      kind: 'jcHhad',
      id: m.id || '',
      home: m.home || '',
      away: m.away || '',
      league: m.league || '', // 供投注结算走 ESPN 实时取分(settle.fetchScoreForLeg)
      pick: hcapText + ' ' + pick,
      odds,
      desc: head + ' 让球' + (hcap > 0 ? '+' + hcap : hcap) + ' ' + (PICK_LABEL[pick] || pick) +
        (odds ? '@' + odds : ''),
    };
  }

  if (kind === 'ah') {
    const named = ahNamedTeam(m.ahPick);
    const side = teamSide(named, m.home, m.away);
    const water = m.ah ? (side === 'away' ? m.ah.away : m.ah.home) : '';
    const w = parseFloat(water);
    const odds = isNaN(w) ? '' : (1 + w).toFixed(2);
    return {
      kind: 'ah',
      id: m.id || '',
      home: m.home || '',
      away: m.away || '',
      league: m.league || '', // 供投注结算走 ESPN 实时取分
      pick: m.ahPick || '',
      odds,
      desc: head + ' 亚盘 ' + (m.ahPick || '') + (odds ? '@' + odds : ''),
    };
  }

  // 默认 jcHad
  const pick = subPick || dirToPick(m.direction);
  const raw = m.sp && m.sp[pickIndex(pick)];
  const odds = raw === undefined || raw === null ? '' : String(raw);
  return {
    kind: 'jcHad',
    id: m.id || '',
    home: m.home || '',
    away: m.away || '',
    league: m.league || '', // 供投注结算走 ESPN 实时取分
    pick,
    odds,
    desc: head + ' 胜平负 ' + (PICK_LABEL[pick] || pick) + (odds ? '@' + odds : ''),
  };
}

/* ---- 编辑腿的 310 选项(纯函数, 零网络; 需要当日赔率时由调用方回拉 payload 传 match 进来) ---- */

const CODES = ['3', '1', '0']; // 固定序: 与 sp3/sp 数组下标、odds 分段一一对应

/* 拆一段 pick: '让-1 3' → {hcap:'让-1', code:'3'}; 无盘口前缀 → {hcap:'', code:原样} */
function splitPick(seg) {
  const m = String(seg === undefined || seg === null ? '' : seg).trim().match(/^(让[+-]?\d+)\s+(.+)$/);
  return m ? { hcap: m[1], code: m[2].trim() } : { hcap: '', code: String(seg === undefined || seg === null ? '' : seg).trim() };
}

/* 该腿是否北单形态 —— 与 settle.settleLeg 的分派口径一致(有 handicap 字段即北单) */
function isBdLeg(leg) {
  return !!leg && leg.handicap !== undefined && leg.handicap !== null && leg.handicap !== '';
}

/* 编辑弹层用: 三个 310 选项 + 各自赔率 + 当前是否选中 + 是否可选。
   赔率来源优先级(★判据是"结算用哪个源", 编辑器就该显示哪个源, 否则界面上的数与奖金无关):
     北单腿 → 腿自带 sp3(settle.legSpFactor 的 handicap 分支就是从 sp3 按赛果列取 SP),
              腿自带 odds 只在 sp3 缺失时兜底(纯删选项零网络);
     竞彩腿 → 现有 pick↔odds 平行分段('3/1' ↔ '2.50/3.52', 结算读的就是 odds)零网络,
              本地缺的码再用 match(调用方回拉的当日推荐 match.sp / match.hhad)。
   odds 为空的选项 disabled=true, 调用方必须置灰不可选: 赔率写错的后果是 legSpFactor 拿到 0,
   整票仍判"命中"但奖金 0(profit=-amount), 界面当下看不出坏, 坏账要等几天后结算才暴露。 */
function optionsOf(leg, match) {
  const l = leg || {};
  const segs = String(l.pick === undefined || l.pick === null ? '' : l.pick).split('/');
  const oddsSegs = String(l.odds === undefined || l.odds === null ? '' : l.odds).split('/');
  const fromOdds = {}; // code → 腿内 pick↔odds 平行分段里的赔率(按下标对齐, 不是按 3/1/0 序)
  const on = {};
  segs.forEach(function (seg, i) {
    const code = splitPick(seg).code;
    if (CODES.indexOf(code) < 0) return; // 脏码挡掉: pickIndex 对非 3/1/0 会静默返回 2(拿"负"的 SP)
    on[code] = true;
    if (oddsSegs[i]) fromOdds[code] = oddsSegs[i];
  });
  const bd = isBdLeg(l);
  const sp3 = bd && Array.isArray(l.sp3) && l.sp3.length >= 3 ? l.sp3 : null;
  // 北单腿不查 payload(matches 里没有北单场次), 竞彩腿才认 match
  const hcap = splitPick(segs[0]).hcap; // jcHhad 的盘口前缀
  const remote = bd ? null : ((match && ((hcap ? match.hhad : match.sp) || null)) || null);
  return CODES.map(function (code) {
    let odds = '';
    if (bd) {
      const v = sp3 ? sp3[pickIndex(code)] : undefined;
      odds = v === undefined || v === null ? (fromOdds[code] || '') : String(v);
    } else {
      const v = remote ? remote[pickIndex(code)] : undefined;
      odds = fromOdds[code] || (v === undefined || v === null ? '' : String(v));
    }
    return { code: code, label: PICK_LABEL[code], odds: odds, on: !!on[code], disabled: !odds };
  });
}

/* 生成新腿: 只换 pick/odds/desc, 并清 result —— 其余字段(盘口/比分/sp3/联赛/队名)原样保留。
   oddsByCode = {'3':'2.10','1':'3.40'}(喂 optionsOf 的结果, 调用方保证每个选中码都有赔率)。
   ★finalScore 一定要留: 留着才能"改完按已有比分立刻重判"零网络完成(不必等 ESPN/回拉 payload)。
     (2026-09-15 前 jc 腿的 legKey 恒为 '' —— legKey 只认 match, 而 buildLeg 不产 match 字段,
      导致结算取分只有 ESPN 一条通道且同轮腿间串味; 已修成 legKey 兜底 leg.id, 见 settle.legKey。)
   ★result==='push' 要留: 那是站点数据"该场未开售不计断"的语义(judgeBd310 的 manualResult),
     清掉会把一条合法的走水腿变成真实判定, 整票可能被误判 miss。
   选项未变也照常返回新腿(供调用方重置已结算票的状态)。 */
function applyPicks(leg, codes, oddsByCode) {
  const l = Object.assign({}, leg || {});
  const by = oddsByCode || {};
  const cs = CODES.filter(function (c) { return (codes || []).indexOf(c) >= 0; });
  if (!cs.length) return null;
  const odds = cs.map(function (c) {
    return String(by[c] === undefined || by[c] === null ? '' : by[c]);
  }).join('/');
  const labels = cs.map(function (c) { return PICK_LABEL[c]; }).join('/');
  const head = (l.id || '') + ' ' + (l.home || '') + 'vs' + (l.away || '');
  const first = odds.split('/')[0] || '';
  const at = first ? '@' + first : '';

  if (isBdLeg(l)) {
    l.pick = cs.join('/'); // 北单: pick 是纯 310 码, 让球数在独立的 handicap 字段里
    l.odds = odds;
    l.desc = '北单' + (l.bdNum || '') + ' ' + (l.match || '') + ' ' + l.pick + at;
  } else {
    const hcap = splitPick(String(l.pick === undefined || l.pick === null ? '' : l.pick).split('/')[0]).hcap;
    l.pick = hcap ? hcap + ' ' + cs.join('/') : cs.join('/');
    l.odds = odds;
    l.desc = hcap
      ? head + ' 让球' + hcap.replace(/^让/, '') + ' ' + labels + at
      : head + ' 胜平负 ' + labels + at;
  }
  if (l.result !== 'push') delete l.result; // 已判结果作废重来; push 例外
  return l;
}

function detectSource(legs) {
  const ls = (legs || []).filter(Boolean);
  if (ls.length && ls.every((l) => l.kind === 'bd')) return 'bd';
  if (ls.length && ls.every((l) => l.kind === 'ah')) return 'ah';
  return 'jc';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calc, buildLeg, detectSource, optionsOf, applyPicks };
}
