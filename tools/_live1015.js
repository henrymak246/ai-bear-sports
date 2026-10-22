/* 10-15(周四建日) 比分盯梢回填: 24 场(周四 13 场 @10-16 00:45/03:00/08:30 + 周五 11 场 @10-16 17:00~10-17 07:00)。
   通道: **ESPN 主通道**(各联赛板 @20261015/16/17 UTC) + 出奇兜底(全 24 场均有 ESPN 码, 兜底仅作备份)。
   用法: node tools/_live1015.js          正常回填(有变更才写文件)
         node tools/_live1015.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 欧罗巴/欧协联联赛阶段常规轮次无加时; 解放者杯半决赛首回合(若加时以 90 分钟比分终判)。
   映射已验证(10-15 建日板面逐场核对): 欧罗巴=uefa.europa(Union St.-Gilloise 带点/TSG Hoffenheim/F.C. København 带符号)
       / 欧协联=uefa.europa.conf(CSU Craiova)/ 解放者杯=conmebol.libertadores@20261015(Estudiantes de La Plata)
       / 德乙=Nürnberg 带变音/瑞超=IF Brommapojkarna/荷乙=FC Den Bosch vs TOP Oss/英冠=Wolverhampton Wanderers/西甲=Deportivo/巴甲=Mirassol vs Internacional。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周四001": "uefa.europa", "周四002": "uefa.europa", "周四003": "uefa.europa",
  "周四004": "uefa.europa", "周四005": "uefa.europa", "周四006": "uefa.europa.conf",
  "周四008": "uefa.europa", "周四009": "uefa.europa", "周四010": "uefa.europa",
  "周四011": "uefa.europa", "周四012": "uefa.europa", "周四013": "uefa.europa.conf",
  "周四014": "conmebol.libertadores",
  "周五001": "aus.1", "周五002": "ger.2", "周五003": "swe.1", "周五004": "ned.1",
  "周五005": "ned.2", "周五006": "ger.1", "周五007": "ita.1", "周五008": "fra.1",
  "周五009": "eng.2", "周五010": "esp.1", "周五011": "bra.1",
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; --probe 可再验) */
const TEAM = {
  "里昂": "Lyon", "水晶宫": "Crystal Palace",
  "托林斯": "Torreense", "桑德兰": "Sunderland",
  "波兹南": "Lech Poznan", "勒沃库森": "Leverkusen",
  "圣吉联合": "Gilloise", "皇家社会": "Real Sociedad",
  "萨尔茨堡": "RB Salzburg", "AC米兰": "AC Milan",
  "克拉约瓦": "Craiova", "赫塔费": "Getafe",
  "塞尔塔": "Celta", "尤文图斯": "Juventus",
  "霍芬海姆": "Hoffenheim", "贝西克塔": "Besiktas",
  "马赛": "Marseille", "奥林匹亚": "Olympiacos",
  "伯恩茅斯": "Bournemouth", "格风暴": "Sturm Graz",
  "本菲卡": "Benfica", "凯尔特人": "Celtic",
  "哥本哈根": "København", "布拉加": "Braga",
  "拉普大学": "Estudiantes", "弗拉门戈": "Flamengo",
  "悉尼FC": "Sydney FC", "西悉尼": "Western Sydney Wanderers",
  "科特布斯": "Cottbus", "纽伦堡": "Nürnberg",
  "布鲁马波": "Brommapojkarna", "佐加顿斯": "Djurgården",
  "海伦芬": "Heerenveen", "SBV精英": "Excelsior",
  "登博思": "Den Bosch", "奥斯": "TOP Oss",
  "法兰克福": "Frankfurt", "科隆": "Cologne",
  "弗洛西诺": "Frosinone", "萨索洛": "Sassuolo",
  "勒芒": "Le Mans", "图卢兹": "Toulouse",
  "伯恩利": "Burnley", "伍尔弗": "Wolverhampton",
  "拉科": "Deportivo", "莱万特": "Levante",
  "米拉索尔": "Mirassol", "巴西国际": "Internacional",
};
const DATES = ["20261015", "20261016", "20261017"];

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

/* 出奇兜底: cq 快照按 label 精确匹配(自动取最新 cq_*.json), 新结构 hs/as 计分 */
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
  if (!rows.length) return null;
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
  const day = days.find((d) => d.date === "2026-10-15");
  if (!day) { console.log("无 2026-10-15 日"); return; }
  let changed = 0;
  for (const mm of day.matches) {
    const lg = LEAGUES[mm.id];
    let hit = null;
    if (lg) hit = findScore(lg, TEAM[mm.home], TEAM[mm.away]);
    if (!hit) hit = cqScoreLabel(mm.id, "竞彩", 20261015);
    if (probe) {
      console.log("%s %s vs %s | %s", mm.id, mm.home, mm.away, hit ? hit.raw : "(未找到)");
      continue;
    }
    if (hit && /^(STATUS_FULL_TIME|FULL_TIME|FT)$/i.test(hit.status)) {
      if (mm.finalScore !== hit.score) {
        console.log("%s %s vs %s → %s", mm.id, mm.home, mm.away, hit.score);
        mm.finalScore = hit.score;
        changed++;
      }
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
