/* 竞彩篮球当日池合并(2026-09-23 新增, 篮球板块数据层)
   动因: 篮球要独立于足球的取数链路 —— 足球那套"竞彩少就打北单"在篮球**不成立**(无北单篮),
         只有一个渠道, 所以池的构建必须靠「官方四池」+「出奇 13 家博彩盘」两源咬合。
   咬合键: (出奇 period, 出奇 number) ↔ (官方 businessDate 去横线, 官方 matchNum) —— 逐字节, 无需队名匹配
         (同 _bd_pool.js 的「num 是完美连接键」纪律; 队名只用来看, 两源缩写差异大:
          出奇"华盛顿神秘人" vs 官方"神秘人")。
   日期窗口: **一行归属逻辑都不用写** —— 直接按 period 取池, 不要照搬足球的 kickOf/ws/we。
         ⚠️ 但「period D ⊆ 窗口(D)」**不是恒真的**(2026-09-23 全量复核 63 场, 1 场越窗):
            周六301 2026-09-19 09:00 在 period 20260919 里, 却早于窗口起点 12:00。
            ⇒ 竞彩营业日 D 实际覆盖 **[D 凌晨, D+1 上午]**, 比站点窗口 [D 12:00, D+1 12:00) 更早。
            按 period 分组会把这场挂到 09-19 面板, 而站点既有约定会算进 09-18 —— **上站前须拍板口径**
            (见 check_lq.js 的 [窗口] 标签, 它每次都盯着)。
         ⚠️ 另一条产品含义: period 20260922 的 2304~2308 是北京时间 9-23 凌晨/上午开打的美国比赛,
            面板必须显示真实 tipoff, 不能只显示"周二304"。

   ★★★ 三条实测铁律(2026-09-23, 全部受控验证过, 任何一条写错都会静默出错):

   (1) **让分符号: 出奇 = -官方**。不是"推断", 是受控对照 —— 见 (3) 的 sup 51。
         官方 goalLine 负数 = 主队让分; 出奇的 ah.handicap 正负号相反。
         实测 4/4: 305 官+1.5/出-1.5, 306 官-6.5/出+6.5, 307 官-17.5/出+17.5, 308 官+15.5/出-15.5。
         大小分**无此坑**(两边都是正的无符号总分)。
         ⇒ 内部一律存官方口径(有符号), 原值留 rawLine 备对账。

   (2) **出奇的 odds 表把「全场盘」和「上半场盘」混装在一起, 而源里没有字段标明是哪个**。
         13 家里约 5 家报全场、8 家报上半场, 且**逐场会变**(同一家在 A 场报全场、B 场报上半场)。
         证据(308 场, 官方 hilo=157.5): 全场组 OU 157.5~158.5 / AH -14.5~-15.5 / 独赢 7.5~8.0;
         半场组 OU 76.5~78 / AH -7.5~-8.5 / 独赢 4.2~6.2 —— **三个池同时"减半且变温和"**,
         是上半场盘的教科书形状(87.5/179.5 = 48.7%, 正是篮球上半场占比)。1.7/1.7 之类的对称价不是判据。
         ⚠️ 若把两组混在一起取中位数, 会得到一条既不是全场也不是半场的**幻影盘口** —— 我踩过。
         判据(两条独立信号, 一致才下结论):
           a) ah.flags 的**最低位**: 偶=全场(272/528/1040), 奇=上半场(273/529/1041)。
              实测约 700 行里仅 5 行不符。**每行都有, 不依赖外部参照。**
           b) 该行 OU 与「本场内标」的比值: <0.7 = 上半场, 0.7~1.4 = 全场, 其余 = 未知。
         两者冲突 ⇒ market='unknown'(显式未知, 绝不猜)。

   (3) ★ **supplier 51 不是博彩公司, 它就是官方竞彩线被出奇转手发布了一遍。**
         实测 12/12 逐字节吻合: AH 线 = -官方goalLine 且 AH 价 = 官方让分SP;
         OU 线+两个价 = 官方 hilo 三项; x12 = 官方 mnl(出奇 draw 给 0, 官方给空串)。
         且**它 60/63 场都在**, 而官方接口只返回"当前在售"的 4~5 场
         ⇒ 内标不必等官方接口, 用 sup51 即可给全量场次定标。
         ⇒ sup51 **必须标 isOfficial 并从 booksFull 里剔除**, 否则官方线被当成第 13 家重复计入。
         ⚠️ 我一度把它的 1.7/1.7 当成"未开盘占位符"要过滤掉 —— **错了**: 1.7/1.7 是竞彩真实的
            让分/大小分 SP。真正的占位符长另一个样子, 见下。

   (4) ★★★ **已完赛场次里, `books` 是滚球/结算值 —— 唯一干净的赛前线列是 `official`。**
         ⚠️⚠️ 本条 2026-09-23 **二次修正**: 第一版(已作废)写的是"官方线在已完赛场上与真实实力
            脱节, 回测须以 books 为准" —— **完全读反了**。同一张 MAE 表, 第一版当"质量排行榜"读,
            实际它是**污染检测器**。教训: **凡是"某列准得离谱", 先怀疑它含结果, 别先夸它。**
         判据用比分: MAE = |真实净胜 − 盘口预测净胜|, 只用已完赛 + 全场盘。
         **篮球真实赛前线的正常误差是 9~13 分**; 低于 6 分 = 物理上不可能。实测 55 场完赛:
             books: sup10 1.5 · sup20 2.7 · sup97 3.0 · sup1 3.3 · sup24 3.9 · sup2 4.9 · sup26 5.0
                    ↑ **全在不可能带内 ⇒ 这些是赛后值**
             official: sup51 12.6 · sup30 13.3   ← **这才是真实赛前线的量级**
         硬指标(人一眼可验): **55 场里 15 场**的博彩盘中位数与真实净胜**只差 0.5 分**,
             含 中国 105:61 菲律宾(净胜 +44)配中位 -44.5 —— 赛前没有任何线能把 44 分血洗测到 0.5 分内。
         机理: 出奇对**已完赛**比赛会把博彩公司行刷成滚球/结算值; 而**竞彩官方线是固定奖金产品、
             无滚球盘、冻结在收盘** ⇒ 同一张表里官方行是赛前值、其余行是赛后值。**(机理已坐实)**
         ⇒ 工程铁律:
             · 已完赛场次**只能用 `official`**; **`books` 一行都不能用于复盘/回测/命中率统计**;
             · **想要"真实的博彩盘赛前线", 唯一来源是 `tools/lqsnap/` 里【开赛前】的快照**;
             · **上站展示: 已完赛场次一律不显示博彩盘**(否则出现「盘口 -44.5 / 实际 +44」这种一眼假的数);
               —— 判据直接用场次行自带的 `played` 字段即可, 不需额外标记;
             · 在售场次不受此污染(结果还不存在, 无从污染), 正常使用即可。
         护栏: `node tools/check_lq.js` 的 `[污染]` 段每次自检都重算这张表并报警;
               门禁是**官方线必须保持在真实量级** —— 它一旦也掉进 <6 分, 说明唯一干净的列没了。

   (5) ★★ **单关/过关可用性只能读 `bettingSingle`/`bettingAllup`, 不可读 `single`/`allUp`。**
         源 B 的 poolList 段里**并列**着三套平行字段组(betting* / cbt* / int* / single·allUp),
         足球样本(had/hhad/ttg/crs 四份测试数据, 共 84 个对象)里它们**同步变化**,
         但篮球实测(2026-09-23, 2 场 × 3 池)**single/allUp 恒为 0** ——
         ⇒ 照搬足球的字段名会静默得出「所有玩法都不能单关/过关」, 且不报任何错。
         实测值: 让分/大小分 = bettingSingle 0 / Allup 1(**只可过关**) · 胜分差 = 1/1(可单关)。
         ⚠️ 样本仅 2 场 ⇒ 这是**当前实测值不是定论**, 随快照累积复核(见 tools/lqsnap/)。
         工程含义: 想做「单关」产品, 让分/大小分**进不去**, 只有胜分差(及未来 single=1 的池)能进。

   真正的废行判据 = **价格荒谬**: 足球侧实测未开盘的大小分是 `handicap=0.5 且 over=6.25/under=0.02`
         (min 价 0.02)。篮球侧实测仅 1 行(周日303 sup20 AH 0.01/18)。
         ⇒ 判据用 min(价)<0.05 或 max(价)>30, **不看 handicap 是否为某个魔数**。

   产出: tools/lqpool_<period>.json
         { period, date, source:{cq,official,odds}, matches:[...], gaps:[...], checks:{...} }
         场次行: { num, label, period, eventId, tipoff, home, away, league,
                   status, played, hs, as, ht_hs, ht_as, quarters,
                   official: {hdc,hilo,mnl,wnm}|null, officialSrc:"api"|"book51"|"both"|null,
                   books:[{sup,isOfficial,market,marketWhy,valid,why,
                           ah:{line,rawLine,win,lost}|null, ou:{line,over,under}|null,
                           x12:{win,lost}|null, ratio}],
                   booksMeta:{total,full,half1,unknown,invalid,dropped:[{sup,why}]},
                   betting: {hdc|hilo|mnl|wnm:{single,allup}}|null }   ← 单关/过关可用性, 见 (5)
   用法: node tools/_lq_pool.js                取「今天(北京)」那个 period
         node tools/_lq_pool.js 20260922       指定 period
         node tools/_lq_pool.js --all          快照内所有篮球 period 各产一份(历史回填验证用)
         node tools/_lq_pool.js --snap=0922    指定快照文件名口径(缺省=今天)
   前置: node tools/_cq_fetch.js && node tools/_lq_fetch.js && node tools/_lq_odds.js
   注意: 非官方接口(出奇), 低频拉取 + 落盘缓存。 */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const snapArg = (argv.find(a => a.startsWith("--snap=")) || "").split("=")[1];
