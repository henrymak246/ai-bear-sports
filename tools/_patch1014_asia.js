/* 10-14 临场扩容: 新增周三001 亚冠乙(墨胜利vs首尔FC 15:45, 临近封盘观赛口径) + 周三002/003/004 临场赔率刷新。
   幂等性: 周三001 已存在则跳过新增; 赔率刷新按当前值覆盖, 可重跑。 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-13");
if (!d) { console.log("无 2026-10-13"); process.exit(1); }

const NOW = "10-14 15:2x";
let changed = 0;

function rep(s, oldStr, newStr, label) {
  const c = s.split(oldStr).length - 1;
  if (c !== 1) { console.log("!! replace count=" + c + " : " + label); process.exit(1); }
  changed++;
  return s.replace(oldStr, newStr);
}

/* ---------- 1. 新增周三001(插到周二012 之后) ---------- */
const i = d.matches.findIndex(m => m.id === "周二012");
if (i < 0) { console.log("!! 找不到周二012"); process.exit(1); }
if (!d.matches.find(m => m.id === "周三001")) {
  d.matches.splice(i + 1, 0, {
    id: "周三001",
    league: "亚冠乙",
    time: "15:45",
    home: "墨胜利",
    away: "首尔FC",
    direction: "主胜",
    dirTag: "双选",
    synthesis: "主胜·双选——首尔FC 主帅金基东确认大轮换(周末胜济州主力全留守+14 球射手 Klimala 未随队, 20 人残阵长途远征) vs 墨胜利主场 ACL Two 首秀+SP 1.55; 但墨胜利澳杯决赛 120 分钟点球刚丢冠+HKJC 独吼「和」 ⇒ 主不败防平(临近封盘·观赛口径)",
    overUnder: "",
    ttgSp: "3.50",
    score: ["2-1", "2-0"],
    scoreSp: [6.75, 9.75],
    confidence: 2,
    note: "亚冠乙(ACL Two)E 组第 2 轮(10-14 15:45 北京; ⚠️本场系 10-14 临场扩容新增, 发布时距开球不足 40 分钟=临近封盘, 观赛分析口径, 不进任何投注块)。**竞彩侧**: 主 1.55/平 4.06/客 4.20; 让-1 为 2.55/3.55/2.20。**北单侧(027)**: 让0(1.73/3.76/6.83)虽合 9-23 护栏, 但开球在即已近停售, 不进当日北单块。**基本面**: ①首尔FC 主帅金基东宣布**大轮换**(周末 2-1 胜济州联的主力全部留韩, 仅 20 人残阵+多名年轻/半职业球员远征澳大利亚, 14 球射手 Klimala 未随队)——K1 领跑 18 分冲冠藏实力, 亚冠首轮主场 0-1 负万隆(Persib); ②墨胜利首轮客场 1-1 平越电信(Viettel), 但**刚在澳杯决赛 0-0(120 分钟)点球负南墨尔本丢冠**=体能+士气双承压; 中卫 Ziereis 脑震荡恢复可出战, D'Arrigo 伤缺; ③历史交锋 2020 亚冠正赛 1-1。**外部**: 彩经前瞻「客队轮换远征, 看好主队取胜」/163 专栏「首尔轮换冲冠藏玄机, 墨尔本主场遇送分童子」/HKJC 专家独吼「和」(双方锋无力)。**结论**: 主不败双选(3/1)★2, 比分档 2-1/2-0; 大轮换+长途远征是主胜核心依据, 丢冠疲劳+残阵摆大巴是防平依据。",
    sp: [1.55, 4.06, 4.2],
    spHandicap: -1,
    hhad: [2.55, 3.55, 2.2],
    ah: null, ouOdds: null, ahPick: null, ahConf: null, ouPick: "", ouConf: null,
    finalScore: null
  });
  console.log("周三001 已新增");
  changed++;
}

