/* 竞彩篮球 比分/逐节回填(2026-09-23 新增, 篮球板块数据层)
   动因: lqpool_<period>.json 是【建池当时】的快照 —— 盘口那一半必须冻结(那是位移档案的原料),
         但比分那一半会随比赛结束不断补齐。若图省事跑 _lq_pool.js --all 重建, 盘口会被刷成
         当前值, **归档就毁了**。故单开一个只动比分字段的回填器。
   本模块【只回填比分】, 不做任何判定
         (让分/大小分/胜分差怎么算赢, 属方法论步骤, 不在数据层)。
   写入字段(其余一律不动): status, played, hs, as, ht_hs, ht_as, quarters
   ⚠️ 回归护栏: 已 played 的场次【绝不】被回退成未开赛; 新值为 null 时【绝不】覆盖旧值。
          (cq 是滚动窗口, 老 period 迟早滑出; 一次误覆盖就把比分永久抹掉。)
   数据源: tools/cq_<MMDD>.json —— 须先跑 node tools/_cq_fetch.js 取最新
   用法: node tools/_lq_score.js              只回填当日 period
         node tools/_lq_score.js --all        全部 period
         node tools/_lq_score.js 20260922     指定单个 period
         node tools/_lq_score.js --all --dry  只报差异, 不落盘
   注意: 出奇的滚动窗口会丢掉老比赛 ⇒ 完赛后就尽快回填, 别拖。 */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const DRY = argv.includes("--dry");
const posArg = argv.find(a => !a.startsWith("--"));

const yn = new Date(Date.now() + 8 * 3600 * 1000);
const p2 = n => String(n).padStart(2, "0");
const TODAY = yn.getUTCFullYear() + p2(yn.getUTCMonth() + 1) + p2(yn.getUTCDate());

const dir = __dirname;
const readJson = f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

// ---- 找最新的 cq 快照(按文件名里的 MMDD, 非 mtime —— mtime 会被各种工具碰) ----
const cqFiles = fs.readdirSync(dir).filter(f => /^cq_\d{4}\.json$/.test(f)).sort();
if (!cqFiles.length) {
  console.error("✗ 没有 cq_<MMDD>.json —— 先跑: node tools/_cq_fetch.js");
  process.exit(1);
}
const cqName = cqFiles[cqFiles.length - 1];
const cq = readJson(cqName);
console.log("数据源 " + cqName + "  (取数于 " + cq.fetchedAt + ")");
const cqAgeMin = (Date.now() - new Date(cq.fetchedAt.replace(" ", "T") + "+08:00").getTime()) / 60000;
if (cqAgeMin > 180) {
  console.log("⚠️ 该快照已 " + Math.round(cqAgeMin) + " 分钟前取的 —— 回填比分前建议先跑 node tools/_cq_fetch.js 刷新");
}

// ---- eventId → 比分块 ----
const S = {};
for (const m of cq.matches || []) {
  S[m.eventId] = {
    status: m.status, played: !!m.played,
    hs: m.hs, as: m.as, ht_hs: m.ht_hs, ht_as: m.ht_as,
    quarters: m.quarters || null,
  };
}
console.log("出奇窗口内 " + Object.keys(S).length + " 场可查\n");

// ---- 逐 period 回填 ----
const poolFiles = fs.readdirSync(dir).filter(f => /^lqpool_\d{8}\.json$/.test(f)).sort();
const want = f => {
  const period = f.match(/_(\d{8})\.json/)[1];
  return ALL ? true : (posArg ? period === posArg : period === TODAY);
};
const targets = poolFiles.filter(want);
if (!targets.length) {
  console.error("✗ 没有匹配的 lqpool_<period>.json —— 先跑: node tools/_lq_pool.js" + (ALL ? " --all" : ""));
  process.exit(1);
}
if (posArg && !/^\d{8}$/.test(posArg)) {
  console.error("✗ 参数 " + posArg + " 不是 8 位 period(如 20260922)");
  process.exit(1);
}

let nFiles = 0, nChanged = 0, nNewPlayed = 0, nQuarters = 0, nMiss = 0;
const missExamples = [];

for (const f of targets) {
  const j = readJson(f);
  let changed = 0;

  for (const m of j.matches || []) {
    const s = S[m.eventId];
    if (!s) { nMiss++; if (missExamples.length < 5) missExamples.push(m.label); continue; }

    const before = JSON.stringify([m.status, m.played, m.hs, m.as, m.ht_hs, m.ht_as, m.quarters]);
    // status 永远取新值; 其余只在新值非 null 时覆盖
    m.status = s.status;
    if (s.played && !m.played) { m.played = true; nNewPlayed++; }
    if (s.hs != null) m.hs = s.hs;
    if (s.as != null) m.as = s.as;
    if (s.ht_hs != null) m.ht_hs = s.ht_hs;
    if (s.ht_as != null) m.ht_as = s.ht_as;
    if (s.quarters && !m.quarters) { m.quarters = s.quarters; nQuarters++; }
    if (JSON.stringify([m.status, m.played, m.hs, m.as, m.ht_hs, m.ht_as, m.quarters]) !== before) changed++;
  }

  if (changed) {
    nFiles++; nChanged += changed;
    if (!DRY) fs.writeFileSync(path.join(dir, f), JSON.stringify(j, null, 1), "utf8");
    console.log((DRY ? "  (dry) " : "  ✓ ") + f + "  更新 " + changed + " 场");
  }
}

console.log("\n" + (DRY ? "【dry-run, 未落盘】" : "✓ 回填完成") +
  "  改动文件 " + nFiles + " 个 / 场次 " + nChanged +
  "  (新完赛 " + nNewPlayed + ", 补逐节 " + nQuarters + ")");
if (nMiss) {
  console.log("⚠️ 有 " + nMiss + " 场在出奇窗口里查不到(eventId 已滑出, 或从未在窗口内)");
  console.log("   样例: " + missExamples.join(", ") + " —— 这些场次的比分【不再可回填】, 只能留空");
}
