/* 竞彩篮球 数据层自检(2026-09-23 新增, 篮球板块数据层)
   定位: 与 tools/check_daily.js 同级 —— 逐条打印 「标签 通过/违规」, 末尾汇总 FAIL 并置退出码 1。
   为什么篮球要单开一个: 篮球有两处**静默反向**风险(让分符号、供应商混装全场/半场盘),
         错了不会抛异常, 只会让每一个判断都反 —— 必须靠结构性护栏, 不能靠肉眼。
   标签含义:
     [咬合] 两源连接键 —— (出奇 period, num) ↔ (官方 businessDate去横线, matchNum)
     [窗口] 每场 tipoff 必须落在 period D 的 [12:00, D+1 12:00) 内
     [符号] ★核心护栏 —— 归一化恒等式 line === -rawLine, 外加「sup51 ≡ 官方线」的逐字节吻合
     [污染] ★★已完赛场次的 books 是滚球/结算值, 不是赛前线(逐家 MAE 判据); 官方线必须保持干净
     [池覆盖] 逐池开售场数; 四池全空的场要报出来
     [供应商] 过滤后的有效家数; 家数过少的场报警
     [逐节] 完赛场必须 Q1..Q4 齐备且逐节和 === 全场
     [字段] 逐池必填字段完备性(四池形状互不相同, 见 _lq_fetch.js 头注释)
     [市场] 全场/上半场盘的分类一致性
     [北单] 篮球【没有】北单渠道 —— 出现 '北单篮' 即报错(它是 _cq_fetch.js 里的死代码分支)
   用法: node tools/check_lq.js                 查全部 period + 打印最新一期的人读表
         node tools/check_lq.js --period=20260922   指定人读表的期号
         node tools/check_lq.js --quiet            只打违规与汇总
*/
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const QUIET = argv.includes("--quiet");
const periodArg = (argv.find(a => a.startsWith("--period=")) || "").split("=")[1];

const dir = __dirname;
const readJson = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const yn = new Date(Date.now() + 8 * 3600 * 1000);
const p2 = n => String(n).padStart(2, "0");
const TS = yn.getUTCFullYear() + p2(yn.getUTCMonth() + 1) + p2(yn.getUTCDate()) + " " +
           p2(yn.getUTCHours()) + ":" + p2(yn.getUTCMinutes());
const say = s => { if (!QUIET) console.log(s); };

let fails = 0;
const ok   = t => console.log("[" + t + "] ✓ 通过");
const warn = (t, s) => console.log("[" + t + "] ⚠️ " + s);
const bad  = (t, s) => { console.log("[" + t + "] ✗ 违规: " + s); fails++; };

// ---- 读入 ----
const poolFiles = fs.readdirSync(dir).filter(f => /^lqpool_\d{8}\.json$/.test(f)).sort();
if (!poolFiles.length) { console.error("✗ 没有 lqpool_<period>.json —— 先跑: node tools/_lq_pool.js --all"); process.exit(1); }
const pools = poolFiles.map(readJson);
const newest = (rx) => {
  const a = fs.readdirSync(dir).filter(f => rx.test(f)).sort();
  return a.length ? readJson(a[a.length - 1]) : null;
};
const lq = newest(/^lq_\d{4}\.json$/);
const cq = newest(/^cq_\d{4}\.json$/);

console.log("=".repeat(78));
console.log("竞彩篮球 数据层自检   " + TS + "   period " + pools.length + " 个 / 场次 " +
  pools.reduce((a, p) => a + p.matches.length, 0));
console.log("=".repeat(78));

const allMatches = pools.flatMap(p => p.matches.map(m => ({ ...m, _p: p })));

