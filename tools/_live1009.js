/* 10-09(周五建日) 比分盯梢回填: 24 场(周六001-029, 10-10 开球)。
   通道: **ESPN 主通道**(欧洲十联赛 @20261010 各联赛板 + 日职 jpn.1) + **出奇兜底**(韩职 kor.1 已死 → cq 快照 label 匹配)。
   用法: node tools/_live1009.js          正常回填(有变更才写文件)
         node tools/_live1009.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 全部为联赛常规轮次, 无加时; ESPN FULL_TIME / 出奇 played=true 即终场。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周六001": "jpn.1",
  "周六002": null, "周六003": null,                                   // 韩职 kor.1 已死 → 出奇
  "周六004": "jpn.1",
  "周六005": "eng.1", "周六006": "esp.1", "周六007": "ita.1",
  "周六008": "ger.1", "周六010": "ger.1", "周六011": "ger.1", "周六012": "ger.1",
  "周六013": "eng.1", "周六014": "eng.1", "周六015": "eng.1", "周六016": "esp.1", "周六017": "fra.1",
  "周六020": "eng.1", "周六021": "ger.1", "周六023": "ned.1", "周六024": "por.1",
  "周六026": "ned.1", "周六027": "ita.1", "周六028": "fra.1", "周六029": "esp.1",
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; --probe 可再验) */
const TEAM = {
  "大阪樱花": "Cerezo", "横滨水手": "Marinos",
  "首尔FC": "Seoul", "济州SK": "Jeju",
  "金泉尚武": "Gimcheon", "安养FC": "Anyang",
  "京都": "Kyoto", "町田泽维": "Machida",
  "阿森纳": "Arsenal", "利兹联": "Leeds",
  "巴列卡诺": "Vallecano", "毕尔巴鄂": "Athletic",
  "热那亚": "Genoa", "佛罗伦萨": "Fiorentina",
  "柏林联合": "Union Berlin", "埃沃斯堡": "Elversberg",
  "美因茨": "Mainz", "勒沃库森": "Leverkusen",
  "帕德博恩": "Paderborn", "斯图加特": "Stuttgart",
  "霍芬海姆": "Hoffenheim", "汉堡": "Hamburg",
  "伊普斯": "Ipswich", "富勒姆": "Fulham",
  "切尔西": "Chelsea", "伯恩茅斯": "Bournemouth",
  "维拉": "Aston Villa", "布伦特": "Brentford",
  "阿拉维斯": "Alav", "马竞": "Atlético Madrid",
  "里尔": "Lille", "勒阿弗尔": "Havre",
  "曼联": "Manchester United", "热刺": "Tottenham",
  "莱红牛": "Leipzig", "法兰克福": "Frankfurt",
  "费耶诺德": "Feyenoord", "阿尔克马": "Alkmaar",
  "马里迪莫": "aritimo", "波尔图": "Porto",
  "福图纳": "Fortuna", "特温特": "Twente",
  "那不勒斯": "Napoli", "弗洛西诺": "Frosinone",
  "摩纳哥": "Monaco", "图卢兹": "Toulouse",
  "皇马": "Real Madrid", "比利亚雷": "Villarreal",
};
const DATES = ["20261010", "20261011"];

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
const d = days.find((x) => x.date === "2026-10-09");
if (!d) { console.log("无 2026-10-09 数据"); process.exit(1); }

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
