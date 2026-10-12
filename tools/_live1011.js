/* 10-11(周日建日) 比分盯梢回填: 25 场(周日004-028, 10-11 18:15 起至 10-12 07:00)。
   通道: **ESPN 主通道**(欧洲联赛 @20261011/20261012 各联赛板) + **出奇兜底**(芬超 fin.1 已死 → cq 快照 label 匹配)。
   用法: node tools/_live1011.js          正常回填(有变更才写文件)
         node tools/_live1011.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 全部为联赛常规轮次, 无加时; ESPN FULL_TIME / 出奇 played=true 即终场。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周日004": "ned.1", "周日005": "ita.1", "周日006": "eng.2", "周日007": "esp.1",
  "周日008": null,                                                        // 芬超 fin.1 已死 → 出奇
  "周日009": "ned.1", "周日010": "nor.1", "周日011": "eng.1", "周日012": "eng.1",
  "周日013": "ita.1", "周日014": "ita.1", "周日015": "fra.1", "周日016": "ger.1",
  "周日017": "esp.1", "周日018": "eng.1", "周日019": "ger.1", "周日020": "ita.1",
  "周日021": "esp.1", "周日022": "por.1", "周日023": "nor.1", "周日024": "ita.1",
  "周日025": "fra.1", "周日026": "esp.1", "周日027": "bra.1", "周日028": "usa.1",
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; --probe 可再验) */
const TEAM = {
  "乌德勒支": "Utrecht", "威廉二世": "Willem II",
  "科莫": "Como", "罗马": "Roma",
  "南安普敦": "Southampton", "朴次茅斯": "Portsmouth",
  "埃尔切": "Elche", "塞尔塔": "Celta",
  "兹沃勒": "Zwolle", "坎布尔": "Cambuur",
  "腓特烈": "Fredrikstad", "特罗姆瑟": "Troms",
  "赫尔城": "Hull", "埃弗顿": "Everton",
  "水晶宫": "Crystal Palace", "诺丁汉": "Nottingham",
  "拉齐奥": "Lazio", "蒙扎": "Monza",
  "莱切": "Lecce", "博洛尼亚": "Bologna",
  "尼斯": "Nice", "斯特拉斯": "Strasbourg",
  "科隆": "Cologne", "门兴": "Mönchengladbach",
  "皇家社会": "Real Sociedad", "拉科": "Deportivo",
  "利物浦": "Liverpool", "曼城": "Manchester City",
  "弗赖堡": "Freiburg", "沙尔克04": "Schalke",
  "萨索洛": "Sassuolo", "AC米兰": "AC Milan",
  "贝蒂斯": "Real Betis", "奥萨苏纳": "Osasuna",
  "本菲卡": "Benfica", "吉马良斯": "imar",
  "利勒斯特": "Lillestr", "莫尔德": "Molde",
  "卡利亚里": "Cagliari", "尤文图斯": "Juventus",
  "特鲁瓦": "Troyes", "马赛": "Marseille",
  "桑坦德": "Racing Santander", "巴伦西亚": "Valencia",
  "米竞技": "Atlético", "桑托斯": "Santos",
  "圣路易城": "St. Louis", "洛城银河": "Galaxy",
};
const DATES = ["20261011", "20261012"];

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

/* 出奇兜底: cq 快照(FootballCqRelay 推送)按 label 精确匹配, 新结构 hs/as 计分 */
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
function cqScoreLabel(label, lottery) {
  for (const r of cqSnap()) {
    if (r.label !== label || !r.played) continue;
    if (lottery && r.lottery !== lottery) continue;
    if (typeof r.score === "string" && r.score) return r.score.replace(/ /g, "");
    if (r.hs != null && r.as != null) return r.hs + "-" + r.as;
  }
  return null;
}

const days = require(file);
const d = days.find((x) => x.date === "2026-10-11");
if (!d) { console.log("无 2026-10-11 数据"); process.exit(1); }

let touched = 0;
const fills = [];

(d.matches || []).forEach((m) => {
  if (m.finalScore) return;
  const lg = LEAGUES[m.id];
  let got = null, src = "";
  if (lg) {
    const t = TEAM[m.home] || m.home, a = TEAM[m.away] || m.away;
    got = findScore(lg, t, a);
    if (got) src = lg + ":" + got.status;
    if (probe) {
      console.log((got ? "✓ " : "? ") + m.id + " [" + lg + "] " + (got ? got.raw : "(未找到)"));
    }
  } else {
    const c = cqScoreLabel(m.id, "竞彩");
    if (c) { got = { score: c, status: "FULL_TIME" }; src = "cq"; }
    if (probe) console.log("? " + m.id + " [cq] " + (got ? got.score : "(未找到)"));
  }
  if (got && got.status === "FULL_TIME") {
    m.finalScore = got.score;
    touched++;
    fills.push(m.id + " " + got.score + " (" + src + ")");
  }
});

if (probe) process.exit(0);
if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map((x) => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("回填 " + touched + " 条: " + fills.join(" | "));
} else {
  console.log("无新增终场比分(已回填或未开赛)");
}
