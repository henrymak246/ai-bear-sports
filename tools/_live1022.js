/* 10-22(周四) 深夜快车窗口比分盯梢: 周三004-013 欧冠第二晚 9 场全凌晨(00:45~08:30 开球)。
   通道: ESPN 主通道(欧冠 7 场 uefa.champions + 英冠 eng.2) + 出奇兜底(全 8 场有北单号)。
   用法: node tools/_live1022.js          正常回填(有变更才写文件)
         node tools/_live1021.js --probe  只打印原始状态(调试映射) */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

const LEAGUES = {
  "周三004": "uefa.champions", "周三005": "uefa.champions", "周三006": "esp.1",
  "周三007": "uefa.champions", "周三008": "uefa.champions", "周三009": "uefa.champions",
  "周三010": "uefa.champions", "周三012": "uefa.champions", "周三013": "conmebol.libertadores",
};
const TEAM = {
  "科莫": "Como", "曼联": "Manchester United",
  "里尔": "Lille", "加拉塔萨": "Galatasaray",
  "莱万特": "Levante", "毕尔巴鄂": "Athletic",
  "皇马": "Real Madrid", "莱红牛": "RB Leipzig",
  "维拉": "Aston Villa", "维京": "Viking",
  "贝蒂斯": "Real Betis", "费耶诺德": "Feyenoord",
  "拜仁": "Bayern", "阿森纳": "Arsenal",
  "布鲁日": "Club Brugge", "朗斯": "Lens",
  "帕梅拉斯": "Palmeiras", "弗鲁米嫩": "Fluminense",
};
// 出奇兜底: 竞彩号/北单号 → 北单对阵表 label(北单NNN, 与 bd500 表一致); 北单场为恒等映射
const BDNUM = {
  "周三004": "北单58", "周三005": "北单57", "周三006": "北单60",
  "周三007": "北单62", "周三008": "北单64", "周三009": "北单66",
  "周三010": "北单61", "周三012": "北单65", "周三013": "北单71",
};
const DATES = ["20261021", "20261022"];

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
function cqScoreLabel(label, lottery, minPeriod, homeSub, awaySub) {
  // 队名校验(2026-10-21 新增): 北单小号码存在多期同名(label=北单5 可匹配到 10-17 旧场), 必须队名双锚防串期
  const rows = cqSnap().filter((r) => (lottery ? r.lottery === lottery : true) && r.label === label
    && (!homeSub || String(r.home || "").includes(homeSub)) && (!awaySub || String(r.away || "").includes(awaySub)));
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
  const day = days.find((d) => d.date === "2026-10-22");
  if (!day) { console.log("无 2026-10-22 日"); return; }
  let changed = 0;
  for (const mm of day.matches) {
    const lg = LEAGUES[mm.id];
    let hit = null;
    if (lg) hit = findScore(lg, TEAM[mm.home], TEAM[mm.away]);
    if (!hit) {
      const cq = cqScoreLabel(BDNUM[mm.id], "北单", 26106, mm.home, mm.away);
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
