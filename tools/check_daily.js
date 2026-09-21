/* 每日发布前自检(V3.2 ★4+ 硬门禁 + V3.3 胆/北单门禁 + V4.1 混选过关门禁):
   扫指定日(默认最新日)数据, 发现以下情形即报错(修正后再发):
     [★4+] ①反向/博冷标记: note/reason 含 诱|反向|魔咒|博冷|防冷|冲突|虚火 ②所选侧受让 ≥1.5 球
     [胆]  combo7(新)/max7(历史) key 腿: 主场胆 SP>1.35 / 客场胆 SP>1.5 / 放弃清单联赛胆(沙职等)
     [混选] combo7 腿型(play/pick 与盘口前缀) + 让球腿盘口 ≠ 官方让球线 + 一腿一场 + **上限 7 关(下限放开)**
            + 不让球腿不得落在让球-only 场(sp 缺失=官方没开这一盘, 投不了)
            + **每条腿赔率 ≥1.5 硬地板**(2026-09-21 用户拍板: 超深赔不再入串)
     [倍数] combo7/hc7/max7/asian7 的 totalOdds 必须恰好一段「N倍」(否则实时重算静默失效)
     [北单] beidan310 单选腿(非 a/b 双选)让球 ≠0(让球场一律双选: 让-1用3/1, 让+1用0/1)
     [场次] 0 场=违规; **<15 场只提醒不拦**(2026-09-21 起: 薄日按实际出)
   用法: node tools/check_daily.js [YYYY-MM-DD]   退出码 0=通过, 1=有违规 */
const path = require("path");
// PRED_FILE 可指向副本(与 _reviewMMDD.js 等同款约定), 便于在不碰正式数据的前提下试跑门禁
const days = require(process.env.PRED_FILE
  ? path.resolve(process.env.PRED_FILE)
  : path.join(__dirname, "..", "data", "predictions.js"));

const dateArg = process.argv[2];
const day = dateArg ? days.find(d => d.date === dateArg) : days[0];
if (!day) { console.error("找不到日期 " + dateArg); process.exit(1); }

const BAD = /诱|反向|魔咒|博冷|防冷|冲突|虚火/;
const COLD_LEAGUES = new Set("韩职,韩K联,葡超,瑞超,巴甲,解放者杯,阿甲,美职联,法乙,白俄超,MLS,南俱杯,巴西甲,德乙,沙职".split(","));
const violations = [];

function matchOf(idx3) {
  return (day.matches || []).find(m => String(m.id || "").slice(-3) === idx3) || null;
}

// ---- V3.2 ★4+ 门禁 ----
function checkAh(tag, pickText, conf, text) {
  if ((conf || 0) < 4) return;
  if (BAD.test(text || "")) {
    violations.push(`[★4+] ${tag} ${pickText} ★${conf}: 含反向/博冷标记(${(text || "").match(BAD)[0]})`);
  }
  const m = String(pickText || "").match(/\+\s*(\d+(?:\.\d+)?)\s*$/);
  if (m && parseFloat(m[1]) >= 1.5) {
    violations.push(`[★4+] ${tag} ${pickText} ★${conf}: 深盘受让 +${m[1]} ≥1.5 不给 ★4+`);
  }
}
(day.matches || []).forEach(m => {
  if (m.ahPick) checkAh(`${m.id} ${m.home}vs${m.away}`, m.ahPick, m.ahConf, m.note);
});
((day.asian7 && day.asian7.legs) || []).forEach(l => {
  const c = parseInt(((l.reason || "").match(/★(\d)/) || [0, 0])[1]);
  checkAh(`asian7 ${l.match}`, l.pick, c, l.reason);
});

// ---- V3.3 胆门禁 (2026-09-21 起同时扫 combo7 —— 竞彩混选过关, 胆腿字段与之同构) ----
//   ★让球腿的 pick 是「让-1 主胜」这种盘口前缀式, isHome/isAway 都按整词判, 不会串位;
//     让球腿当胆时用同门槛(其 odds 就是让球 SP —— 胆必须是短赔, 这一点与盘口无关)。
[].concat((day.combo7 && day.combo7.legs) || [], (day.max7 && day.max7.legs) || []).forEach(l => {
  if (!l.key) return;
  const odds = parseFloat(l.odds) || 0;
  const isHome = /主胜/.test(l.pick || "") || (/让/.test(l.pick || "") && /主/.test(l.pick || ""));
  const isAway = /客胜/.test(l.pick || "");
  const m = matchOf(String(l.match || "").slice(0, 3));
  const lg = m ? m.league : null;
  if (lg && COLD_LEAGUES.has(lg)) {
    violations.push(`[胆] ${l.match} ${l.pick}@${l.odds}: 放弃清单联赛(${lg})不当胆`);
  }
  if (isAway && odds > 1.5) {
    violations.push(`[胆] ${l.match} 客场胆 SP ${odds} >1.5(客场胆须 ≤1.5 且双证)`);
  }
  if (isHome && odds > 1.35 && odds < 3) { // odds<3 排除解析异常
    violations.push(`[胆] ${l.match} 主场胆 SP ${odds} >1.35(主场胆须 ≤1.35)`);
  }
});

