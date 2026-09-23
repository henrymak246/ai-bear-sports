/* 竞彩篮球 上站数据生成器(2026-09-23 新增, 篮球板块第三步: 上站)
   作用: 把 tools/lqpool_<period>.json 压成 `day.basketball` 顶层字段, 写回 data/predictions.js。

   ★ 为什么是顶层字段而绝不进 day.matches[]:
     站上 5 处足球统计遍历 day.matches 且**没有运动过滤**(stats.js computeDayStats / computeOverall.byLeague、
     index.html 月历红黑 / matchGroups / 摇卦下拉) —— 塞进去会被当成足球场次静默污染所有足球统计。
     独立字段自动绕开全部 5 处。

   ★★★ 污染铁律(见 docs/篮球推荐逻辑.md 附B, 2026-09-23 二次修正后定稿):
     出奇的博彩公司行**会被覆写** —— 已完赛的场次拿到的是滚球/结算值, 不是赛前线
     (逐家 MAE 1.5~5.0, 而真实赛前线量级是 9~13)。
     ⇒ 博彩盘可信的**充要条件 = 取数时该场尚未开赛**。两个必要条件**层次不同, 别只判一个**:
         · `played === true`   ⇒ 赛后值      —— 必要但不充分
         · 取数时已开赛         ⇒ 滚球值      —— 必要但不充分
        (实测 周二304: 开赛 9-23 07:30 / 取数 07:57 = 已打 27 分钟, 而它 `played` 仍是 false
         ⇒ **只判 played 会把滚球值当成赛前线展示**。)
     ⇒ 判据 = `tipoff > fetchedAt`(取数时刻取自 pool.source.odds 的 "@<时间>"),
       不满足则置 `bk:null` 并在 `bkNa` 里写明原因(finished / started / none / unknown),
       页面如实显示"这列不可信"而不是假装"没数据"。取不到取数时刻时保守不产出(宁缺勿错)。

   ★ 为什么输出是"压缩摘要"而不是整包 books:
     `day.basketball` 会随 `mini_rpc.sql` 的 `to_json(payload)` **整体发给微信小程序**
     ⇒ 必须瘦。13 家的逐家明细留在大池文件里, 站上只带中位数/区间/家数。

   产出字段(每场):
     { num, label, tipoff, home, away, league, played,
       off: { hdc:{line,h,a}, hilo:{line,o,u}, mnl:{h,a}, wnm:{w,l} } | null,   ← 官方(竞彩固定奖金)
       bk:  { n, ah:{lo,med,hi}, ou:{lo,med,hi} } | null,                        ← 博彩盘(仅未开赛)
       hs, as }                                                                  ← 完赛才有

   用法: node tools/_lq_site.js              全部 lqpool_*.json 各写一天
         node tools/_lq_site.js 20260923     只写指定 period
         node tools/_lq_site.js --dry        只报会改什么, 不落盘
   安全: 落盘前先做**序列化自证** —— 用 days 重建整文件并与磁盘逐字节比对,
         一致才允许写。这样"本次改动是唯一改动"是被证明的, 不是被假设的。
         (data/predictions.js 有并行会话在改的可能, 故拒绝任何隐式重排。)
*/
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const periodArg = argv.find(a => /^\d{8}$/.test(a)) || null;

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "predictions.js");
const HEADER = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n' +
  '   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
const PRE = "const PREDICTION_DAYS = ";
const FOOT = ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n';

const ser = days => "[\n" + days.map(d => JSON.stringify(d, null, 2)).join(",\n") + "]";

// ---- 读入 + 序列化自证 ----
const disk = fs.readFileSync(DATA, "utf8");
const days = require(DATA);
const rebuilt = HEADER + PRE + ser(days) + FOOT;
if (rebuilt !== disk) {
  console.error("✗ 序列化自证失败 —— 重建文本与磁盘不一致, 拒绝写入(避免隐式重排整个文件)。");
  const n = Math.min(rebuilt.length, disk.length);
  let k = 0; while (k < n && rebuilt[k] === disk[k]) k++;
  console.error("  首个差异 @" + k + "  磁盘:" + JSON.stringify(disk.slice(Math.max(0, k - 60), k + 60)));
  console.error("                    重建:" + JSON.stringify(rebuilt.slice(Math.max(0, k - 60), k + 60)));
  process.exit(1);
}
console.log("✓ 序列化自证通过(" + days.length + " 天, 重建与磁盘逐字节一致)");

// ---- 中位数/区间 ----
const medOf = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const tri = (a, pick) => {
  const v = a.map(pick).filter(x => x != null);
  if (!v.length) return null;
  return { lo: Math.min(...v), med: medOf(v), hi: Math.max(...v) };
};

