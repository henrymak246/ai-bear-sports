/* 10-21(周三) 深夜快车窗口比分盯梢: 周二001-008 全凌晨(00:45~03:00 开球)。
   通道: ESPN 主通道(欧冠 7 场 uefa.champions + 英冠 eng.2) + 出奇兜底(全 8 场有北单号)。
   用法: node tools/_live1021.js          正常回填(有变更才写文件)
         node tools/_live1021.js --probe  只打印原始状态(调试映射) */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

const LEAGUES = {
  "周二001": "uefa.champions", "周二002": "uefa.champions", "周二003": "eng.2",
  "周二004": "uefa.champions", "周二006": "uefa.champions", "周二007": "uefa.champions",
  "周二009": "uefa.champions", "周二010": "uefa.champions",
  // 10-21 深夜快车英系扩池(北单 5-27/35, 02:45~03:00): ESPN 板面 @20261020(北京凌晨=英国当地 10-20 晚)
  "北单5": "eng.3", "北单6": "eng.3", "北单7": "eng.3", "北单8": "eng.3", "北单9": "eng.3",
  "北单10": "eng.3", "北单11": "eng.3", "北单12": "eng.3", "北单13": "eng.3", "北单14": "eng.3", "北单15": "eng.3",
  "北单16": "eng.4", "北单17": "eng.4", "北单18": "eng.4", "北单19": "eng.4", "北单20": "eng.4", "北单21": "eng.4",
  "北单22": "eng.4", "北单23": "eng.4", "北单24": "eng.4", "北单25": "eng.4", "北单26": "eng.4", "北单35": "eng.4",
  "北单27": "sco.2",
};
const TEAM = {
  "费内巴切": "Fenerbahce", "斯拉维亚": "Slavia Prague",
  "萨巴赫": "Sabah", "多特蒙德": "Dortmund",
  "伍尔弗": "Wolverhampton", "朴次茅斯": "Portsmouth",
  "那不勒斯": "Napoli", "博德闪耀": "Bodo",
  "巴黎圣曼": "Paris Saint-Germain", "巴萨": "Barcelona",
  "利物浦": "Liverpool", "比利亚雷": "Villarreal",
  "斯图加特": "Stuttgart", "马竞": "Atlético Madrid",
  "波尔图": "Porto", "埃因霍温": "PSV Eindhoven",
  // 英甲
  "AFC温布尔登": "AFC Wimbledon", "曼斯菲尔德": "Mansfield Town", "布莱克浦": "Blackpool",
  "米尔顿凯恩斯": "Milton Keynes Dons", "布罗姆利": "Bromley", "莱斯特城": "Leicester City",
  "伯顿": "Burton Albion", "布拉德福德": "Bradford City", "剑桥联": "Cambridge United",
  "韦康比流浪者": "Wycombe Wanderers", "唐卡斯特": "Doncaster Rovers", "斯托克港": "Stockport County",
  "哈德斯菲尔德": "Huddersfield Town", "彼得堡联": "Peterborough United", "卢顿": "Luton Town",
  "巴恩斯利": "Barnsley", "诺茨郡": "Notts County", "谢周三": "Sheffield Wednesday",
  "牛津联": "Oxford United", "维冈竞技": "Wigan Athletic", "斯蒂夫尼奇": "Stevenage", "普利茅斯": "Plymouth Argyle",
  // 英乙
  "巴尼特": "Barnet", "斯文登": "Swindon Town", "布里斯托流浪": "Bristol Rovers", "索尔福德市": "Salford City",
  "切尔滕汉姆": "Cheltenham Town", "弗利特伍德": "Fleetwood Town", "切斯特菲尔德": "Chesterfield",
  "科尔切斯特联": "Colchester United", "克劳利": "Crawley Town", "什鲁斯伯里": "Shrewsbury Town",
  "埃克塞特城": "Exeter City", "克鲁": "Crewe Alexandra", "北安普顿": "Northampton Town",
  "特兰米尔流浪": "Tranmere Rovers", "罗奇代尔": "Rochdale", "格林斯比": "Grimsby Town",
  "罗瑟汉姆": "Rotherham United", "纽波特郡": "Newport County", "沃尔索尔": "Walsall",
  "奥尔德姆": "Oldham Athletic", "约克城": "York City", "阿克灵顿": "Accrington Stanley",
  "吉林汉姆": "Gillingham", "维尔港": "Port Vale",
  // 苏冠
  "邓弗姆林": "Dunfermline Athletic", "帕尔蒂克": "Partick Thistle",
};
// 出奇兜底: 竞彩号/北单号 → 北单对阵表 label(北单NNN, 与 bd500 表一致); 北单场为恒等映射
const BDNUM = {
  "周二001": "北单001", "周二002": "北单002", "周二003": "北单004",
  "周二004": "北单033", "周二006": "北单028", "周二007": "北单029",
  "周二009": "北单034", "周二010": "北单032",
  "北单5": "北单5", "北单6": "北单6", "北单7": "北单7", "北单8": "北单8", "北单9": "北单9",
  "北单10": "北单10", "北单11": "北单11", "北单12": "北单12", "北单13": "北单13", "北单14": "北单14", "北单15": "北单15",
  "北单16": "北单16", "北单17": "北单17", "北单18": "北单18", "北单19": "北单19", "北单20": "北单20", "北单21": "北单21",
  "北单22": "北单22", "北单23": "北单23", "北单24": "北单24", "北单25": "北单25", "北单26": "北单26", "北单35": "北单35",
  "北单27": "北单27",
};
const DATES = ["20261020", "20261021"];

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
  const day = days.find((d) => d.date === "2026-10-21");
  if (!day) { console.log("无 2026-10-21 日"); return; }
  let changed = 0;
  for (const mm of day.matches) {
    const lg = LEAGUES[mm.id];
    let hit = null;
    if (lg) hit = findScore(lg, TEAM[mm.home], TEAM[mm.away]);
    if (!hit) {
      const cq = cqScoreLabel(BDNUM[mm.id], "北单", 26105, mm.home, mm.away);
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
