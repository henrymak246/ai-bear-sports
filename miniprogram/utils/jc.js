/* jc.js — 竞彩官方实时赔率(2026-09-15 新增)。
   ★要解决的问题: data/predictions.js 里每场的 sp/hhad 是**每天构建那一刻**从体彩官方抓的快照
     (tools/_fetch_jc.js → tools/_build<MMDD>.js), 之后官方继续浮动, 页面却永远停在构建值。
     2026-09-15 实测: 11 场在售里 9 场已与官方脱节(005 北京国安主胜 1.64→1.42、004 柔佛 1.41→1.35),
     且已过销售截止的 001/002/003 仍挂在页面上可投注 —— 拿它跟官方 App 一比就是"数据不对"。
   取数通道: 云函数 bear_api 的 jc_live 分支(腾讯云国内机房 → webapi.sporttery.cn 也是国内,
     国内→国内 实测 333ms, **没有** ESPN 那条跨境 3 秒超时的毛病, 故不做结果缓存)。
   ★overlay() 是纯函数且**只读不写**: 拿不到实时数据就原样返回入参 —— 网络问题绝不能让页面变白。
   ★只在「日对象日期 == 北京时间今天」时叠加: 补看历史某天的页面时, 官方池里当然没有那些场次,
     若无条件叠加会把整页历史场次误标成"已停售"。 */
const TODAY_GUARD = true; // 见文件头 ★; 置 false 可关掉日期闸(调试用)

/* 北京时间今天的 'YYYY-MM-DD' */
function todayBj() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

function cloudFnName() {
  try {
    const c = require("./config.js");
    return (c && c.CLOUD_FN) || "bear_api";
  } catch (e) { return "bear_api"; }
}

function cloudReady() {
  return typeof wx !== "undefined" && wx.cloud && typeof wx.cloud.callFunction === "function";
}

/* 云函数 jc_live → { pools, fetchedAt, rows: { 场次号: {num,date,league,home,away,time,st,goalLine,sp,hhad,upd} } }
   ★重试一次: 与 espn.js 同理, 抖动是瞬时的; 只用于**只读取数**, 任何写操作都不重试。 */
const JC_RETRY = 1;
const JC_RETRY_DELAY = 300;

async function fetchLive(pools) {
  if (!cloudReady()) throw new Error("竞彩实时赔率需要云函数通道(当前环境没有 wx.cloud)");
  let last = null;
  for (let i = 0; i <= JC_RETRY; i++) {
    if (i) await new Promise((r) => setTimeout(r, JC_RETRY_DELAY));
    try {
      const res = await wx.cloud.callFunction({
        name: cloudFnName(),
        data: { fn: "jc_live", args: { pools: pools || ["had", "hhad"] } },
      });
      const r = res && res.result;
      if (!r || r.ok !== true) {
        throw new Error("云函数 jc_live 失败: " + ((r && r.error) || "无返回(检查云函数 bear_api 是否已部署)"));
      }
      if (!r.data || !r.data.rows) throw new Error("云函数 jc_live 返回形态异常");
      return r.data;
    } catch (e) { last = e; }
  }
  throw new Error(String((last && last.message) || last) + "(已重试 " + JC_RETRY + " 次)");
}

/* 该日对象该不该走实时口径(页面在**发请求之前**也用这个判断, 免得补看历史某天时白打一次云函数)。
   dayDate 为空(旧缓存没有 date 字段)时按"不叠加"处理, 宁可不叠加也不能误标停售。 */
function isToday(dayDate) {
  if (!TODAY_GUARD) return true;
  return !!dayDate && dayDate === todayBj();
}

/* 该场次在实时池里的赔率行; 取不到返回 null */
function rowOf(live, id) {
  if (!live || !live.rows) return null;
  return live.rows[id] || null;
}

/* 实时行 → 一个「覆盖后的场次对象」。
   ★字段名故意与日对象**同名**(sp/hhad/spHandicap), 这样页面与 cart.js 一行都不用改;
     额外的 oddsLive/oddsClosed/oddsUpd 只用于显示角标。 */
function applyRow(m, row) {
  const out = Object.assign({}, m);
  out.oddsLive = true;
  out.oddsClosed = false;
  out.oddsUpd = (row && row.upd) || "";
  out.liveSt = (row && row.st) || "";
  // 官方池里只有让球、没有胜平负 → 让球-only。显式 set(而不是留给快照推断):
  // 构建时开着 310、临场却关掉的那种, 只有官方池说了算。见 noHadOf
  out.noHad = !(row && row.sp) && !!(row && row.hhad);
  if (row && row.sp) out.sp = row.sp.slice();
  if (row && row.hhad) out.hhad = row.hhad.slice();
  if (row && row.goalLine !== null && row.goalLine !== undefined) out.spHandicap = row.goalLine;
  return out;
}