const posArg = argv.find(a => !a.startsWith("--"));

const yn = new Date(Date.now() + 8 * 3600 * 1000);
const p2 = n => String(n).padStart(2, "0");
const SNAP = snapArg || (p2(yn.getUTCMonth() + 1) + p2(yn.getUTCDate()));
const TODAY = yn.getUTCFullYear() + p2(yn.getUTCMonth() + 1) + p2(yn.getUTCDate());

const read = (name, req) => {
  const f = path.join(__dirname, name);
  if (!fs.existsSync(f)) {
    if (req) { console.error("缺 " + name + " —— 先跑对应的抓取脚本"); process.exit(1); }
    return null;
  }
  return JSON.parse(fs.readFileSync(f, "utf8"));
};
const cq = read("cq_" + SNAP + ".json", true);
const lq = read("lq_" + SNAP + ".json", false);
const od = read("lqodds_" + SNAP + ".json", false);
if (!lq) console.log("⚠️ 无 lq_" + SNAP + ".json —— 官方四池全空(只靠 sup51 内标), 建议先跑 node tools/_lq_fetch.js " + SNAP);
if (!od) console.log("⚠️ 无 lqodds_" + SNAP + ".json —— 无博彩盘, 池里只有官方线");

const numOrNull = v => (v === undefined || v === null || String(v).trim() === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const kOff = r => String(r.businessDate || "").replace(/-/g, "") + "|" + r.matchNum;

// 官方四池按 (businessDate去横线|matchNum) 建索引。池覆盖稀疏且活(实测 mnl 常只 2/5 场), 逐池独立。
const OFF = { hdc: {}, hilo: {}, mnl: {}, wnm: {} };
if (lq) for (const p of ["hdc", "hilo", "mnl", "wnm"]) for (const r of (lq.pools[p] || [])) OFF[p][kOff(r)] = r;

// 篮球场次(出奇侧): sportId===2。⚠️ 北单篮是死代码 —— 出奇 27 个分组里北单只有 sportId=1, 不该有数据
const bd = cq.matches.filter(m => m.sportId === 2);
const stray = cq.matches.filter(m => m.lottery === "北单篮");
if (stray.length) { console.error("✗ 出现 lottery=北单篮 的场次 " + stray.length + " 条 —— 该分支是死代码, 不该有数据, 请查 _cq_fetch.js"); process.exit(1); }

const periods = [...new Set(bd.map(m => String(m.period)))].sort();
const want = ALL ? periods : [posArg || TODAY];
if (!ALL && !periods.includes(want[0])) {
  console.error("快照内无 period=" + want[0] + " 的篮球场次");
  console.error("  现有 period: " + (periods.join(", ") || "(无)") + "   (用 --all 可全部产出)");
  process.exit(1);
}

// 比值分档: 以「本场内标」为基准判 全场/上半场
const clsByRatio = r => (r == null ? null : (r < 0.7 ? "half1" : (r < 1.4 ? "full" : "other")));
const clsByFlags = f => (f == null ? null : ((Number(f) & 1) ? "half1" : "full"));
const isDead = (a, b) => a != null && b != null && (Math.min(a, b) < 0.05 || Math.max(a, b) > 30);

const build = period => {
  const pool = bd.filter(m => String(m.period) === period);
  const gaps = [], usedOff = {}, usedOdds = {}, offMismatch = [];
  let nApi = 0, nBook51 = 0, nBoth = 0, nAgree = 0, nFlagsDisagree = 0, nNoRef = 0, nOffMismatch = 0;

  const matches = pool.map(m => {
    const k = period + "|" + m.number;
    const e = od ? od.events[String(m.eventId)] : null;
    if (e) usedOdds[m.eventId] = 1;
    const sups = e ? e.suppliers.slice() : [];

    // —— 官方四池(源 B)
    const aHdc = OFF.hdc[k], aHilo = OFF.hilo[k], aMnl = OFF.mnl[k], aWnm = OFF.wnm[k];
    ["hdc", "hilo", "mnl", "wnm"].forEach(p => { if (OFF[p][k]) usedOff[p + k] = 1; });

    // —— 玩法可用性(单关/过关): 源 B 的 poolList 段。与「盘口」是两个维度, 故不塞进 official
    // ★★ 只能用 bettingSingle / bettingAllup 这一套。同一个 poolList 对象里还**并列**着
    //    single/allUp、cbtSingle/cbtAllUp、intSingle/intAllUp 三套平行字段 —— 足球样本里
    //    它们与 betting* **同步变化**, 但篮球实测 **single/allUp 恒为 0**:
    //      ⇒ 照搬足球的字段名会静默得出「所有玩法都不能单关/过关」的结论, 且不报任何错。
    //      (与 (1) 让分符号同类: 取错字段不会报警, 只会让每个判断都反。)
    // ★ 值原样保留(0/1/缺失→null), **不派生布尔**: 「字段缺失」与「=0」是两回事, 派生会把它们抹平。
    const plRaw = (lq && lq.poolList) ? lq.poolList[String(m.number)] : null;
    let betting = plRaw ? ["hdc", "hilo", "mnl", "wnm"].reduce((a, p) => {
      const x = plRaw[p.toUpperCase()];
      if (x) a[p] = {
        single: x.bettingSingle === undefined ? null : x.bettingSingle,
        allup: x.bettingAllup === undefined ? null : x.bettingAllup,
      };
      return a;
    }, {}) : null;
    // ⚠️ 空壳对象坑(与 177 行 official 那个同源): {} 是 truthy 却无内容, 会让下游误判"有玩法数据"
    if (betting && !Object.keys(betting).length) betting = null;

    let official = null;
    if (aHdc || aHilo || aMnl || aWnm) {
      official = {
        hdc: aHdc ? { line: aHdc.line, home: aHdc.homeOdds, away: aHdc.awayOdds } : null,
        hilo: aHilo ? { line: aHilo.line, over: aHilo.overOdds, under: aHilo.underOdds } : null,
        mnl: aMnl ? { home: aMnl.homeOdds, away: aMnl.awayOdds } : null,
        wnm: aWnm ? { w: aWnm.w, l: aWnm.l } : null,
      };
    }

    // —— 博彩盘(源 A)。sup51 = 官方线本身, 单独摘出当内标 + 空档回填, 不进 booksFull
    const s51 = sups.find(s => s.sup === 51) || null;
    const s51Off = { hdc: null, hilo: null, mnl: null };
    if (s51) {
      // ★ 符号取反: 出奇 ah.handicap 与官方 goalLine 反号(受控验证见文件头)。
      //   大小分/独赢无符号坑, 原样取。draw 丢弃(篮球恒 0)。
      if (s51.ah && s51.ah.handicap != null && !isDead(s51.ah.win, s51.ah.lost))
        s51Off.hdc = { line: -s51.ah.handicap, home: s51.ah.win, away: s51.ah.lost };
      if (s51.ou && s51.ou.handicap != null && !isDead(s51.ou.over, s51.ou.under))
        s51Off.hilo = { line: s51.ou.handicap, over: s51.ou.over, under: s51.ou.under };
      if (s51.x12) s51Off.mnl = { home: s51.x12.win, away: s51.x12.lost };
    }
    // 交叉核对: 官方接口 与 sup51 同时在场时, 逐池必须逐字节吻合(实测 4/4 吻合)。
    // 不吻合 ⇒ 「sup51 = 官方线」这条前提在该场不成立 ⇒ 报出来, 不静默采信任一侧。
    if (official) for (const p of ["hdc", "hilo", "mnl"]) {
      const a = official[p], b = s51Off[p];
      if (!a || !b) continue;
      const same = p === "mnl" ? (a.home === b.home && a.away === b.away)
        : (a.line === b.line && (p === "hdc" ? (a.home === b.home && a.away === b.away) : (a.over === b.over && a.under === b.under)));
      if (!same) { nOffMismatch++; offMismatch.push({ num: m.number, label: m.label, pool: p, api: a, book51: b }); }
    }
    // ⚠️ 仅在 sup51 **真有内容**时才建 official, 否则会造出 {hdc:null,hilo:null,mnl:null,wnm:null}
    //    这样的空壳对象 —— 它 truthy 却无数据, 会让 officialSrc 谎报成 "book51"。
    if (s51 && (s51Off.hdc || s51Off.hilo || s51Off.mnl)) {
      official = official || { hdc: null, hilo: null, mnl: null, wnm: null };
      for (const p of ["hdc", "hilo", "mnl"]) if (!official[p]) official[p] = s51Off[p];
    }
    const fromApi = !!(aHdc || aHilo || aMnl || aWnm), fromB51 = !!(s51Off.hdc || s51Off.hilo || s51Off.mnl);
    const officialSrc = official ? (fromApi && fromB51 ? "both" : (fromApi ? "api" : "book51")) : null;
    if (officialSrc === "api") nApi++;
    else if (officialSrc === "book51") nBook51++;
    else if (officialSrc === "both") nBoth++;

    // 内标(判全场/上半场的基准), 三档降级:
    //   a) 官方接口的 hilo 线 —— 最好, 是权威口径
    //   b) sup51 的 OU —— 等于官方线(受控验证过), 覆盖 60/63 场
    //   c) **本场自参照** —— 都没有时(实测今天 3 场如此), 用 OU 自身的双峰结构:
    //      出奇混装全场/上半场, 而全场 ≈ 2×上半场 ⇒ 同场内 OU 必双峰。取 max 作内标
    //      (全场线一定 ≥ 上半场线)。**必须确认双峰真存在**(max/min ≥ 1.5) ——
    //      单峰时无法判断那一个是全场还是上半场 ⇒ 记 unknown, 绝不猜。
    let ref = (official && official.hilo && official.hilo.line) || (s51 && s51.ou ? s51.ou.handicap : null);
    let refSrc = ref ? (official && official.hilo && official.hilo.line ? "official" : "book51") : null;
    if (!ref) {
      const ous = sups.map(s => (s.ou ? s.ou.handicap : null)).filter(v => v != null && v > 0).sort((x, y) => x - y);
      if (ous.length >= 2 && ous[ous.length - 1] / ous[0] >= 1.5) { ref = ous[ous.length - 1]; refSrc = "self"; }
    }
    if (!ref) nNoRef++;

    const books = sups.map(s => {
      const fc = clsByFlags(s.ah ? s.ah.flags : null);
      const rc = (ref && s.ou && s.ou.handicap != null) ? clsByRatio(s.ou.handicap / ref) : null;
      // ★ ratio 是**测量**(拿本场内标量出来的), flags 只是**相关性** ⇒ 测量说了算。
      //   (曾经反过来用 flags 当主判据, 结果供应商 30 的 36 行被误判: 它 flags 带奇数却报全场,
      //    比值 0.91~1.18 铁证是全场。相关性不能当因果。)
      //   flags 仍记录为交叉信号: 不一致的行计入 checks.market.flagsDisagree, 供 check_lq.js 溯源。
      let market, marketWhy;
      if (rc && rc !== "other") { market = rc; marketWhy = ((fc && fc === rc) ? "ratio+flags" : "ratio") + (refSrc === "self" ? "(自参照)" : ""); }
      else { market = "unknown"; marketWhy = ref ? "无OU或比值异常" : "无内标"; }
      if (fc && rc && fc === rc) nAgree++;
      else if (fc && rc && rc !== "other") nFlagsDisagree++;

      const dead = (s.ah && isDead(s.ah.win, s.ah.lost)) || (s.ou && isDead(s.ou.over, s.ou.under)) || (s.x12 && isDead(s.x12.win, s.x12.lost));
      return {
        sup: s.sup, isOfficial: s.sup === 51, market, marketWhy,
        valid: !dead && !!(s.ah || s.ou || s.x12),
        why: dead ? "价格荒谬(疑未开盘占位)" : (s.ah || s.ou || s.x12 ? null : "三段全缺"),
        ratio: (ref && s.ou && s.ou.handicap != null) ? Number((s.ou.handicap / ref).toFixed(3)) : null,
        ah: s.ah ? { line: s.ah.handicap == null ? null : -s.ah.handicap, rawLine: s.ah.handicap, win: s.ah.win, lost: s.ah.lost } : null,
        ou: s.ou ? { line: s.ou.handicap, over: s.ou.over, under: s.ou.under } : null,
        x12: s.x12 ? { win: s.x12.win, lost: s.x12.lost } : null,   // draw 对篮球恒 0, 丢弃(不是信号)
      };
    }).sort((a, b) => a.sup - b.sup);

    const ok = books.filter(b => b.valid);
    const booksMeta = {
      total: sups.length,
      full: ok.filter(b => !b.isOfficial && b.market === "full").length,
      half1: ok.filter(b => !b.isOfficial && b.market === "half1").length,
      unknown: ok.filter(b => !b.isOfficial && b.market === "unknown").length,
      invalid: books.length - ok.length,
      dropped: books.filter(b => !b.valid).map(b => ({ sup: b.sup, why: b.why })),
    };

    if (!e) gaps.push({ num: m.number, label: m.label, why: "出奇无博彩盘(该 eventid 不在 odds 表)" });
    else if (!official) gaps.push({ num: m.number, label: m.label, why: "官方四池无此场且无 sup51 内标 ⇒ 该场无官方线" });
    else if (!booksMeta.full) gaps.push({ num: m.number, label: m.label, why: "全场盘家数为 0(只有上半场盘)" });

    return {
      num: m.number, label: m.label, period, eventId: m.eventId, tipoff: m.time,
      home: m.home, away: m.away, league: m.league,
      status: m.status, played: m.played, hs: m.hs, as: m.as, ht_hs: m.ht_hs, ht_as: m.ht_as,
      quarters: m.quarters || null,
      official, officialSrc, ref: ref ? { line: ref, src: refSrc } : null, books, booksMeta,
      betting,   // 单关/过关可用性(源 B poolList), 逐池; null = 该场玩法段整个缺失。见头部 (5)
    };
  }).sort((a, b) => a.num - b.num);

  return {
    period, date: period.slice(0, 4) + "-" + period.slice(4, 6) + "-" + period.slice(6),
    source: {
      cq: "cq_" + SNAP + ".json@" + cq.fetchedAt,
      official: lq ? "lq_" + SNAP + ".json@" + lq.fetchedAt : "(未抓)",
      odds: od ? "lqodds_" + SNAP + ".json@" + od.fetchedAt : "(未抓)",
    },
    matches, gaps,
    checks: {
      officialSrc: { api: nApi, book51: nBook51, both: nBoth, none: pool.length - nApi - nBook51 - nBoth },
      // flagsDisagree = flags 奇偶与 ratio 判定不一致的行数(供应商 30 是已知大户)。非错误, 是溯源线索。
      market: { agree: nAgree, flagsDisagree: nFlagsDisagree, noRef: nNoRef },
      // 内标来源: official=官方接口 / book51=sup51 / self=本场自参照 / 无
      refSrc: matches.reduce((a, m) => { const k = m.ref ? m.ref.src : "none"; a[k] = (a[k] || 0) + 1; return a; }, {}),
      offMismatch,   // 官方接口与 sup51 不吻合的明细(应为空; 非空说明「sup51=官方线」前提破了)
      // 咬合率: 官方有而出奇无 / 出奇有而官方无
      unmatchedOfficial: (lq ? ["hdc", "hilo", "mnl", "wnm"].reduce((a, p) =>
        a + Object.keys(OFF[p]).filter(k => k.startsWith(period + "|") && !usedOff[p + k]).length, 0) : 0),
      unmatchedOdds: od ? Object.keys(od.events).filter(id => bd.some(m => String(m.eventId) === id) && !usedOdds[id]).length : 0,
    },
  };
};

const outs = want.map(build);
for (const o of outs) {
  fs.writeFileSync(path.join(__dirname, "lqpool_" + o.period + ".json"), JSON.stringify(o, null, 1), "utf8");
}

console.log((ALL ? "✓ " + outs.length + " 个 period" : "✓ period " + outs[0].period) + " → lqpool_<period>.json");
for (const o of outs) {
  const n = o.matches.length;
  const fin = o.matches.filter(m => m.played).length;
  const withOff = o.matches.filter(m => m.official).length;
  const withFull = o.matches.filter(m => m.booksMeta.full).length;
  const qtr = o.matches.filter(m => m.quarters).length;
  console.log("  " + o.period + "  " + String(n).padStart(2) + " 场 (完赛 " + fin + ")  官方线 " + withOff + "  全场盘≥1家 " + withFull + "  逐节齐 " + qtr);
  // 单关/过关可用性逐池(可用场次/该池有玩法数据的场次) —— 让分/大小分 vs 胜分差的差异一眼可见
  const cntB = f => ["hdc", "hilo", "mnl", "wnm"].map(p => p + " " +
    o.matches.filter(m => m.betting && m.betting[p] && f(m.betting[p])).length + "/" +
    o.matches.filter(m => m.betting && m.betting[p]).length).join(" · ");
  console.log("     单关 " + cntB(b => b.single === 1) + "  |  过关 " + cntB(b => b.allup === 1));
  console.log("     官方线来源 " + JSON.stringify(o.checks.officialSrc) +
    "  市场判据 ratio成立" + o.checks.market.agree + "/flags异议" + o.checks.market.flagsDisagree + "/无内标" + o.checks.market.noRef);
  if (o.checks.offMismatch.length) console.log("     ✗ 官方接口与 sup51 不吻合 " + o.checks.offMismatch.length + " 条: " + JSON.stringify(o.checks.offMismatch.slice(0, 2)));
  if (o.gaps.length) console.log("     缺口 " + o.gaps.length + " 条: " + o.gaps.slice(0, 3).map(g => g.label + "(" + g.why + ")").join("; ") + (o.gaps.length > 3 ? " …" : ""));
}
const s = k => outs.reduce((a, o) => a + o.checks[k], 0);
const om = outs.reduce((a, o) => a + o.checks.offMismatch.length, 0);
if (om) console.log("✗ 官方接口与 sup51 不吻合共 " + om + " 条 —— 「sup51=官方线」前提被打破, 必须先查清再往下走");
if (s("unmatchedOfficial")) console.log("⚠️ 官方有而出奇无 " + s("unmatchedOfficial") + " 条 —— 跑 node tools/check_lq.js 看明细");
if (s("flagsDisagree")) console.log("  (flags 异议 " + s("flagsDisagree") + " 条属已知相关性缺陷, 不影响判定 —— ratio 是测量, flags 只是相关性)");