// ---- V4.1 (2026-09-21) 竞彩混选过关 combo7: 腿型 / 盘口自洽 / 一腿一场 / 关数 ----
//   合并前的 hc7(让球)与 max7(不让球)混在一个串里, 脚上不再有"整块一个盘"的隐式约束 ——
//   这些约束只能靠本门禁显式卡住。★让球腿的盘口**唯一来源 = pick 前缀**(match 里不再写 (-1)),
//   所以这里与官方让球线 spHandicap 比对, 把「读错让球盘」变成机器能拦的错(9-19 一天错 5 处)。
const PLAY_OK = new Set(["胜平负", "让球胜平负"]);
const PICK_HAD = new Set(["主胜", "平", "客胜"]);
const HC_PICK = /^让([+-]?\d+)\s+(主胜|平|客胜)$/;
const c7legs = (day.combo7 && day.combo7.legs) || [];
c7legs.forEach(l => {
  const play = String(l.play || "");
  const pick = String(l.pick || "");
  const m = matchOf(String(l.match || "").slice(0, 3));
  // ★1.5 硬地板(2026-09-21 用户拍板): 超深赔(1.14/1.19 这类)不再当"低赔底盘"入串 ——
  //   它们把整串压到 7.83 倍却没有赔率价值。命中率最高的那盘若 <1.5, 须改用该场另一盘(≥1.5), 两盘都 <1.5 则换场。
  //   放在最前面: 下面两条分支各有 return, 地板必须对所有腿生效。
  const odds = parseFloat(l.odds);
  if (!isFinite(odds) || odds < 1.5) {
    violations.push(`[混选] ${l.match} 赔率 "${l.odds}" 低于 1.5 硬地板(改取该场另一盘, 或换场)`);
  }
  if (!PLAY_OK.has(play)) {
    violations.push(`[混选] ${l.match} 玩法 "${l.play}" 不在 {胜平负, 让球胜平负}(play 决定这腿取哪个彩池)`);
    return;
  }
  if (play === "胜平负") {
    if (!PICK_HAD.has(pick)) violations.push(`[混选] ${l.match} 不让球腿选项 "${pick}" 须为 主胜/平/客胜`);
    // 让球-only 场(官方只开让球、未开胜平负; 静态数据里就是 sp: null, 见 live-odds noHadOf):
    // 写不让球腿 = 投不了的市场 —— 面板只能拿构建赔率充数(实时池里根本没有这一盘), 用户照着买是买不到的。
    // 该类场要么改写成让球腿(盘口前缀式), 要么换场。
    if (m && !Array.isArray(m.sp)) {
      violations.push(`[混选] ${l.match} 不让球腿落在让球-only 场(官方未开胜平负, sp 缺失): 请改让球腿或换场`);
    }
    return;
  }
  const g = pick.match(HC_PICK);
  if (!g) { violations.push(`[混选] ${l.match} 让球腿选项 "${pick}" 须写成盘口前缀式(如 "让-1 主胜")`); return; }
  // spHandicap 缺字段时不能比(parseInt(undefined) = NaN, NaN !== NaN 会让整条腿无差别报红)
  if (m && m.spHandicap != null && parseInt(g[1], 10) !== parseInt(m.spHandicap, 10)) {
    violations.push(`[混选] ${l.match} 让球腿盘口 ${g[1]} ≠ 官方让球线 ${m.spHandicap}`);
  }
});
if (day.combo7) {
  // ★关数(2026-09-21 修订): 上限 7 关不变; **下限放开** —— 合格腿不够就按实际数量出
  //   ("如果场次不够不一定要 7 场, 有多少就推荐多少")。只拦"超 7"与"空串"。
  //   ★这两条必须在 `if (c7legs.length)` 之外 —— 空串时 length=0, 放里面永远走不到。
  if (!c7legs.length) violations.push(`[混选] combo7 有块无腿: 合格腿为 0 时不应写 combo7 这一块`);
  else if (c7legs.length > 7) violations.push(`[混选] ${c7legs.length} 关: 竞彩过关上限 7 关(docs/推荐逻辑.md)`);
}
if (c7legs.length) {
  const seen = {};
  c7legs.forEach(l => {
    const t = String(l.match || "").slice(0, 3);
    if (seen[t]) violations.push(`[混选] 场次 ${t} 在同一条串里出现两次(整串相关性过强, 一腿一场)`);
    seen[t] = 1;
  });
}

