/* _patch1022_kj26146.js — 胜负彩 26146 期开奖回填(2026-10-22 开奖, 源=懂球帝官方开奖报道):
   官方开奖号 3 3 3 0 3 3 1 3 0 3 1 3 3 3; 一等奖 401注×30957元 / 二等奖 9535注×557元 / 任九 41843注×274元。
   本票: 64注128元 11红3黑 全灭; 任九 8注16元 全灭(单拖波尔图3✗ 串掉全部 8 注); 3胆全红(利物浦/曼城/罗马)。
   写入: ① zucai310.note 追加【开奖回填】 ② rensuan9.note/result ③ 🌍胜负彩卡 result=miss ④ 💰卡 result=miss(北单净-128+增强层2元输半)。
   用法: node tools/_patch1022_kj26146.js (幂等); 之后 _deploy_watch.sh + sync-data.js */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-21");
if (!d || !d.zucai310) { console.error("无 2026-10-21 zucai310"); process.exit(1); }
let touched = 0;
const set = (obj, k, v) => { if (obj && obj[k] !== v) { obj[k] = v; touched++; } };

/* ① zucai310.note 开奖回填(幂等: 已含「开奖回填」则跳过) */
const KJ = " 【开奖回填】官方开奖号 3 3 3 0 3 3 1 3 0 3 1 3 3 3(2026-10-22 开奖, 源=懂球帝官方开奖报道): 全期 11红3黑, 3 胆全红(利物浦 4-3/曼城 5-1/罗马 4-0), 3 黑=波尔图 3✗(0-1 客胜爆冷)/科莫场 0✗(科莫 4-1 主胜, 彩腿未对齐方向层防冷预警)/里尔 3/1✗(2-4 客胜直输); 一等奖 401 注×30957 元, 二等奖 9535 注×557 元, 任九 41843 注×274 元; 64 注 128 元与任九 8 注 16 元全灭(波尔图单腿黑串掉任九全部组合)。";
if (!d.zucai310.note.includes("开奖回填")) { d.zucai310.note += KJ; touched++; }

/* ② 任九 */
if (d.zucai310.rensuan9) {
  const r9 = d.zucai310.rensuan9;
  if (!r9.note.includes("开奖")) { r9.note += " 开奖: 3胆全红(利物浦/曼城/罗马); 单拖波尔图3✗(0-1)串掉全部 → 8 注全灭。"; touched++; }
  set(r9, "result", "miss");
}

/* ③④ plan 卡 */
const card = (n) => (d.plan || []).find(p => p.name === n);
if (card("🌍 胜负彩")) set(card("🌍 胜负彩"), "result", "miss");
if (card("💰 投注建议")) set(card("💰 投注建议"), "result", "miss");

if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("✓ 26146 开奖回填已写入, touched=" + touched);
} else console.log("无变更(已回填过)");