/* matches + 实时池 → 新的 matches 数组(纯函数, 不改入参)。
   dayDate = 该日对象的 date('YYYY-MM-DD'); live = fetchLive() 的返回, 可为 null。
   · live 为 null(取数失败) / 日对象不是今天 → 原样返回, 页面照旧显示构建时快照;
   · 场次不在实时池(已过销售截止被官方下架) → oddsClosed=true, sp/hhad 保持构建值但页面须禁投。 */
function overlay(matches, live, dayDate) {
  const list = Array.isArray(matches) ? matches : [];
  if (!live || !live.rows) return list;
  if (!isToday(dayDate)) return list;
  return list.map(function (m) {
    const row = rowOf(live, m && m.id);
    if (row) return applyRow(m, row);
    const out = Object.assign({}, m);
    out.oddsLive = true;
    out.oddsClosed = true;
    out.oddsUpd = "";
    out.liveSt = "";
    return out;
  });
}

/* 页面用: 拉实时赔率并叠加, 一步到位。任何失败都吞掉并返回原数组(绝不抛给页面)。 */
async function fetchAndOverlay(payload, opts) {
  const matches = (payload && payload.matches) || [];
  if (!matches.length) return { matches: matches, live: null, error: "" };
  try {
    const live = await fetchLive();
    return { matches: overlay(matches, live, payload && payload.date), live: live, error: "" };
  } catch (e) {
    return { matches: matches, live: null, error: String((e && e.message) || e) };
  }
}

/* ===== 方案块(hc7/max7)与方案卡大号倍数的实时同步 =====
   ★与网站 assets/live-odds.js **同一套口径**(小程序与浏览器无法共用模块, 只能各留一份, 改一处必须改另一处):
     · 带 result 的腿已结算 → 一律不碰;
     · 不在实时池(已过销售截止被下架)的场次 → 赔率沿用构建值, 但要在括号里点数说明;
     · 数字后面必须**确实跟着「倍」**才是同一个口径(如 '≈18万倍级' 里的 18 就不是)。
   ★为什么要动它: 方案卡的 '≈858倍' 与 hc7.totalOdds 是构建脚本同源写出的同一个数。
     腿一旦实时化而这里不跟着走, 卡片上就会是"一列新赔率配一个旧倍数", 用户一乘就说不对。
     2026-09-15 实测: 让球七关连乘已从 858 漂到 705。 */

/* 方案腿的选项 → 赔率下标。
   ★必须整词匹配: 「客胜」含'胜'字, 按单字判会归到主胜(下标 0), 客胜腿就拿到主胜的赔率。 */
function pickIdx(pick) {
  const p = String(pick || "").trim();
  if (p === "主胜" || p === "让胜") return 0;
  if (p === "平" || p === "让平") return 1;
  if (p === "客胜" || p === "让负") return 2;
  if (p.indexOf("主") !== -1) return 0;
  if (p.indexOf("客") !== -1 || p.indexOf("负") !== -1) return 2;
  if (p.indexOf("平") !== -1) return 1;
  return -1;
}

const legNum = (s) => String(s || "").slice(0, 3);
const id3 = (m) => String((m && m.id) || "").slice(-3);

/* 这场是不是「官方只开了让球、没开胜平负」(让球-only)?
   ★2026-09-15 用户拿 013 埃尔切vs皇马 指出: 官方只开了 让+2, 没有 310(胜平负)通道 ——
     而页面还在卡片上顶着一个胜平负口径的方向「客胜」, 那是个**投不了的盘**。
   ★判据: 官方 had 池里没有它、hhad 池里有它(overlay 拿得到实时池时以官方为准, set noHad);
     拿不到实时值(历史日/取数失败)就按快照推: sp 为空而 hhad 是三个数 —— 构建脚本也是这么来的。
   ★与网站 assets/live-odds.js 同名同义(改一处必须改另一处, 由 tools/_smoke_parity.js 卡)。 */
function noHadOf(m) {
  if (!m) return false;
  if (m.noHad !== undefined) return !!m.noHad;
  return !m.sp && Array.isArray(m.hhad) && m.hhad.length === 3;
}

/* 今日所有让球-only 的场: [{id:'013', ch:['埃','皇']}](场次号 + 主客队名首字, 按场次号排序)。
   ch 是给下面 noHadNote 认"正文有没有在写这场"用的 —— 只凭三位数字认, 撞号撞得厉害。 */
function noHadList(matches) {
  return (matches || []).filter(noHadOf).map(function (m) {
    return { id: id3(m), ch: [String((m && m.home) || '').charAt(0), String((m && m.away) || '').charAt(0)] };
  }).sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
}

