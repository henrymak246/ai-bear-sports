/* slip.js — 投注参考图内容层(手写, node/小程序双环境, 纯函数)。
 * slipRows(legs) → [{ title, options }] 逐腿两行(仿竞彩官方计算器弹窗);
 * slipTotals(legs, unit) → { legCount, stakes, amount, maxPayout }(官方口径:
 *   注数=各腿选项数乘积, 理论最高奖金=各腿最大赔率连乘×单注金额, 缺赔率腿按 1 计);
 * slipHeight(legCount) → canvas 逻辑高(750 宽口径)。 */

const WIN_LABEL = { '3': '胜', '1': '平', '0': '负' };   // 北单/让球选项名
const HAD_LABEL = { '3': '主胜', '1': '平', '0': '客胜' }; // 竞彩胜平负选项名

function num(v) {
  const n = parseFloat(String(v === undefined || v === null ? '' : v));
  return isNaN(n) ? 0 : n;
}
/* 赔率展示保留原始字符串('3.20' 不经 parseFloat 往返成 '3.2'), 仅校验为正数 */
function fmtOdds(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  return num(s) > 0 ? s : '';
}
function withOdds(label, odds) { const o = fmtOdds(odds); return o ? label + '(' + o + ')' : label; }

/* pick 按 '/' 拆选项(复式); jcHhad 的 '让-1 3' 空格分隔不含 '/', 天然单选项 */
function pickCodes(pick) {
  return String(pick === undefined || pick === null ? '' : pick).split('/').filter((s) => s !== '');
}

/* bd 腿各选项赔率: sp3=[胜,平,负] 按 3/1/0 索引; 缺 sp3 退 leg.odds 单值。
 * 返回原始值(字符串原样, 展示保留 '3.20' 两位格式; 数值比较处自动数值化) */
function bdOdds(leg, code) {
  const sp3 = leg && leg.sp3;
  if (Array.isArray(sp3) && sp3.length >= 3) {
    return sp3[code === '3' ? 0 : code === '1' ? 1 : 2];
  }
  return leg && leg.odds;
}

/* 每腿最大赔率(理论最高奖金口径); 缺赔率按 1 计不放大 */
function legMaxOdds(leg) {
  if (!leg) return 1;
  if (leg.kind === 'bd') {
    const codes = pickCodes(leg.pick);
    if (codes.length) {
      const m = Math.max.apply(null, codes.map((c) => bdOdds(leg, c)));
      return m > 0 ? m : 1;
    }
  }
  return num(leg.odds) || 1;
}

function slipRows(legs) {
  return (legs || []).filter(Boolean).map((leg) => {
    const kind = leg.kind || 'jcHad';
    if (kind === 'bd') {
      const hc = String(leg.handicap || '0');
      const title = '北单' + (leg.bdNum || '') + ' ' + (leg.home || '') + ' VS ' + (leg.away || '') +
        (hc && hc !== '0' ? ' [让' + hc + ']' : '');
      const codes = pickCodes(leg.pick);
      const options = (codes.length ? codes : ['3'])
        .map((c) => withOdds(WIN_LABEL[c] || c, bdOdds(leg, c)))
        .join('、');
      return { title, options };
    }
    const title0 = (leg.id || '') + ' ' + (leg.home || '') + ' VS ' + (leg.away || '');
    if (kind === 'jcHhad') {
      const parts = String(leg.pick || '').split(/\s+/); // '让-1 3'
      const hcap = (parts[0] || '').replace(/^让/, '');
      const code = parts[1] || '3';
      return { title: title0 + (hcap ? ' [' + hcap + ']' : ''), options: withOdds('让球' + (WIN_LABEL[code] || code), leg.odds) };
    }
    if (kind === 'ah') {
      const o = fmtOdds(leg.odds);
      return { title: title0, options: '亚盘: ' + (leg.pick || '') + (o ? ' @' + o : '') };
    }
    return { title: title0, options: withOdds(HAD_LABEL[leg.pick] || leg.pick || '', leg.odds) };
  });
}

function slipTotals(legs, unit) {
  const u = num(unit) || 2;
  const ls = (legs || []).filter(Boolean);
  let stakes = 1;
  let maxMul = 1;
  ls.forEach((leg) => {
    const codes = pickCodes(leg.pick);
    stakes *= codes.length || 1;
    maxMul *= legMaxOdds(leg);
  });
  return {
    legCount: ls.length,
    stakes,
    amount: Math.round(stakes * u * 100) / 100,
    maxPayout: Math.round(maxMul * u * 100) / 100,
  };
}

/* 布局高(逻辑 px, 宽 750): 头部 110 + 腿行 116/腿 + 金额区 170 */
function slipHeight(legCount) {
  return 110 + 116 * (legCount || 0) + 170;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { slipRows, slipTotals, slipHeight };
}
