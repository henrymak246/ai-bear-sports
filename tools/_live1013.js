/* 10-13(周二建日) 比分盯梢回填: 13 场(周二012 英冠 @10-14 03:00 + 周三002-013 @10-14 18:00~10-15 08:30)。
   通道: **ESPN 主通道**(各联赛板 @20261013/14/15 UTC) + **出奇兜底**(周三004 日联赛杯无 ESPN 码, cq 快照 label 精确匹配)。
   用法: node tools/_live1013.js          正常回填(有变更才写文件)
         node tools/_live1013.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 欧冠/英冠/解放者杯联赛阶段常规轮次无加时; 日联赛杯为半决赛(若加时以 90 分钟比分终判, ESPN 无码走出奇)。
   映射已验证(10-13 建日板面逐场核对): 周二012=eng.2(Middlesbrough at Stoke City) / 周三002/003=afc.champions
       (Jeonbuk at Vissel Kobe; Port FC at Kashiwa Reysol——曼谷港务 ESPN 名=Port FC) / 欧冠=uefa.champions@20261014
       (Bodo/Glimt 无变音符) / 周三013=conmebol.libertadores(Palmeiras at Fluminense @20261015T00:30Z)。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周二012": "eng.2",
  "周三002": "afc.champions", "周三003": "afc.champions", "周三004": null,
  "周三005": "uefa.champions", "周三006": "uefa.champions", "周三008": "uefa.champions",
  "周三009": "uefa.champions", "周三010": "uefa.champions", "周三011": "uefa.champions",
  "周三012": "uefa.champions", "周三013": "conmebol.libertadores",
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; --probe 可再验) */
const TEAM = {
  "斯托克城": "Stoke", "米堡": "Middlesbrough",
  "神户胜利": "Kobe", "全北现代": "Jeonbuk",
  "柏太阳神": "Reysol", "曼谷港务": "Port FC",
  "横滨水手": "Marinos", "清水鼓动": "S-Pulse",
  "费耶诺德": "Feyenoord", "科莫": "Como",
  "LASK林茨": "LASK", "利物浦": "Liverpool",
  "罗马": "Roma", "皇马": "Real Madrid",
  "博德闪耀": "Glimt", "多特蒙德": "Dortmund",
  "贝蒂斯": "Betis", "波尔图": "Porto",
  "曼城": "Manchester City", "巴黎圣曼": "Paris Saint-Germain",
  "维拉": "Aston Villa", "费内巴切": "Fenerbahce",
  "弗鲁米嫩": "Fluminense", "帕梅拉斯": "Palmeiras",
};
const DATES = ["20261013", "20261014", "20261015"];

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
  /* 同 label 可能有多期残留(如周三004 上周已赛场 vs 本周待赛场):
     ① 过滤 period >= minPeriod(建日日期, 防上周同号场次误回填); ② 只认最新一期, 未开赛即返回 null */
  const rows = cqSnap()
    .filter((r) => r.label === label && (!lottery || r.lottery === lottery) && (minPeriod == null || (r.period || 0) >= minPeriod))
    .sort((a, b) => (b.period || 0) - (a.period || 0) || String(b.time || "").localeCompare(String(a.time || "")));
  const r = rows[0];
  if (!r || !r.played) return null;
  if (typeof r.score === "string" && r.score) return r.score.replace(/ /g, "");
  if (r.hs != null && r.as != null) return r.hs + "-" + r.as;
  return null;
}

const days = require(file);
const d = days.find((x) => x.date === "2026-10-13");
if (!d) { console.log("无 2026-10-13 数据"); process.exit(1); }

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
    const c = cqScoreLabel(m.id, "竞彩", parseInt(d.date.replace(/-/g, ""), 10));
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