// ============ [咬合] ============
{
  const bad2 = pools.reduce((a, p) => a + (p.checks.unmatchedOfficial || 0), 0);
  // 独立复核: 用最新的官方原始文件对 label / tipoff 两路旁证逐字节比对
  let n = 0, misL = [], misT = [];
  if (lq && lq.pools) {
    const OFF = {};
    for (const arr of Object.values(lq.pools)) {
      for (const r of (arr || [])) {
        const bd = String(r.businessDate || "").replace(/-/g, "");
        if (bd) OFF[bd + "|" + r.matchNum] = r;
      }
    }
    for (const m of allMatches) {
      const r = OFF[m.period + "|" + m.num];
      if (!r) continue;             // 只比两边都在的 —— 老 period 官方原始文件已不含
      n++;
      if (m.label !== r.matchNumStr) misL.push(m.label + " vs " + r.matchNumStr);
      // 官方 matchTime 带秒("08:00:00"), 池里 tipoff 是 "08:00" ⇒ 比到分钟为止, 否则全是假违规
      const t = ((r.matchDate || "") + " " + (r.matchTime || "")).slice(0, 16);
      if (m.tipoff !== t) misT.push(m.label + " " + m.tipoff + " vs " + t);
    }
  }
  const parts = ["官方未咬合(池自报) " + bad2, "独立复核 " + n + " 场: label 不一致 " + misL.length + ", tipoff 不一致 " + misT.length];
  if (bad2 || misL.length || misT.length) {
    bad("咬合", parts.join(" · ") + (misL.length ? " · label 例 " + misL.slice(0, 3).join(", ") : "") +
      (misT.length ? " · tipoff 例 " + misT.slice(0, 3).join(", ") : ""));
  } else {
    say("[" + "咬合".padEnd(0) + "] ✓ 通过  " + parts.join(" · "));
  }
}

// ============ [窗口] ============
{
  // 一律按北京墙钟算 —— 用 Date.UTC 换算成"墙钟分钟数", 与运行机器的时区无关
  const P = s => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null; };
  const viol = [], noTime = [];
  for (const m of allMatches) {
    const pd = /^(\d{4})(\d{2})(\d{2})$/.exec(String(m.period));
    if (!pd) { noTime.push(m.label + "(period 异常)"); continue; }
    const ws = Date.UTC(+pd[1], +pd[2] - 1, +pd[3], 12, 0) / 60000, we = ws + 1440;
    const t = P(m.tipoff);
    if (t == null) { noTime.push(m.label + "(tipoff 缺失)"); continue; }
    if (t < ws || t >= we) viol.push(m.label + " " + m.tipoff + " 不在 [D 12:00, D+1 12:00)");
  }
  if (noTime.length) bad("窗口", noTime.length + " 场无 tipoff/period: " + noTime.slice(0, 5).join("; "));
  // ⚠️ 越窗是**须拍板项**, 不是缺陷: 实测 63 场里 1 场(周六301 2026-09-19 09:00, period 20260919)
  //    早于窗口起点 12:00 ⇒ 竞彩营业日 D 实际覆盖 [D 凌晨, D+1 上午], 比站点窗口 [D 12:00, D+1 12:00) 更早。
  //    按 period 分组会把这场挂到 09-19 面板上, 而站点既有约定会把它算进 09-18 —— 上站前必须定口径。
  if (viol.length) console.log("[窗口] ⚠️待拍板 " + viol.length + " 场早于窗口起点(竞彩营业日比站点窗口更早), 非数据缺陷: " + viol.slice(0, 5).join("; "));
  if (!viol.length && !noTime.length) ok("窗口");
}