// ---- 实时可替换性门禁(2026-09-20 踩过): totalOdds 必须写成「…约N倍」且**恰好一段** ----
//   substTotal 用 /[\d.]+(?=倍)/ 匹配并要求全串只有一段: 写成 "7.83"(无「倍」字)或两段
//   都会**静默不替换** → 页面上"一列新赔率配一个旧倍数", 用户拿计算器一乘就说不对。
//   ★dream7/score3 故意不含可替换段(百倍级/万倍级, 见其构建注释), 是设计, 不在这条门禁内。
[["combo7", day.combo7], ["hc7", day.hc7], ["max7", day.max7], ["asian7", day.asian7]].forEach(([k, b]) => {
  if (!b || b.totalOdds === undefined) return;
  const n = (String(b.totalOdds).match(/\d+(?:\.\d+)?\s*倍/g) || []).length;
  if (n !== 1) {
    violations.push(`[倍数] ${k}.totalOdds "${b.totalOdds}" 含 ${n} 段「N倍」: 必须恰好一段, 否则实时重算静默失效`);
  }
});

// ---- V3.3 北单门禁 ----
((day.beidan310 && day.beidan310.legs) || []).forEach(l => {
  const single = !String(l.pick).includes("/");
  const hcp = String(l.handicap == null ? "0" : l.handicap);
  if (single && hcp !== "0") {
    violations.push(`[北单] ${l.match} 单选 ${l.pick} 但让球 ${hcp}≠0(让球场一律双选: 让-1用3/1, 让+1用0/1)`);
  }
});

// ---- 场次下限(2026-09-18 立, **2026-09-21 修订: 薄日按实际出**) ----
//   原规则「每日 ≥15 场」= 竞彩全盘 + 北单补足。9-21 是它第一次真的卡住: 全球赛程就那么多
//   (竞彩在售仅 1 场 + 北单窗口 11 场, 去重后 11 场, 一支五大联赛球队都没有), 硬卡会把整天挡死。
//   用户拍板「薄日按实际出」→ 下限不再是硬门禁, 只保留两条:
//     ① 0 场 = 违规(取数根本没跑通); ② <15 场 = 打提醒(仍要跑 _bd_gap 确认北单没漏, 但不拦发布)。
const FLOOR = 15;
const nMatch = (day.matches || []).length;
if (day.date >= "2026-09-18" && nMatch === 0) {
  violations.push(`[场次] 当日 0 场: 取数未跑通(见文件头 _fetch_jc.js / _bd_fetch.js)`);
} else if (day.date >= "2026-09-18" && nMatch < FLOOR) {
  console.warn(`⚠ ${day.date} 薄日: ${nMatch} 场 < ${FLOOR} 场(下限已放开, 不拦发布)` +
    ` —— 请确认已跑 node tools/_bd_fetch.js → node tools/_bd_gap.js ${day.date} 把北单未覆盖场补完`);
}

// ---- V4.0 (2026-09-18 起) 北单让球深度门禁: 放开让-2(只可做双选腿), 让-3 及以上仍剔除 ----
if (day.date >= "2026-09-18") {
  ((day.beidan310 && day.beidan310.legs) || []).forEach(l => {
    const n = parseFloat(String(l.handicap == null ? "0" : l.handicap)) || 0;
    if (n <= -3) {
      violations.push(`[北单] ${l.match} 让球 ${l.handicap} ≤ -3(深度超两球剔除, 深盘下限=让-2)`);
    }
  });
}

if (violations.length === 0) {
  console.log(`✓ ${day.date} 发布前门禁全部通过`);
  process.exit(0);
}
console.error(`✗ ${day.date} 发现 ${violations.length} 条违规:`);
violations.forEach(v => console.error("  - " + v));
console.error("处理: ★4+ 压 ★2 / 胆换场或降双选 / 北单单选改双选后重跑本脚本");
process.exit(1);
