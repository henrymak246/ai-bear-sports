/* 10-08(周四) 比分盯梢回填: 18 场(周四001-006 + 周五001-012)。
   通道: **ESPN 主通道**(巴甲 bra.1@20261008 / 周五欧洲十场+日职 @20261009 各联赛板) + **出奇兜底**
         (芬超 fin.1 已死、韩职 kor.1 已死、罗甲 rou.1 空板 → cq 快照 label 匹配)。
   北单非竞彩腿(079 克卢日/082 累西腓航海/083 塞阿拉)经 LEG_SRC 回填 leg.finalScore。
   用法: node tools/_live1008.js          正常回填(有变更才写文件)
         node tools/_live1008.js --probe  只打印原始状态(调试映射)
   ⚠️ 90 分钟口径: 全部为联赛常规轮次, 无加时; ESPN FULL_TIME / 出奇 played=true 即终场。 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

/* 场次 → ESPN 联赛码(null = 无码走出奇) */
const LEAGUES = {
  "周四001": null, "周四002": null,                                    // 芬超 fin.1 已死 → 出奇
  "周四003": "bra.1", "周四004": "bra.1", "周四005": "bra.1", "周四006": "bra.1",
  "周五001": null,                                                     // 韩职 kor.1 已死 → 出奇
  "周五002": "jpn.1",
  "周五003": "ger.2", "周五004": "swe.1", "周五005": "nor.1", "周五006": "ned.1",
  "周五007": "ned.2", "周五008": "ger.1", "周五009": "fra.1", "周五010": "eng.2",
  "周五011": "esp.1", "周五012": "por.1",
};
/* 北单非竞彩腿: match 前缀 → [联赛码 | null=出奇, ESPN 日期] */
const LEG_SRC = {
  "079": [null, "20261008"],  // 罗甲 rou.1 空板 → 出奇
  "082": ["bra.2", "20261008"], "083": ["bra.2", "20261008"],
};
/* 中名(竞彩口径) → ESPN displayName 子串(不区分大小写; 建日时按球探/ESPN 板核过, --probe 可再验) */
const TEAM = {
  "赫尔辛基": "HJK", "瓦萨": "VPS",
  "库奥皮奥": "KuPS", "AC奥卢": "Oulu",
  "桑托斯": "Santos", "弗拉门戈": "Flamengo",
  "巴拉纳竞技": "Athletico", "米内罗竞技": "Atlético-MG",
  "弗鲁米嫩塞": "Fluminense", "科里蒂巴": "Coritiba",
  "帕尔梅拉斯": "Palmeiras", "巴伊亚": "Bahia",
  "仁川联": "Incheon", "浦项制铁": "Pohang",
  "柏太阳神": "Kashiwa", "神户胜利船": "Vissel Kobe",
  "海登海姆": "Heidenheim", "凯泽斯劳滕": "Kaiserslautern",
  "哥德堡": "Göteborg", "韦斯特罗": "Västerås",
  "布兰": "Brann", "维京": "Viking",
  "埃因霍温": "PSV", "海伦芬": "Heerenveen",
  "赫拉克勒斯": "Heracles", "瓦尔韦克": "Waalwijk",
  "多特蒙德": "Dortmund", "不来梅": "Werder",
  "朗斯": "Lens", "里昂": "Lyon",
  "西汉姆联": "West Ham", "女王巡游者": "Queens Park",
  "马拉加": "Málaga", "西班牙人": "Espanyol",
  "布拉加": "Braga", "里斯本竞技": "Sporting",
  "克卢日": "CFR Cluj", "克卢日大学": "Cluj",
  "累西腓航海": "Náutico", "新奥里藏蒂诺": "Novorizontino",
  "塞阿拉": "Ceará", "克里西乌马": "Criciúma",
};
const DATES = ["20261008", "20261009"];

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
function findScoreExact(lg, homeSub, awaySub, dt) {
  for (const line of board(lg, dt).split("\n")) {
    const m = line.match(/^\s*(.+?)\s+(\d+)-(\d+)\s+(.+?)\s+\[(\w+)\]/);
    if (!m) continue;
    const [, h, hs, as, a, st] = m;
    if (h.toLowerCase().includes(homeSub.toLowerCase()) && a.toLowerCase().includes(awaySub.toLowerCase())) {
      return { score: hs + "-" + as, status: st, raw: line.trim() };
    }
  }
  return null;
}

/* 出奇兜底: 本机 cq 快照(FootballCqRelay 推送) 或服务器已推快照, 按队名 label 匹配 */
function cqSnap() {
  for (const dir of [path.join(__dirname, ".."), __dirname]) {
    try {
      const fs1 = fs.readdirSync(dir).filter((f) => /^cq_\d{4}\.json$/.test(f)).sort();
      if (fs1.length) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, fs1[fs1.length - 1]), "utf8"));
        return j.rows || j.data || [];
      }
    } catch (e) { /* 下一处 */ }
  }
  return [];
}
function cqScore(home, away) {
  for (const r of cqSnap()) {
    const h = String(r.home || ""), a = String(r.away || "");
    if (h.includes(home) && a.includes(away) && r.played) return String(r.score || "").replace(" ", "");
  }
  return null;
}

const days = require(file);
const d = days.find((x) => x.date === "2026-10-08");
if (!d) { console.log("无 2026-10-08 数据"); process.exit(1); }

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
    const c = cqScore(m.home, m.away);
    if (c) { got = { score: c, status: "FT(cq)" }; src = "cq"; }
    if (probe) console.log("? " + m.id + " [cq] " + (got ? got.score : "(未找到)"));
  }
  if (got && (got.status === "FULL_TIME" || got.status === "FT" || String(got.status).includes("FT"))) {
    m.finalScore = got.score;
    touched++;
    fills.push(m.id + " " + got.score + " (" + src + ")");
  }
});

/* 北单非竞彩腿回填 */
if (d.beidan310 && Array.isArray(d.beidan310.legs)) {
  d.beidan310.legs.forEach((l) => {
    if (l.finalScore) return;
    const num = String(l.match || "").slice(0, 3);
    const src = LEG_SRC[num];
    if (!src) return;
    const home = String(l.match || "").slice(4).split(" vs ")[0];
    const away = String(l.match || "").split(" vs ")[1] || "";
    let got = null, from = "";
    if (src[0]) {
      got = findScoreExact(src[0], TEAM[home] || home, TEAM[away] || away, src[1]);
      if (got) from = src[0];
    } else {
      const c = cqScore(home, away);
      if (c) { got = { score: c, status: "FT(cq)" }; from = "cq"; }
    }
    if (probe) console.log("? 北单" + num + " [" + (src[0] || "cq") + "] " + (got ? got.raw || got.score : "(未找到)"));
    if (got && (got.status === "FULL_TIME" || got.status === "FT" || String(got.status).includes("FT"))) {
      l.finalScore = got.score;
      touched++;
      fills.push("北单" + num + " " + got.score + " (" + from + ")");
    }
  });
}

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