/* 方案卡正文里把让球-only 的场**当胜平负写方向**了吗? 是则返回该卡该挂的口径说明, 否则 ''。
   ★识别只看正文自己怎么引用这场: 场次号后面**紧跟主客队名的首字** ——
     双选方向卡里的 '013皇马' / '009阿贾克斯' 命中;
     '013让+2负'(后面是'让', 本来就是让球口径, 不用提醒) /
     '013:0-2'(比分口径, 与310无关) / '1013'(前一位是数字) 都不算。
   ★为什么非要用队名首字而不是"后面跟中文字": 场次号是**各彩种各自的编号**,
     北单卡的正文写的是北单官方编号('003叻武里场'), 拿竞彩的 003 去认就会错挂一句
     (2026-09-15 tools/_smoke_parity.js ⑤ 实测撞上过)。名字对得上才是同一场。
   ★仍是字符串匹配, 认不出语义: 正文写别名/'主队'这类泛称就会漏挂。但挂不挂是**算出来的**,
     由"今天哪几场没开310"和正文自己决定 —— 构建脚本不用管, 卡名改版也不会失效。
   ★与网站 assets/live-odds.js 同名同义(改一处必须改另一处, 由 tools/_smoke_parity.js 卡)。 */
function noHadNote(text, list) {
  const s = String(text || '');
  const hits = (list || []).filter(function (x) {
    for (let i = s.indexOf(x.id); i !== -1; i = s.indexOf(x.id, i + 1)) {
      if (i > 0 && /\d/.test(s.charAt(i - 1))) continue;
      const rest = s.slice(i + x.id.length);
      if (x.ch[0] && rest.indexOf(x.ch[0]) === 0) return true;
      if (x.ch[1] && rest.indexOf(x.ch[1]) === 0) return true;
    }
    return false;
  }).map(function (x) { return x.id; });
  if (!hits.length) return '';
  return '⚠ 其中 ' + hits.join(' / ') + ' 官方只开让球、没开胜平负, 方向仅供判断、不可投;'
    + ' 可投的是场次卡上的「让球SP」';
}

/* 单腿实时赔率; 拿不到/不适用返回 null(调用方保留原值)。
   ★带 result 的腿是已结算的历史记录, 一律不碰 —— 改它等于篡改战绩。 */
function legOdds(leg, byId3, arrKey) {
  if (!leg || leg.result) return null;
  const picks = String(leg.pick || "").split("/");
  const odds = String(leg.odds || "").split("/");
  if (picks.length !== odds.length) return null; // 结构不符(如「胆/双选」混排) → 不猜
  const m = byId3[legNum(leg.match)];
  const arr = m && m[arrKey];
  if (!Array.isArray(arr)) return null;
  const out = picks.map(function (pk) {
    const i = pickIdx(pk);
    const v = i < 0 ? null : arr[i];
    return (v === null || v === undefined || !isFinite(Number(v))) ? null : Number(v).toFixed(2);
  });
  return out.indexOf(null) !== -1 ? null : out.join("/");
}

/* 连乘口径(与构建脚本一致): >=100 取整, 否则留 1 位小数 */
function product(oddsList) {
  let p = 1;
  for (let i = 0; i < oddsList.length; i++) {
    const v = parseFloat(String(oddsList[i]).split("/")[0]);
    if (!isFinite(v) || v <= 0) return null;
    p *= v;
  }
  return p >= 100 ? String(Math.round(p)) : p.toFixed(1);
}

const TOTAL_NUM_RE = /[\d.]+(?=\s*倍)/g;
function totalNum(s) {
  const m = String(s || "").match(TOTAL_NUM_RE);
  return m && m.length === 1 ? m[0] : "";
}

/* '7关全中约858倍' → '7关全中约705倍(按页面显示赔率连乘, 含 1 条已停售腿构建值)'。
   ★原文是构建脚本**手写的字面量**(不是从腿算的), 且可能含多段倍数(如「胆拖…约3.5倍;7关全串约26倍」)——
     多段一律不碰, 猜错哪一段就是假数。标注要落在「倍」**后面**, 不能插进数字和「倍」中间。 */
function substTotal(orig, newVal, label) {
  const s = String(orig || "");
  if (newVal === null) return orig;
  if ((s.match(TOTAL_NUM_RE) || []).length !== 1) return orig;
  return s.replace(/[\d.]+(\s*倍)/, newVal + "$1(" + label + ")");
}

