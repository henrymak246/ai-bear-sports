/* 10-19(周一) 比分盯梢回填: 深夜快车 8 场(周一001-008, 10-20 00:30~07:00 开球)。
   通道: ESPN 主通道 + 出奇兜底(瑞超 swe.1/法乙 fra.2 板内映射, 兜底走 cq 快照)。
   注意: 服务器 watch.sh 于 10-20(周二) 窗口自动跑本脚本回填。
   用法: node tools/_live1019.js          正常回填(有变更才写文件)
         node tools/_live1019.js --probe  只打印原始状态(调试映射) */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

const LEAGUES = {
  "周一001": "ita.1", "周一002": "swe.1", "周一003": "ita.1",
  "周一004": "fra.2", "周一005": "eng.1", "周一006": "esp.1",
  "周一007": "por.1", "周一008": "bra.1",
};
const TEAM = {
  "蒙扎": "Monza", "卡利亚里": "Cagliari",
  "代格福什": "Degerfors", "卡尔马": "Kalmar",
  "帕尔马": "Parma", "都灵": "Torino",
  "罗德兹": "Rodez", "蒙彼利埃": "Montpellier",
  "热刺": "Tottenham", "考文垂": "Coventry",
  "赫塔费": "Getafe", "巴列卡诺": "Rayo Vallecano",
  "布拉加": "Braga", "吉维森特": "Gil Vicente",
  "科林蒂安": "Corinthians", "维多利亚": "Vitória",
};
/* 北京 10-20 凌晨=UTC 10-19 傍晚, 双日期覆盖 ESPN 板日界 */
const DATES = ["20261019", "20261020"];

const boards = {};
function board(lg, dt) {
  const k = lg + "@" + dt;
  if (boards[k] == null) {
    try { boards[k] = execSync(`node "${SKILL}" board ${lg} ${dt}`, { encoding: "utf8", timeout: 60000 }); }
    catch (e) { boards[k] = ""; }
  }
  return boards[k];
}
function findScore(lg, homeSub, awaySub) {
  for (const dt of DATES) {
    for (const line of board(lg, dt).split("\n")) {
      const m = line.match(/^\s*(.+?)\s+(\d+)-(\d+)\s+(.+?)\s+\[(\w+)\]/);
      if (!m) continue;
      const [, h, hs, as, a, st] = m;
      if (h.toLowerCase().includes(homeSub.toLowerCase()) && a.toLowerCase().includes(awaySub.toLowerCase())) {
        return { score: hs + "-" + as, status: st, raw: line.trim() };
      }
    }
  }
  return null;
}

function cqSnap() {
  for (const dir of [path.join(__dirname, ".."), __dirname]) {
    try {
      const fs1 = fs.readdirSync(dir).filter((f) => /^cq_\d{4}\.json$/.test(f)).sort();
      if (fs1.length) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, fs1[fs1.length - 1]), "utf8"));
        return j.matches || j.rows || j.data || [];
      }
    } catch (e) { /* 下一处 */ }
  }
  return [];
}
function cqScoreLabel(label, lottery, minPeriod) {
  const rows = cqSnap().filter((r) => (lottery ? r.lottery === lottery : true) && r.label === label);
  let best = null;
  for (const r of rows) {
    const p = Number(r.period || 0);
    if (minPeriod && p && p < minPeriod) continue;
    if (!r.played) continue;
    if (!best || p > Number(best.period || 0)) best = r;
  }
  return best ? { score: best.hs + "-" + best.as, raw: JSON.stringify(best) } : null;
}

function main() {
  const days = require(file);
  const day = days.find((d) => d.date === "2026-10-19");
  if (!day) { console.log("无 2026-10-19 日"); return; }
  let changed = 0;
  for (const mm of day.matches) {
    const lg = LEAGUES[mm.id];
    let hit = null;
    if (lg) hit = findScore(lg, TEAM[mm.home], TEAM[mm.away]);
    if (!hit) {
      const cq = cqScoreLabel(mm.id, "竞彩", 20261019);
      if (cq) hit = { score: cq.score, status: "FULL_TIME", raw: cq.raw };
    }
    if (probe) {
      console.log("%s %s vs %s | %s", mm.id, mm.home, mm.away, hit ? hit.raw : "(未找到)");
      continue;
    }
    if (hit && /^(STATUS_FULL_TIME|FULL_TIME|FT)$/i.test(hit.status) && mm.finalScore !== hit.score) {
      console.log("%s %s vs %s → %s", mm.id, mm.home, mm.away, hit.score);
      mm.finalScore = hit.score;
      changed++;
    }
  }
  if (changed && !probe) {
    const src = fs.readFileSync(file, "utf8");
    const header = src.slice(0, src.indexOf("const PREDICTION_DAYS"));
    const json = JSON.stringify(days, null, 2).split("\n").map(l => l.startsWith("  ") ? l.slice(2) : l).join("\n").replace(/\n\]$/, "];");
    fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n", "utf8");
    console.log("已回填 %d 场", changed);
  } else if (!probe) {
    console.log("无变更");
  }
}
main();
