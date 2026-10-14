/* 10-14 临场扩容(续): 新增周三014 美职(圣路易城vs温哥华, 10-15 08:30) + 计数/文案同步。
   幂等性: 周三014 已存在则跳过新增; 文案替换 count==1 才写。 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-13");
if (!d) { console.log("无 2026-10-13"); process.exit(1); }

let changed = 0;
function rep(s, oldStr, newStr, label) {
  const c = s.split(oldStr).length - 1;
  if (c !== 1) { console.log("!! replace count=" + c + " : " + label); process.exit(1); }
  changed++;
  return s.replace(oldStr, newStr);
}

/* ---------- 1. 新增周三014(插到周三013 之后) ---------- */
if (!d.matches.find(m => m.id === "周三014")) {
  d.matches.push({
    id: "周三014",
    league: "美职",
    time: "08:30",
    home: "圣路易城",
    away: "温哥华",
    direction: "主胜",
    dirTag: "双选",
    synthesis: "主胜·双选——西区天王山(温哥华 51 分第一 vs 圣城 50 分第二, 圣城赢球即登顶): 圣城 20 场不败追平 MLS 纪录+主场 6-2 屠银河 vs 温哥华 3 场不胜+穆勒赛季报销+Blackmon 停赛 ⇒ 主不败; 天王山+交锋总战绩温哥华占优+thethirdsub 独挺其客场拿分防平",
    overUnder: "",
    ttgSp: "3.70",
    score: ["2-1", "1-1"],
    scoreSp: [8, 8],
    confidence: 2,
    note: "美职(MLS)西区天王山(10-15 08:30 北京; ⚠️本场系 10-14 临场扩容新增, 不进当日投注块, 观赛+方向口径)。**竞彩侧**: 主 2.04/平 3.68/客 2.72; 让-1 为 3.90/4.10/1.59。**北单侧(069)**: 让0 合格(2.27/3.74/2.70), 但不并入已发布当日块(保持 4 腿 32 元原方案)。**基本面**: ①温哥华 51 分领跑 vs 圣城 50 分第二, **圣城赢球即登顶**; ②圣城 **20 场不败**(追平 MLS 历史纪录, 含 6-2 屠洛城银河), 夏窗新援 Holse(11 场 6 球)与 Navarro(5 首发 7 球 3 助)点燃火力; ③温哥华近 3 场不胜(1-3 负芝加哥/1-1 平 LAFC 且几乎全程 10 人), **穆勒赛季报销(9 球 8 助)+Blackmon 停赛**; ④交锋: 9-5 圣城客场 3-1 胜, 但总战绩 2 胜 1 平 4 负温哥华占优。**外部**: TMLS 模型 2-1 圣城+大 2.5/BTTS / Whoscored 2-0 / Kalshi 圣城 43% / thethirdsub 独挺温哥华客场拿分。**结论**: 主不败双选(3/1)★2, 比分档 2-1/1-1; 20 场不败+主场是主胜依据, 天王山+交锋历史+独挺观点是防平依据。",
    sp: [2.04, 3.68, 2.72],
    spHandicap: -1,
    hhad: [3.9, 4.1, 1.59],
    ah: null, ouOdds: null, ahPick: null, ahConf: null, ouPick: "", ouConf: null,
    finalScore: null
  });
  console.log("周三014 已新增");
  changed++;
}

/* ---------- 2. dayNote ---------- */
d.dayNote = rep(d.dayNote,
  "★**10-13 周二 = 13 场(周二012 英冠 @10-14 03:00 + 周三001-013; 周三001 系 10-14 临场扩容新增)**",
  "★**10-13 周二 = 14 场(周二012 英冠 @10-14 03:00 + 周三001-014; 周三001/014 系 10-14 临场扩容新增)**", "dayNote场数");
d.dayNote = rep(d.dayNote,
  "周三014 美职(圣路易城 vs 温哥华)亦已开售待补建;",
  "周三014 美职(圣路易城 vs 温哥华)已开售并于当日补建;", "dayNote 014");
d.dayNote = rep(d.dayNote,
  "13 场全双选(主 7 不败+客 6 不败)",
  "14 场全双选(主 8 不败+客 6 不败)", "dayNote框架");

/* ---------- 3. plan 文案 ---------- */
for (const p of d.plan) {
  if (p.market === "jc" && p.name.includes("胜平负")) {
    p.text = rep(p.text, "今日方向层 13 场全双选承接。", "今日方向层 14 场全双选承接。", "🎯");
  }
  if (p.market === "jc" && p.name.includes("双选方向")) {
    p.text = rep(p.text, "**全日 13 场全部双选(主 7 场 3/1 + 客 6 场 1/0)**", "**全日 14 场全部双选(主 8 场 3/1 + 客 6 场 1/0)**", "🔵计数");
    p.text = rep(p.text,
      "vs 费内巴切欧冠 8 场不胜); **客胜侧",
      "vs 费内巴切欧冠 8 场不胜)/周三014 圣路易城(20 场不败追平 MLS 纪录 vs 温哥华 3 场不胜+穆勒报销+Blackmon 停赛, 天王山防平); **客胜侧", "🔵主胜侧");
  }
  if (p.market === "bd" && p.name.includes("北单310")) {
    p.text = rep(p.text,
      "今日 13 场中 8 场带北单号(027/030/032/038/039/052/053/054)",
      "今日 14 场中 9 场带北单号(027/030/032/038/039/052/053/054/069)", "🀄计数");
    p.text = rep(p.text,
      "(合格 5 场: 027/032/038/053/054; 027 墨胜利 15:45 开球在即已近停售不进块; 030 神户让-1/039 林茨场让+2/052 维拉让-1 剔除)",
      "(合格 6 场: 027/032/038/053/054/069; 027 墨胜利 15:45 开球在即已近停售不进块, 069 圣路易斯城系扩容新增不并入已发布块; 030 神户让-1/039 林茨场让+2/052 维拉让-1 剔除)", "🀄合格");
  }
  if (p.market === "jc" && p.name.includes("综合过关")) {
    p.text = rep(p.text, "今日天同忌+六壬比和+13 场全双选(防平场远超阈值)", "今日天同忌+六壬比和+14 场全双选(防平场远超阈值)", "💥");
  }
}

let json = JSON.stringify(days, null, 2);
json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
json = json.replace(/\n\]$/, "];");
const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
console.log("10-14 美职扩容完成, changed=" + changed + ", matches=" + d.matches.length);