// ============ [符号] ★核心护栏 ============
{
  let nChecked = 0, viol = [];
  for (const m of allMatches) {
    for (const b of m.books || []) {
      if (!b.ah || b.ah.line == null || b.ah.rawLine == null) continue;
      nChecked++;
      if (b.ah.line !== -b.ah.rawLine) viol.push(m.label + " sup" + b.sup + " line=" + b.ah.line + " raw=" + b.ah.rawLine);
    }
  }
  if (viol.length) bad("符号", "归一化恒等式 line === -rawLine 被打破 " + viol.length + " 条: " + viol.slice(0, 4).join("; "));

  // 官方接口 vs sup51 的逐字节吻合(池里自报的 offMismatch 汇总)
  const om = pools.reduce((a, p) => a + (p.checks.offMismatch || []).length, 0);
  if (om) bad("符号", "官方接口与 sup51 不吻合 " + om + " 条 —— 「sup51=官方线」前提被打破");

  // ★★★ 污染检测(2026-09-23 二次修正 —— 第一版这里是【读反的】):
  //   判据: 逐家 MAE = |真实净胜 − 盘口预测净胜|, 只用已完赛 + 全场盘。
  //   **篮球真实赛前线的正常误差是 9~13 分。** 低于 6 分 = 物理上不可能 = 该列装着结果。
  //   实测(55 场完赛): books 七家 1.5~5.0(被污染的滚球/结算值),
  //                    只有 sup51(≡官方线) 12.55 / sup30 13.30 落在真实量级。
  //   ⇒ 铁律: **已完赛场次只能用 official, books 一行都不能用。**
  //   ⚠️ 第一版把这张表当成"质量排行榜"读, 得出**相反**结论("官方线差 4 倍, 回测须以 books 为准")
  //      —— 等于教人去用那列装着答案的数据。这里保留此注记, 防止再有人(包括我)读反。
  const devBy = {};
  for (const m of allMatches) {
    if (!m.played || m.hs == null) continue;
    const marg = m.hs - m.as;
    for (const b of (m.books || [])) {
      if (b.market !== "full" || !b.ah || b.ah.line == null) continue;
      const d = devBy[b.sup] || (devBy[b.sup] = []);
      d.push(Math.abs(marg + b.ah.line));
    }
  }
  const supRows = Object.entries(devBy).map(([sup, e]) => ({ sup: +sup, n: e.length, mae: e.reduce((a, b) => a + b, 0) / e.length }))
    .filter(r => r.n >= 10).sort((a, b) => a.mae - b.mae);
  if (supRows.length) {
    const nPlayed = allMatches.filter(m => m.played && m.hs != null).length;
    const dirty = supRows.filter(r => r.mae < 6), clean = supRows.filter(r => r.mae >= 6);
    const fmt = r => "sup" + r.sup + " " + r.mae.toFixed(1) + "(n=" + r.n + ")";
    say("[污染]   已完赛 " + nPlayed + " 场逐家 MAE —— 被结果污染: " +
      (dirty.length ? dirty.map(fmt).join(" · ") : "(无)") + "  |  真实量级: " +
      (clean.length ? clean.map(fmt).join(" · ") : "(无)"));

    // 硬指标(人一眼可验): 中位数与真实净胜【只差 0.5 分】的场次数。真实赛前线不可能做到。
    let half = 0, tot = 0;
    for (const m of allMatches) {
      if (!m.played || m.hs == null) continue;
      const ls = (m.books || []).filter(b => b.market === "full" && !b.isOfficial && b.ah && b.ah.line != null).map(b => b.ah.line).sort((a, b) => a - b);
      if (!ls.length) continue;
      tot++;
      if (Math.abs((ls[ls.length >> 1]) + (m.hs - m.as)) <= 0.5) half++;
    }
    if (tot) say("[污染]   其中 " + half + "/" + tot + " 场的博彩盘中位数与真实净胜相差 ≤0.5 分" +
      (half > tot * 0.1 ? " ⇒ 坐实为赛后值(赛前线不可能)" : ""));

    // ★ 门禁: 官方线**必须**落在真实量级。它一旦也掉进 <6, 说明唯一干净的列没了 —— 上游变了, 必须人看。
    const off51 = supRows.find(r => r.sup === 51);
    if (off51 && off51.mae < 6) {
      bad("污染", "★sup51(≡官方线) 的已完赛 MAE 掉到 " + off51.mae.toFixed(1) + " 分(真实量级 9~13)" +
        " —— 唯一干净的赛前线列已被污染, 上游行为变了, 立即人工核查");
    }
    if (dirty.length && !off51) warn("污染", "被污染家 " + dirty.length + " 家, 但无 sup51 样本可比对");
  }
  if (!viol.length && !om) say("[符号] ✓ 通过  归一化恒等式 " + nChecked + " 条全部成立");
}

// ============ [池覆盖] ============
{
  const COLS = ["hdc", "hilo", "mnl", "wnm"];
  const cnt = Object.fromEntries(COLS.map(c => [c, 0]));
  const empty = [];
  for (const m of allMatches) {
    let any = false;
    for (const c of COLS) if (m.official && m.official[c]) { cnt[c]++; any = true; }
    if (!any) empty.push(m._p.period + " " + m.label);   // 标签会撞车(周六304 在 09-12 和 09-19 都有) ⇒ 必须带 period
  }
  const noOff = allMatches.filter(m => !m.official).length;
  if (empty.length) warn("池覆盖", "四池全空 " + empty.length + " 场: " + empty.slice(0, 8).join(", "));
  if (noOff) warn("池覆盖", "官方完全未上架 " + noOff + " 场(未开售属正常, 但下游须当 null 处理)");
  say("[池覆盖] " + COLS.map(c => c + " " + cnt[c]).join(" · ") +
    "  (mnl 覆盖本就偏低 —— 竞彩篮球挑场开不让分盘)");
}

