/* 10-19 深夜快车窗口复盘(北单池 23 场, 可重复执行; 赛果由 _live1019.js 回填)。
   🎯=0胆0单选 push; 🔵=双选红多于黑 hit; asian7(混合过关)结果由终审按 leg 口径手工回填。
   用法: node tools/_review1019.js; DRY=1 node tools/_review1019.js 只打印不写。 */
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "stats.js"));
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-19");
if (!d) { console.log("无 2026-10-19 数据"); process.exit(1); }
let touched = 0;

let dblH = 0, dblM = 0, dirH = 0, dirN = 0;
(d.matches || []).forEach(m => {
  if (!m.finalScore || !m.direction) return;
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v !== null) { dirN++; if (v === 1) dirH++; }
  const s = S.parseScore(m.finalScore);
  if (String(m.dirTag || "").includes("双选")) {
    const r = (v === 1 || (s && s.home === s.away)) ? "hit" : "miss";
    r === "hit" ? dblH++ : dblM++;
  }
});
const allJudged = (d.matches || []).every(m => m.finalScore);

function card(name) { return (d.plan || []).find(p => p.name === name); }
const setCard = (name, v) => { const c = card(name); if (c && c.result !== v) { c.result = v; touched++; } };
if (allJudged) {
  const sp = card("🎯 胜平负");
  if (sp && sp.text.indexOf("0胆0单选") !== -1) setCard("🎯 胜平负", "push");
  setCard("🔵 双选方向", dblH + dblM === 0 ? null : (dblH > dblM ? "hit" : "miss"));
}

console.log("--- 方向层逐场 ---");
(d.matches || []).forEach(m => {
  if (!m.finalScore) { console.log("  " + m.id + " " + m.home + "vs" + m.away + " 待赛"); return; }
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  const s = S.parseScore(m.finalScore);
  const dbl = String(m.dirTag || "").includes("双选") ? (v === 1 || (s && s.home === s.away) ? "红" : "黑") : "-";
  console.log("  " + m.id + " ★" + m.confidence + " " + m.direction + " (双选" + dbl + ") " + m.finalScore + " 方向=" + (v === 1 ? "红" : "黑"));
});
console.log("--- 统计(已判场) ---");
console.log("方向页面口径: " + dirH + "/" + dirN);
console.log("双选语义: " + dblH + "红" + dblM + "黑");
console.log("全日赛果齐: " + (allJudged ? "是" : "否(有待赛场)"));
console.log("[asian7 混合过关]=" + (d.asian7 ? "待终审按腿手工判" : "无"));

if (process.env.DRY) { console.log("DRY 模式, 不写文件"); process.exit(0); }
if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("回填完成, touched=" + touched);
} else {
  console.log("无变更");
}
