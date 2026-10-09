/* 10-09 复盘(24 场: 周六 001-029; 本脚本可重复执行, 赛果到位后重跑即补全)。
   赛果来源: tools/_live1009.js(ESPN 主通道 + 出奇兜底)回填 data/predictions.js。
   判定: 方向层=标准 judgeDirection; 双选语义=罩住即红(全 24 场 dirTag=双选);
         🎯 胜平负卡=0胆0单选 → push(结构性, 不看赛果); 🔵 双选方向卡=双选红多于黑→hit;
         🏅 比分/🀄 北单310/💥 综合过关=对应串关全腿红→hit 否则 miss; 🌏/🟣 停更卡不判定(留 null)。
   用法: node tools/_review1009.js
         DRY=1 node tools/_review1009.js   ← 只打印不写文件 */
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "stats.js"));
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-09");
if (!d) { console.log("无 2026-10-09 数据"); process.exit(1); }
let touched = 0;

/* ---------- 腿 → 场次(同前缀日, 按 3 位号直接匹配) ---------- */
function findM(matchStr) {
  const id3 = String(matchStr || "").slice(0, 3);
  const names = String(matchStr || "").slice(4).split(" vs ");
  const cands = (d.matches || []).filter(x => String(x.id).slice(-3) === id3);
  if (cands.length === 1) return cands[0];
  return cands.find(x => x.home === names[0] && x.away === names[1]) || cands[0];
}

/* ---------- 一、方向层统计(仅已判场) ---------- */
let dblH = 0, dblM = 0, dirH = 0, dirN = 0, scH = 0, scN = 0;
(d.matches || []).forEach(m => {
  if (!m.finalScore || !m.direction) return;
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v !== null) { dirN++; if (v === 1) dirH++; }
  const s = S.parseScore(m.finalScore);
  if (String(m.dirTag || "").includes("双选")) {
    const r = (v === 1 || (s && s.home === s.away)) ? "hit" : "miss";
    r === "hit" ? dblH++ : dblM++;
  }
  if (Array.isArray(m.score) && m.score.includes(m.finalScore)) scH++;
  scN++;
});
const allJudged = (d.matches || []).every(m => m.finalScore);

/* ---------- 二、串关块判定 ---------- */
function legHitCombo7(l) {
  const m = findM(l.match);
  if (!m || !m.finalScore) return null;
  return S.judgeDirection(l.pick, m.finalScore, m.spHandicap);
}
function legHitScore3(l) {
  const m = findM(l.match);
  if (!m || !m.finalScore) return null;
  return m.finalScore === l.pick ? 1 : 0;
}
function legHitBd(l) {
  const m = findM(l.match);
  const fs = m && m.finalScore ? m.finalScore : l.finalScore;
  if (!fs) return null;
  const s = S.parseScore(fs);
  if (!s) return null;
  const hc = parseInt(l.handicap, 10) || 0;
  const adjH = s.home + hc;
  const side = adjH > s.away ? "3" : adjH < s.away ? "0" : "1";
  return String(l.pick).split("/").includes(side) ? 1 : 0;
}
function blockResultOf(blk, fn) {
  const rs = blk.legs.map(fn);
  if (rs.some(r => r === null)) return null;
  return rs.every(r => r === 1) ? "hit" : "miss";
}

if (d.combo7) {
  d.combo7.legs.forEach(l => {
    const r = legHitCombo7(l);
    if (r !== null) { l.result = r === 1 ? "hit" : "miss"; touched++; }
  });
  const br = blockResultOf(d.combo7, legHitCombo7);
  if (br !== null && d.combo7.result !== br) { d.combo7.result = br; touched++; }
}
if (d.score3) {
  d.score3.legs.forEach(l => {
    const r = legHitScore3(l);
    if (r !== null) { l.result = r === 1 ? "hit" : "miss"; touched++; }
  });
  const br = blockResultOf(d.score3, legHitScore3);
  if (br !== null && d.score3.result !== br) { d.score3.result = br; touched++; }
}
if (d.beidan310) {
  d.beidan310.legs.forEach(l => {
    const r = legHitBd(l);
    if (r !== null) { l.result = r === 1 ? "hit" : "miss"; touched++; }
  });
  const br = blockResultOf(d.beidan310, legHitBd);
  if (br !== null && d.beidan310.result !== br) { d.beidan310.result = br; touched++; }
}

/* ---------- 三、方案卡判定 ---------- */
function card(name) { return (d.plan || []).find(p => p.name === name); }
const setCard = (name, v) => { const c = card(name); if (c && c.result !== v) { c.result = v; touched++; } };

if (allJudged) {
  const sp = card("🎯 胜平负");
  if (sp && sp.text.indexOf("0胆0单选") !== -1) setCard("🎯 胜平负", "push");
  setCard("🔵 双选方向", dblH + dblM === 0 ? null : (dblH > dblM ? "hit" : "miss"));
  setCard("🏅 比分", (d.score3 && d.score3.result) || "miss");
  setCard("🀄 北单310", (d.beidan310 && d.beidan310.result) || "miss");
  setCard("💥 综合过关", (d.combo7 && d.combo7.result) || "miss");
}

/* ---------- 四、输出 ---------- */
console.log("--- 方向层逐场 ---");
(d.matches || []).forEach(m => {
  if (!m.finalScore) { console.log("  " + m.id + " 待赛"); return; }
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  const s = S.parseScore(m.finalScore);
  const dbl = String(m.dirTag || "").includes("双选") ? (v === 1 || (s && s.home === s.away) ? "红" : "黑") : "-";
  const sc = Array.isArray(m.score) && m.score.includes(m.finalScore) ? "比分红" : "";
  console.log("  " + m.id + " ★" + m.confidence + " " + m.direction + " (双选" + dbl + ") " + m.finalScore + "  方向=" + (v === 1 ? "红" : "黑") + " " + sc);
});
console.log("--- 统计 ---");
console.log("方向页面口径(已判 " + dirN + " 场): " + dirH + "/" + dirN);
console.log("双选语义(已判场): " + dblH + "红" + dblM + "黑");
console.log("比分命中: " + scH + "/" + scN);
console.log("plan: " + (d.plan || []).map(p => p.name + "=" + p.result).join(" | "));
console.log("[combo7]=" + (d.combo7 ? d.combo7.result : "无"));
console.log("[score3]=" + (d.score3 ? d.score3.result : "无"));
console.log("[beidan310]=" + (d.beidan310 ? d.beidan310.result : "无"));

if (process.env.DRY) { console.log("DRY 模式, 不写文件"); process.exit(0); }
if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("回填完成, touched=" + touched + " (" + file + ")");
} else {
  console.log("无变更");
}