// ---- 池文件 → day.basketball ----
const poolFiles = fs.readdirSync(__dirname).filter(f => /^lqpool_\d{8}\.json$/.test(f)).sort()
  .filter(f => !periodArg || f === "lqpool_" + periodArg + ".json");
if (!poolFiles.length) { console.error("✗ 没有匹配的 lqpool_<period>.json"); process.exit(1); }

const byDate = {};
for (const f of poolFiles) {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
  // ★★ 取数时刻 —— 判"这场取数时开赛了没"的唯一依据。
  //    池的 source 记成 "<文件名>@<YYYY-MM-DD HH:MM>"(_lq_pool.js 落的), 取 od 那一路。
  const fetchedAt = (String((p.source && p.source.odds) || "").split("@")[1] || "").trim();
  const ms = (p.matches || []).map(m => {
    const off = (m.official && Object.keys(m.official).length) ? m.official : null;
    // 只有全场盘、且非官方线的行能进博彩盘摘要
    const full = (m.books || []).filter(b => b.valid && !b.isOfficial && b.market === "full");
    // ★★★ 博彩盘可信的**充要条件**：取数时该场【尚未开赛】。
    //   两个必要条件的层次不同, 别只判一个:
    //     · played=true  ⇒ 赛后值(结算值)          —— 必要, 但不充分
    //     · 取数时已开赛 ⇒ 滚球值(实测 周二304 开赛 07:30 / 取数 07:57 = 已打 27 分钟)
    //       这场 played 也是 false ⇒ **只判 played 会把滚球值当成赛前线展示**。
    //   ⇒ 必须用 tipoff > fetchedAt 判。取不到取数时刻就保守不产出(宁缺勿错)。
    let bk = null, bkNa = null;
    if (!fetchedAt) bkNa = "unknown";                       // 取数时刻不可考 ⇒ 不敢用
    else if (m.played) bkNa = "finished";                   // 赛后值
    else if (!(String(m.tipoff) > fetchedAt)) bkNa = "started"; // 取数时已开赛 ⇒ 滚球值
    else if (!full.length) bkNa = "none";                   // 无全场盘行
    else bk = { n: full.length, ah: tri(full, b => b.ah && b.ah.line), ou: tri(full, b => b.ou && b.ou.line) };
    const o = { num: m.num, label: m.label, tipoff: m.tipoff, home: m.home, away: m.away, league: m.league, played: !!m.played };
    o.off = off ? {
      hdc: off.hdc ? { line: off.hdc.line, h: off.hdc.home, a: off.hdc.away } : null,
      hilo: off.hilo ? { line: off.hilo.line, o: off.hilo.over, u: off.hilo.under } : null,
      mnl: off.mnl ? { h: off.mnl.home, a: off.mnl.away } : null,
      wnm: off.wnm ? { w: off.wnm.w, l: off.wnm.l } : null,
    } : null;
    o.bk = bk;
    if (bkNa) o.bkNa = bkNa;   // 不产出博彩盘的原因, 供页面如实显示(不是"没数据"而是"这列不可信")
    // 单关/过关可用性(§六 第4条: 让分/大小分实测【不可单关】⇒ 别设计结算不了的产品)
    // 只留 [single, allup] 两个数, 池名保留原样
    if (m.betting) {
      const bet = {};
      for (const k of ["hdc", "hilo", "mnl", "wnm"]) {
        const v = m.betting[k];
        if (v) bet[k] = [v.single ? 1 : 0, v.allup ? 1 : 0];
      }
      if (Object.keys(bet).length) o.bet = bet;
    }
    if (m.played) { o.hs = m.hs; o.as = m.as; }
    return o;
  });
  if (!ms.length) { console.log("· " + p.period + " 无场次, 跳过"); continue; }
  const d = byDate[p.date] || (byDate[p.date] = { period: p.period, matches: [] });
  d.matches.push(...ms);
}
// 同日多 period(理论上不该有): 按开赛时间排, 保证输出稳定
Object.values(byDate).forEach(d => d.matches.sort((a, b) => (a.tipoff < b.tipoff ? -1 : a.tipoff > b.tipoff ? 1 : 0)));

