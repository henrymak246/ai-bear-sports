/* 10-23(周五) 深夜快车窗口比分盯梢: 周四001-013 欧罗巴10场+欧协联2场+解放者杯1场全凌晨(00:45~08:30 开球, 005 让球-only 弃选不在池)。
   通道: ESPN 主通道(欧罗巴 uefa.europa + 欧协联 uefa.conference + 解放者杯 conmebol.libertadores) + 出奇兜底(全场有北单号)。
   用法: node tools/_live1023.js          正常回填(有变更才写文件)
         node tools/_live1023.js --probe  只打印原始状态(调试映射) */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

const LEAGUES = {
  "周四001": "uefa.europa", "周四002": "uefa.europa", "周四003": "uefa.europa",
  "周四004": "uefa.europa", "周四006": "uefa.europa", "周四007": "uefa.europa",
  "周四008": "uefa.europa", "周四009": "uefa.europa", "周四010": "uefa.europa",
  "周四011": "uefa.europa.conf", "周四012": "uefa.europa.conf", "周四013": "conmebol.libertadores",
};
const TEAM = {
  "格风暴": "Sturm Graz", "马赛": "Marseille",
  "波兹南": "Lech Poznan", "桑德兰": "Sunderland",
  "萨迪纳摩": "Dinamo Zagreb", "奈梅亨": "NEC",
  "尤文图斯": "Juventus", "雷恩": "Rennais",
  "伯恩茅斯": "Bournemouth", "AC米兰": "Milan",
  "凯尔特人": "Celtic", "塞尔塔": "Celta Vigo",
  "贝西克塔": "Besiktas", "水晶宫": "Crystal Palace",
  "霍芬海姆": "Hoffenheim", "里昂": "Lyon",
  "利勒斯特": "Lillestr", "皇家社会": "Real Sociedad",
  "阿贾克斯": "Ajax", "亚特兰大": "Atalanta",
  "摩纳哥": "Monaco", "弗赖堡": "Freiburg",
  "弗拉门戈": "Flamengo", "拉普大学": "Estudiantes",
};
// 出奇兜底: 竞彩号 → 北单对阵表 label(北单NNN, 与 bd500 表一致)
const BDNUM = {
  "周四001": "北单76", "周四002": "北单77", "周四003": "北单75",
  "周四004": "北单73", "周四006": "北单89", "周四007": "北单88",
  "周四008": "北单94", "周四009": "北单93", "周四010": "北单95",
  "周四011": "北单97", "周四012": "北单98", "周四013": "北单103",
};
const DATES = ["20261022", "20261023"];

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
  // 队名校验(2026-10-21 新增): 北单小号码存在多期同名, 必须队名双锚防串期
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
  const day = days.find((d) => d.date === "2026-10-23");
  if (!day) { console.log("无 2026-10-23 日"); return; }
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
