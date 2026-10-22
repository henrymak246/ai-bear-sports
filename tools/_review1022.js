/* 10-22 复盘(周三池第二晚 9 场欧冠, 可重复执行; 赛果主体由 _live1022.js 回填, 013 解放者杯本脚本幂等补 0-1)。
   013 帕梅拉斯 0-1 弗鲁米嫩塞: 90'+5' End Regular Time=0-1(82' Hércules), 点球大战不计(竞彩 90 分钟结算口径, ESPN event 401912520)。
   🎯=单选场判定(无单选且 0 胆=push); 🔵=双选红多于黑 hit; 🏅/🀄=对应串全红 hit 否则 miss;
   asian7(亚盘)/大小盘/胜负彩 legs 结果由终审按 judgeAh/judgeOverUnder 口径手工回填(_final1022.js)。
   用法: node tools/_review1022.js; DRY=1 node tools/_review1022.js 只打印不写。 */
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "stats.js"));
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-22");
if (!d) { console.log("无 2026-10-22 数据"); process.exit(1); }
let touched = 0;

/* 013 解放者杯 90 分钟比分幂等回填(点球大战不计) */
const m013 = (d.matches || []).find(x => x.id === "周三013");
if (m013 && m013.finalScore !== "0-1") { m013.finalScore = "0-1"; touched++; }

function findM(matchStr) {
  const id3 = String(matchStr || "").slice(0, 3);
  const names = String(matchStr || "").slice(4).split(" vs ");
  const cands = (d.matches || []).filter(x => String(x.id).slice(-3) === id3);
  if (cands.length === 1) return cands[0];
  return cands.find(x => x.home === names[0] && x.away === names[1]) || cands[0];
}

let dblH = 0, dblM = 0, dirH = 0, dirN = 0, scH = 0, scN = 0, soloH = 0, soloN = 0;
(d.matches || []).forEach(m => {
  if (!m.finalScore || !m.direction) return;
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v !== null) { dirN++; if (v === 1) dirH++; }
  const s = S.parseScore(m.finalScore);
  if (String(m.dirTag || "").includes("双选")) {
    const r = (v === 1 || (s && s.home === s.away)) ? "hit" : "miss";
    r === "hit" ? dblH++ : dblM++;
  }
  if (m.dirTag === "单选") { soloN++; if (v === 1) soloH++; }
  if (Array.isArray(m.score) && m.score.includes(m.finalScore)) scH++;
  scN++;
});
const allJudged = (d.matches || []).every(m => m.finalScore);

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

if (d.score3) {
  d.score3.legs.forEach(l => {
    const r = legHitScore3(l);
    if (r !== null && l.result !== (r === 1 ? "hit" : "miss")) { l.result = r === 1 ? "hit" : "miss"; touched++; }
  });
  const br = blockResultOf(d.score3, legHitScore3);
  if (br !== null && d.score3.result !== br) { d.score3.result = br; touched++; }
}
if (d.beidan310) {
  d.beidan310.legs.forEach(l => {
    const r = legHitBd(l);
    if (r !== null && l.result !== (r === 1 ? "hit" : "miss")) { l.result = r === 1 ? "hit" : "miss"; touched++; }
  });
  const br = blockResultOf(d.beidan310, legHitBd);
  if (br !== null && d.beidan310.result !== br) { d.beidan310.result = br; touched++; }
}

function card(name) { return (d.plan || []).find(p => p.name === name); }
const setCard = (name, v) => { const c = card(name); if (c && c.result !== v) { c.result = v; touched++; } };
if (allJudged) {
  const sp = card("🎯 胜平负");
  if (sp) {
    if (soloN > 0) setCard("🎯 胜平负", soloH === soloN ? "hit" : "miss"); // 有单选按单选判定
    else if (sp.text.indexOf("0胆") !== -1 || sp.text.indexOf("零胆") !== -1) setCard("🎯 胜平负", "push"); // 0胆0单选=push(1020坑: 两种写法都兜)
  }
  setCard("🔵 双选方向", dblH + dblM === 0 ? null : (dblH > dblM ? "hit" : "miss"));
  setCard("🏅 比分", (d.score3 && d.score3.result) || "miss");
  setCard("🀄 北单310", (d.beidan310 && d.beidan310.result) || "miss");
}

console.log("--- 方向层逐场 ---");
(d.matches || []).forEach(m => {
  if (!m.finalScore) { console.log("  " + m.id + " " + m.home + "vs" + m.away + " 待赛"); return; }
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  const s = S.parseScore(m.finalScore);
  const dbl = String(m.dirTag || "").includes("双选") ? (v === 1 || (s && s.home === s.away) ? "红" : "黑") : "-";
  const sc = Array.isArray(m.score) && m.score.includes(m.finalScore) ? "比分红" : "";
  console.log("  " + m.id + " ★" + m.confidence + " " + m.direction + " [" + (m.dirTag || "") + "] (双选" + dbl + ") " + m.finalScore + " 方向=" + (v === 1 ? "红" : "黑") + " " + sc);
});
console.log("--- 统计(已判场) ---");
console.log("方向页面口径: " + dirH + "/" + dirN);
console.log("双选语义: " + dblH + "红" + dblM + "黑");
console.log("单选: " + soloH + "/" + soloN);
console.log("比分命中: " + scH + "/" + scN);
console.log("全日赛果齐: " + (allJudged ? "是" : "否(有待赛场)"));
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
  console.log("回填完成, touched=" + touched);
} else {
  console.log("无变更");
}