// ---- ★★ 人工撰写的方向层: 生成器只拥有 period/matches, 不拥有 plan 与逐场方向 ----
//   为什么必须有这一段: 本脚本此前是**整对象替换**(`day.basketball = bball`),
//   而方向层(日级 plan + 逐场 direction/synthesis/...)是**分析产物**、不是数据映射 ——
//   整对象替换会把作者写好的判断**静默清空**, 且因为不报错, 只在页面上表现为"方向又没了"。
//   改为按 num 回挂。★ 用 num 当连接键与 _bd_pool / _lq_pool 同一条纪律(实测 num 是完美连接键)。
//   两种情况必须分辨:
//     · 旧方向层的场次这次还在  ⇒ 回挂(正常)
//     · 旧方向层的场次这次没了  ⇒ 不进 nDropDir 就**静默丢失**, 必须报出来让人决定
const KEEP = ["direction", "dirTag", "confidence", "synthesis", "ahPick", "ouPick", "note"];
let nDay = 0, nNew = 0, nUpd = 0, nMiss = [], nKeepPlan = 0, nKeepDir = 0, nDropDir = [];
const log = [];
for (const [date, bball] of Object.entries(byDate)) {
  const day = days.find(d => d.date === date);
  if (!day) { nMiss.push(date + "(period " + bball.period + ")"); continue; }
  const had = day.basketball ? 1 : 0;
  const old = (had ? day.basketball : null) || {};
  // 1) 日级 plan —— 原样保留(它属于"这一天", 不随场次增减)
  if (old.plan) { bball.plan = old.plan; nKeepPlan++; }
  // 2) 逐场方向 —— 按 num 回挂
  const oldByNum = {};
  (old.matches || []).forEach(m => { if (m && m.num != null) oldByNum[String(m.num)] = m; });
  const hit = {};
  let keptHere = 0;
  bball.matches.forEach(m => {
    const o = oldByNum[String(m.num)];
    if (!o) return;
    hit[String(m.num)] = 1;
    // ★ 判据是「字段在不在」而不是「值非不非空」—— 空串是**有意义的署名**
    //   (ouPick:"" = 这一场明确不出大小分观点, 与"没有这个字段"不同)。
    //   两处判据不一致会让 `_lq_site.js` 重跑**不是幂等的**:
    //   实测漏掉 3 个 ouPick:"" ⇒ 每跑一次少 88 字节, 于是"真变化"和"噪声"再也分不开。
    KEEP.forEach(k => { if (o[k] !== undefined) { m[k] = o[k]; keptHere++; } });
  });
  if (keptHere) { nKeepDir++; }
  // 3) 旧方向层里这次挂不上的场次 —— 报了才不算静默丢
  Object.keys(oldByNum).forEach(n => {
    if (!hit[n] && KEEP.some(k => oldByNum[n][k] !== undefined)) {
      nDropDir.push(date + " / num " + n + " " + (oldByNum[n].label || ""));
    }
  });
  day.basketball = bball;
  nDay++; had ? nUpd++ : nNew++;
  const nPlayed = bball.matches.filter(m => m.played).length;
  const nOff = bball.matches.filter(m => m.off).length;
  const nBk = bball.matches.filter(m => m.bk).length;
  log.push("  " + date + "  period " + bball.period + "  " + bball.matches.length + " 场" +
    " (完赛 " + nPlayed + " · 官方线 " + nOff + " · 博彩盘 " + nBk + ")" + (had ? "  [覆盖旧值]" : "  [新增]") +
    (keptHere ? "  ↳保留方向层 " + keptHere + " 项" : ""));
}
if (nMiss.length) console.log("⚠️ 这些 period 在 predictions.js 里找不到对应日期, 已跳过: " + nMiss.join(", "));
if (nKeepPlan || nKeepDir) console.log("↳ 方向层保留: plan " + nKeepPlan + " 篇 · 含逐场方向 " + nKeepDir + " 天");
if (nDropDir.length) {
  // 不静默丢: 旧方向层里这次挂不上的场次, 一定是场次从池里消失了(改名/退赛/期号变), 得人来决定
  console.log("⚠️ 旧方向层有 " + nDropDir.length + " 场的判断这次挂不上(该场已不在池里), 请确认是否另存:");
  nDropDir.forEach(x => console.log("   · " + x));
}
if (!nDay) { console.log("· 没有任何一天需要写, 退出"); return; }
console.log("将写入 " + nDay + " 天 (新增 " + nNew + " / 覆盖 " + nUpd + "):");
log.forEach(l => console.log(l));

const out = HEADER + PRE + ser(days) + FOOT;
if (DRY) { console.log("(dry-run —— 未落盘, 预计字节 " + disk.length + " → " + out.length + ")"); return; }
fs.writeFileSync(DATA, out, "utf8");
console.log("✓ → data/predictions.js   " + disk.length + " → " + out.length + " 字节 (+" + (out.length - disk.length) + ")");
console.log("  本地预览: index.html?dev   (不上线, 不跑 sync-data.js)");