// ============ [供应商] ============
{
  const thin = [], dead = [];
  for (const m of allMatches) {
    const n = (m.books || []).length;
    if (n > 0 && n < 5) thin.push(m.label + "(" + n + "家)");
    const bm = m.booksMeta || {};
    if (bm.invalid) dead.push(m.label + "(" + bm.invalid + "条荒谬价)");
  }
  if (thin.length) warn("供应商", "有效家数 < 5 的场 " + thin.length + ": " + thin.slice(0, 8).join(", "));
  if (dead.length) warn("供应商", "含荒谬价被剔除的行: " + dead.join(", "));
  const ns = allMatches.map(m => (m.books || []).length).filter(n => n > 0).sort((a, b) => a - b);
  say("[供应商] ✓ 通过  家数中位 " + (ns.length ? ns[ns.length >> 1] : "-") + " / 最少 " + (ns[0] ?? "-") + " / 最多 " + (ns[ns.length - 1] ?? "-"));
}

// ============ [逐节] ============
{
  const played = allMatches.filter(m => m.played);
  const noQ = [], badSum = [];
  for (const m of played) {
    const q = m.quarters;
    if (!q) { noQ.push(m._p.period + " " + m.label); continue; }
    const h = q.q1_hs + q.q2_hs + q.q3_hs + q.q4_hs, a = q.q1_as + q.q2_as + q.q3_as + q.q4_as;
    if (h !== m.hs || a !== m.as) badSum.push(m._p.period + " " + m.label + " 逐节和 " + h + ":" + a + " ≠ 全场 " + m.hs + ":" + m.as);
  }
  if (badSum.length) bad("逐节", badSum.length + " 场逐节和 ≠ 全场: " + badSum.slice(0, 5).join("; "));
  if (noQ.length) warn("逐节", "完赛但无逐节 " + noQ.length + " 场(可能刚完赛还没出, 跑 _lq_score.js 补): " + noQ.slice(0, 6).join(", "));
  if (!badSum.length) say("[逐节] ✓ 通过  完赛 " + played.length + " 场, 逐节和校验 " + (played.length - noQ.length) + " 场全部 == 全场");
}

// ============ [字段] ============
{
  const miss = [];
  for (const m of allMatches) {
    const o = m.official;
    if (o) {
      if (o.hdc && o.hdc.line == null) miss.push(m.label + ".hdc.line");
      if (o.hilo && o.hilo.line == null) miss.push(m.label + ".hilo.line");
      if (o.hilo && (o.hilo.over == null || o.hilo.under == null)) miss.push(m.label + ".hilo.over/under");
      if (o.mnl && (o.mnl.home == null || o.mnl.away == null)) miss.push(m.label + ".mnl.home/away");
      if (o.wnm) {
        if (!Array.isArray(o.wnm.w) || o.wnm.w.length !== 6 || !Array.isArray(o.wnm.l) || o.wnm.l.length !== 6) miss.push(m.label + ".wnm 档位不是 6+6");
        else if (o.wnm.w.some(v => v == null) || o.wnm.l.some(v => v == null)) miss.push(m.label + ".wnm 有空档");
      }
    }
    for (const b of m.books || []) {
      if (b.ah && (b.ah.win == null || b.ah.lost == null)) miss.push(m.label + ".sup" + b.sup + ".ah.win/lost");
      if (b.ou && (b.ou.over == null || b.ou.under == null)) miss.push(m.label + ".sup" + b.sup + ".ou.over/under");
      if (!b.marketWhy) miss.push(m.label + ".sup" + b.sup + ".marketWhy 空");
    }
  }
  if (miss.length) bad("字段", miss.length + " 处必填缺失: " + miss.slice(0, 6).join("; ") + (miss.length > 6 ? " …" : ""));
  else ok("字段");

  // 胜分差 w≡l 的报告(源数据异常信号, 非我们写错)
  const same = allMatches.filter(m => m.official && m.official.wnm &&
    JSON.stringify(m.official.wnm.w) === JSON.stringify(m.official.wnm.l)).map(m => m.label);
  if (same.length) warn("字段", "胜分差 w 与 l 六档全等 " + same.length + " 场(" + same.slice(0, 5).join(", ") + ") —— 源数据异常信号, 该场官方线通常也不可信");
}

