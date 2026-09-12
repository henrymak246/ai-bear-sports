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
    pick,
    odds,
    desc: head + ' 胜平负 ' + (PICK_LABEL[pick] || pick) + (odds ? '@' + odds : ''),
  };
}

function detectSource(legs) {
  const ls = (legs || []).filter(Boolean);
  if (ls.length && ls.every((l) => l.kind === 'bd')) return 'bd';
  if (ls.length && ls.every((l) => l.kind === 'ah')) return 'ah';
  return 'jc';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calc, buildLeg, detectSource };
}