/* ---------- 2. 周三002/003/004 临场刷新 ---------- */
const upd = {
  "周三002": { sp: [1.44, 4, 5.4], hhad: [2.62, 3.1, 2.35], ttgSp: "3.50", scoreSp: [7.25, 7],
    noteAdd: " **【临场更新 " + NOW + "】**: 主胜 1.49→1.44 资金压主, 方向不变。" },
  "周三003": { sp: [1.06, 7.9, 17], hhad: [1.82, 4.1, 2.98], ttgSp: "4.20", scoreSp: [9.5, 7],
    noteAdd: " **【临场更新 " + NOW + "】**: 深热加剧(主胜 1.13→1.06, 让-2 主胜 2.48→1.82), 追深热风险同步放大, 双选防平不变。" },
  "周三004": { sp: [1.83, 3.3, 3.6], hhad: [3.75, 3.45, 1.75], ttgSp: "3.50", scoreSp: [7.5, 7.25],
    noteAdd: " **【临场更新 " + NOW + "】**: 主胜 2.07→1.83 显著降水(资金压主), 方向不变。" }
};
for (const [id, u] of Object.entries(upd)) {
  const m = d.matches.find(x => x.id === id);
  if (!m) { console.log("!! 找不到 " + id); process.exit(1); }
  m.sp = u.sp; m.hhad = u.hhad; m.ttgSp = u.ttgSp; m.scoreSp = u.scoreSp;
  if (!m.note.includes("【临场更新")) m.note += u.noteAdd;
  console.log(id + " 已刷新");
  changed++;
}

/* ---------- 3. dayNote ---------- */
d.dayNote = rep(d.dayNote,
  "★**10-13 周二 = 12 场(周二012 英冠 @10-14 03:00 + 周三002-013)**",
  "★**10-13 周二 = 13 场(周二012 英冠 @10-14 03:00 + 周三001-013; 周三001 系 10-14 临场扩容新增)**", "dayNote场数");
d.dayNote = rep(d.dayNote,
  "周二001-003 竞彩未开售不列;",
  "周二001-003 竞彩未开售不列; 周三014 美职(圣路易城 vs 温哥华)亦已开售待补建;", "dayNote 014");
d.dayNote = rep(d.dayNote,
  "12 场全双选(主 6 不败+客 6 不败)",
  "13 场全双选(主 7 不败+客 6 不败)", "dayNote框架");

/* ---------- 4. plan 文案 ---------- */
for (const p of d.plan) {
  if (p.market === "jc" && p.name.includes("胜平负")) {
    p.text = rep(p.text, "今日方向层 12 场全双选承接。", "今日方向层 13 场全双选承接。", "🎯");
  }
  if (p.market === "jc" && p.name.includes("双选方向")) {
    p.text = rep(p.text, "**全日 12 场全部双选(主 6 场 3/1 + 客 6 场 1/0)**", "**全日 13 场全部双选(主 7 场 3/1 + 客 6 场 1/0)**", "🔵计数");
    p.text = rep(p.text, "**主胜侧 6 场**: 周三002 神户(", "**主胜侧 7 场**: 周三001 墨胜利(首尔大轮换残阵远征+SP 1.55, 澳杯 120 分钟丢冠防平)/002 神户(", "🔵主胜侧");
  }
  if (p.market === "bd" && p.name.includes("北单310")) {
    p.text = rep(p.text,
      "今日 12 场中 7 场带北单号(030/032/038/039/052/053/054)",
      "今日 13 场中 8 场带北单号(027/030/032/038/039/052/053/054)", "🀄计数");
    p.text = rep(p.text,
      "(合格 4 场: 032/038/053/054; 030 神户让-1/039 林茨场让+2/052 维拉让-1 剔除)",
      "(合格 5 场: 027/032/038/053/054; 027 墨胜利 15:45 开球在即已近停售不进块; 030 神户让-1/039 林茨场让+2/052 维拉让-1 剔除)", "🀄合格");
  }
  if (p.market === "jc" && p.name.includes("综合过关")) {
    p.text = rep(p.text, "今日天同忌+六壬比和+12 场全双选(防平场远超阈值)", "今日天同忌+六壬比和+13 场全双选(防平场远超阈值)", "💥");
  }
}

let json = JSON.stringify(days, null, 2);
json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
json = json.replace(/\n\]$/, "];");
const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
console.log("10-14 亚洲场临场更新完成, changed=" + changed + ", matches=" + d.matches.length);
