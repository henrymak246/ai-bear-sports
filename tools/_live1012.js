/* 10-12(周一建日) 比分盯梢回填: 18 场(周一001-010 @10-13 凌晨 + 周二004-011 欧冠 @10-14 凌晨)。
   通道: **ESPN 主通道**(各联赛板 @20261012/20261013 UTC) + **出奇兜底**(cq 快照 label 精确匹配)。
   用法: node tools/_live1012.js          正常回填(有变更才写文件)
         node tools/_live1012.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 全部为联赛常规轮次, 无加时; ESPN FULL_TIME / 出奇 played=true 即终场。
   映射已验证(10-12 建日板面逐场核对): 001 亚冠=afc.champions(Al Wasl/Al Ahli) / 007 英超=eng.1(考文垂)
       008 西甲=esp.1(莱万特) / 010 葡超=por.1(FC Famalicao) / 欧冠=uefa.champions@20261013。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周一001": "afc.champions", "周一002": "ita.1", "周一003": "swe.1", "周一004": "nor.1",
  "周一005": "ita.1", "周一006": "fra.2", "周一007": "eng.1", "周一008": "esp.1",
  "周一009": "bra.1", "周一010": "por.1",
  "周二004": "uefa.champions", "周二005": "uefa.champions", "周二006": "uefa.champions",
  "周二007": "uefa.champions", "周二008": "uefa.champions", "周二009": "uefa.champions",
  "周二010": "uefa.champions", "周二011": "uefa.champions",
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; --probe 可再验) */
const TEAM = {
  "迪拜连接": "Wasl", "吉达国民": "Ahli",
  "亚特兰大": "Atalanta", "威尼斯": "Venezia",
  "马尔默": "Malm", "卡尔马": "Kalmar",
  "奥斯KFUM": "KFUM", "瓦勒伦加": "lerenga",
  "都灵": "Torino", "乌迪内斯": "Udinese",
  "第戎": "Dijon", "梅斯": "Metz",
  "考文垂": "Coventry", "纽卡斯尔": "Newcastle",
  "莱万特": "Levante", "塞维利亚": "Sevilla",
  "科里蒂巴": "Coritiba", "博塔弗戈": "Botafogo",
  "法马利康": "Famalicao", "阿尔维卡": "Alverca",
  "朗斯": "Lens", "里斯本": "Sporting",
  "国际米兰": "Internazionale", "布鲁日": "Brugge",
  "阿森纳": "Arsenal", "里尔": "Lille",
  "比利亚雷": "Villarreal", "那不勒斯": "Napoli",
  "维京": "Viking", "拜仁": "Bayern",
  "莱红牛": "Leipzig", "埃因霍温": "PSV",
  "加拉塔萨": "Galatasaray", "巴萨": "Barcelona",
  "马竞": "tico Madrid", "曼联": "Manchester United",
};
const DATES = ["20261012", "20261013"];

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
const d = days.find((x) => x.date === "2026-10-12");
if (!d) { console.log("无 2026-10-12 数据"); process.exit(1); }

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