// ============ [市场] ============
{
  const unk = [];
  for (const m of allMatches) for (const b of (m.books || [])) {
    // 三段全空的行(出奇给该场留了个 sup51 空壳)本就无从判定, 不算违规
    if (!b.valid || (!b.ah && !b.ou && !b.x12)) continue;
    if (b.market === "unknown" || b.market === "other") unk.push(m._p.period + " " + m.label + ".sup" + b.sup + "=" + b.market);
  }
  const fd = pools.reduce((a, p) => a + ((p.checks.market && p.checks.market.flagsDisagree) || 0), 0);
  const nr = pools.reduce((a, p) => a + ((p.checks.market && p.checks.market.noRef) || 0), 0);
  if (unk.length) bad("市场", "全场/半场无法判定 " + unk.length + " 行: " + unk.slice(0, 6).join(", "));
  if (nr) warn("市场", "无内标(判不了全场/半场) " + nr + " 场");
  if (fd) say("[市场] ⚠️ flags 与 ratio 异议 " + fd + " 条 —— 已知相关性缺陷(ratio 是测量, flags 只是相关性), 不影响判定");
  if (!unk.length) say("[市场] ✓ 通过  全场/半场逐行均已判定" + (nr ? "" : " · 无内标 " + nr));
}

// ============ [北单] ============
{
  const stray = cq ? (cq.matches || []).filter(m => m.lottery === "北单篮") : [];
  if (stray.length) bad("北单", "出现 " + stray.length + " 条 '北单篮' —— 篮球无北单渠道, 该分支是死代码: " + stray.slice(0, 3).map(m => m.label).join(", "));
  else ok("北单");
}

// ============ 人读表 ============
{
  const per = periodArg || pools[pools.length - 1].period;
  const p = pools.find(x => x.period === per) || pools[pools.length - 1];
  console.log("\n" + "─".repeat(78));
  console.log("人读表 · period " + p.period + "  (" + p.date + ")   " + p.matches.length + " 场");
  console.log("─".repeat(78));
  for (const m of p.matches) {
    const o = m.official || {};
    const st = m.played ? ("完赛 " + m.hs + "-" + m.as) : "未开赛";
    console.log("\n" + m.label + "  " + m.home + " vs " + m.away);
    console.log("   开赛 " + m.tipoff + "   [" + st + "]   " + m.league);
    const seg = [];
    if (o.hdc)  seg.push("让分 " + o.hdc.line + " (" + o.hdc.home + "/" + o.hdc.away + ")");
    if (o.hilo) seg.push("大小 " + o.hilo.line + " (" + o.hilo.over + "/" + o.hilo.under + ")");
    if (o.mnl)  seg.push("胜负 " + o.mnl.home + "/" + o.mnl.away);
    if (o.wnm)  seg.push("胜分差 有");
    console.log("   官方  " + (seg.length ? seg.join("   ") : "(未上架)") + "   来源 " + m.officialSrc);
    const byMk = {};
    for (const b of (m.books || [])) (byMk[b.market] = byMk[b.market] || []).push(b);
    for (const mk of ["full", "half1", "unknown"]) {
      const rows = byMk[mk]; if (!rows) continue;
      const tag = mk === "full" ? "全场" : (mk === "half1" ? "半场" : "未定");
      console.log("   " + tag + " " + String(rows.length).padStart(2) + " 家: " +
        rows.map(b => "s" + b.sup + ":" + (b.ah ? b.ah.line : "-") + "/" + (b.ou ? b.ou.line : "-") +
          (b.isOfficial ? "[官]" : "")).join("  "));
    }
    if (m.quarters) {
      const q = m.quarters;
      console.log("   逐节  Q1 " + q.q1_hs + ":" + q.q1_as + "  Q2 " + q.q2_hs + ":" + q.q2_as +
        "  Q3 " + q.q3_hs + ":" + q.q3_as + "  Q4 " + q.q4_hs + ":" + q.q4_as);
    }
  }
}

console.log("\n" + "=".repeat(78));
console.log(fails ? "✗ FAIL —— " + fails + " 项违规" : "✓ 全绿 —— 数据层自检通过");
console.log("=".repeat(78));
if (fails) process.exitCode = 1;
