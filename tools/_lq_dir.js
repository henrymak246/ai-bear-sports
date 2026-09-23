/* tools/_lq_dir.js — 把人工撰写的方向层合并进 data/predictions.js(2026-09-23 新增)
 *
 * 为什么这一步要单独存在:
 *   方向层(日级 plan + 逐场 direction/synthesis/...)是**分析产物**, 不是数据映射。
 *   它必须与「从池文件生成 matches」分开 —— 生成器 tools/_lq_site.js 只拥有 period/matches,
 *   且已改为按 num 回挂、不覆盖方向层。本脚本负责**首次写入 / 更新**这些字段。
 *
 *   ★ 撰写内容本身就是不可再生的资产(它是判断, 不是抓下来的数据) ⇒ 按 tools/lqsnap/ 同一条原则
 *     进 git: lqdir_<YYYYMMDD>.json。predictions.js 是 gitignore 的, 方向层若只活在那里,
 *     就没有任何版本可回溯 —— 足球侧现在就是这个状态。
 *
 * 输入: 全部 tools/lqdir_<YYYYMMDD>.json, 每个文件一天:
 *   { date: "2026-09-23",
 *     plan: [ {market,name,pct,text,detail}, ... ],                          // 整篇替换
 *     dirs: { "3301": {direction,dirTag,confidence,synthesis,ahPick,ouPick,note}, ... } }
 *
 * ★ 用 num 当连接键(不是队名、不是 label) —— 与 _bd_pool / _lq_pool / _lq_site 同一条纪律。
 *
 * 安全: 与 _lq_site.js 同一套**序列化自证** —— 用 days 重建整文件并与磁盘逐字节比对,
 *       一致才允许写。这样「本次改动是唯一改动」是被证明的, 不是被假设的。
 *       (data/predictions.js 可能有并行会话在改, 故拒绝任何隐式重排。)
 *
 * 用法: node tools/_lq_dir.js            全部 lqdir_*.json 各应用一次
 *       node tools/_lq_dir.js 20260923   只应用指定日期
 *       node tools/_lq_dir.js --dry      只报会改什么, 不落盘
 */
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const dateArg = argv.find(a => /^\d{8}$/.test(a)) || null;
const dateArgDash = dateArg ? dateArg.slice(0, 4) + "-" + dateArg.slice(4, 6) + "-" + dateArg.slice(6) : null;

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "predictions.js");
// ★ 与 _lq_site.js 逐字相同 —— 两处不一致会直接把整份文件重排
const HEADER = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n' +
  '   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
const PRE = "const PREDICTION_DAYS = ";
const FOOT = ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n';
const ser = days => "[\n" + days.map(d => JSON.stringify(d, null, 2)).join(",\n") + "]";

// ---- 序列化自证(与 _lq_site.js 同款) ----
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

// ---- 逐份 patch 应用 ----
const KEEP = ["direction", "dirTag", "confidence", "synthesis", "ahPick", "ouPick", "note"];
const files = fs.readdirSync(__dirname).filter(f => /^lqdir_\d{8}\.json$/.test(f)).sort()
  .filter(f => !dateArg || f === "lqdir_" + dateArg + ".json");
if (!files.length) { console.error("✗ 没有匹配的 lqdir_<YYYYMMDD>.json"); process.exit(1); }

const log = [];
let nApplied = 0, nMissDate = [], nMissNum = [];
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));
  const day = days.find(d => d.date === p.date);
  if (!day) { nMissDate.push(p.date + " (" + f + ")"); continue; }
  if (!day.basketball) { nMissDate.push(p.date + " 有 patch 但该日无 day.basketball"); continue; }
  let nPlan = 0, nDir = 0, nNoNum = [];
  // 1) 日级 plan —— **整篇替换**(patch 是这一天的权威版本)
  if (Array.isArray(p.plan) && p.plan.length) {
    day.basketball.plan = p.plan;
    nPlan = p.plan.length;
  }
  // 2) 逐场 —— 按 num 合并(只覆盖 patch 里显式给了的字段, 其余字段不动)
  const byNum = {};
  (day.basketball.matches || []).forEach(m => { if (m && m.num != null) byNum[String(m.num)] = m; });
  Object.keys(p.dirs || {}).forEach(num => {
    const m = byNum[num];
    if (!m) { nNoNum.push(num); return; }
    const d = p.dirs[num] || {};
    KEEP.forEach(k => { if (d[k] != null) m[k] = d[k]; });
    nDir++;
  });
  if (nNoNum.length) nMissNum.push(p.date + " 这些 num 在当日池里找不到: " + nNoNum.join(", "));
  log.push("  " + p.date + "  (" + f + ")  plan " + nPlan + " 张 · 逐场方向 " + nDir + " 场");
  nApplied++;
}
if (nMissDate.length) console.log("⚠️ 跳过: " + nMissDate.join(" · "));
if (nMissNum.length) { console.log("⚠️ num 对不上(方向写给了不存在的场次, 必须人工确认):"); nMissNum.forEach(x => console.log("   · " + x)); }
if (!nApplied) { console.log("· 没有需要应用的 patch, 退出"); return; }
console.log("将应用 " + nApplied + " 天:");
log.forEach(l => console.log(l));

const out = HEADER + PRE + ser(days) + FOOT;
if (DRY) { console.log("(dry-run —— 未落盘, 预计字节 " + disk.length + " → " + out.length + ")"); return; }
fs.writeFileSync(DATA, out, "utf8");
console.log("✓ → data/predictions.js   " + disk.length + " → " + out.length + " 字节 (+" + (out.length - disk.length) + ")");
console.log("  下一步: node tools/_lq_site.js --dry  (确认生成器不会覆盖方向层)");