/* 方案卡大号数字(pct)与 totalOdds 同源 → 只做**同值替换**: 数字完全相等才换, 不按方案名猜。 */
function substPct(pct, pairs) {
  const s = String(pct || "");
  for (let i = 0; i < pairs.length; i++) {
    const re = new RegExp(String(pairs[i][0]).replace(/\./g, "\\.") + "(\\s*倍)");
    if (!re.test(s)) continue;
    return s.replace(re, pairs[i][1] + "$1(" + pairs[i][2] + ")");
  }
  return pct;
}

/* 一个方案块: 刷 legs[].odds 并把 totalOdds 重算成**页面实际显示**那几条腿的连乘 */
function overlayPlan(plan, byId3, arrKey, closedIds) {
  if (!plan || !Array.isArray(plan.legs) || !plan.legs.length) return plan;
  const legs = [];
  let stale = 0, closed = 0, settled = 0;
  plan.legs.forEach(function (l) {
    if (l && l.result) settled++;
    const v = legOdds(l, byId3, arrKey);
    if (v === null) {
      stale++;
      if (closedIds && closedIds[legNum(l.match)]) closed++; // 停售腿: 官方已下架, 这张关本身就买不成
      legs.push(l);
    } else {
      legs.push(Object.assign({}, l, { odds: v }));
    }
  });
  const next = Object.assign({}, plan, { legs: legs });
  // 已结算腿 / 有腿读不出数 → 连乘不可信, 总数保持原字面量(腿照刷, 那是页面显示的事)
  if (settled) return next;
  const total = product(legs.map(function (l) { return l.odds; }));
  if (total === null) return next;
  next.oddsBasis = !stale ? "live" : (closed ? "closed" : "partial");
  next.oddsStale = stale;
  next.oddsClosedLegs = closed;
  next.totalOdds = substTotal(plan.totalOdds, total, !stale ? "按当前实时赔率连乘"
    : "按页面显示赔率连乘, 含 " + (closed || stale) + " 条" + (closed ? "已停售" : "未刷新") + "腿构建值");
  return next;
}

/* payload + 叠加后的 matches → { plan, hc7, max7 } 补丁(纯函数)。
   非今日 / 入参不齐 → 返回 null, 调用方原样用旧 payload。 */
function planPatch(payload, overlaid) {
  if (!payload || !Array.isArray(overlaid) || !overlaid.length) return null;
  if (!isToday(payload.date)) return null;
  const byId3Live = {};
  const closedIds = {};
  overlaid.forEach(function (m) {
    if (m && m.oddsClosed) closedIds[id3(m)] = true;
    else byId3Live[id3(m)] = m;
  });
  const hc7 = overlayPlan(payload.hc7, byId3Live, "hhad", closedIds);
  const max7 = overlayPlan(payload.max7, byId3Live, "sp", closedIds);
  // 方案卡的大号倍数与 hc7/max7 同源(构建脚本写两处) → 同值才换, 见 substPct
  const pairs = [];
  [[payload.hc7, hc7], [payload.max7, max7]].forEach(function (pr) {
    const o = pr[0], n = pr[1];
    if (!o || !n || !n.oddsBasis) return;
    const a = totalNum(o.totalOdds), b = totalNum(n.totalOdds);
    if (!a || !b) return;
    pairs.push([a, b, n.oddsBasis === "live" ? "实时连乘"
      : (n.oddsBasis === "closed" ? "含" + n.oddsClosedLegs + "条停售腿" : "含" + n.oddsStale + "条未刷新腿")]);
  });
  // 让球-only 场次在正文里被当胜平负写了的那几张卡, 挂一句口径说明(见 noHadNote)
  const nhList = noHadList(overlaid);
  const plan = Array.isArray(payload.plan) ? payload.plan.map(function (p) {
    const q = substPct(p.pct, pairs);
    const note = noHadNote(p.text, nhList);
    if (q === p.pct && !note) return p;
    const o = Object.assign({}, p);
    if (q !== p.pct) o.pct = q;
    if (note) o.noHadNote = note;
    return o;
  }) : payload.plan;
  return { plan: plan, hc7: hc7, max7: max7 };
}

if (typeof module !== "undefined" && module.exports) {
  // legNum/id3 是**跨运行端共用的口径**(场次号怎么截 3 位、场次 id 怎么截 3 位),
  // 一并导出才能被 tools/_smoke_parity.js 和网站侧逐个对齐 —— 内部用得上但没导出的东西,
  // 出了偏没人拦得住(这正是本文件与 assets/live-odds.js 之间最容易悄悄漂的一类)
  module.exports = { todayBj, isToday, fetchLive, overlay, applyRow, rowOf, fetchAndOverlay,
    planPatch, pickIdx, legNum, id3, noHadOf, noHadList, noHadNote,
    legOdds, product, substTotal, totalNum, substPct, overlayPlan,
    JC_RETRY, cloudFnName, cloudReady };
}
