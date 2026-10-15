/* 10-15(周四·丙午年戊戌月壬戌日) 每日构建 —— 24 场(周四 13 场 @10-16 00:45/03:00/08:30 + 周五 11 场 @10-16 17:00~10-17 07:00)。
   ★数据口径: 竞彩官方 SP(had/hhad/crs/ttg 四快照 jc_*_1015.json) + 北单官方池(bd500_1015.json: 让球+欧赔均值);
     ⚠️ 球探亚盘/大小盘通道连续第八日不可达 ⇒ ah/ouOdds/ahPick/ouPick 全空(整层停更, 9-30 同款纪律)。
   ★框架: 壬戌日武曲化忌(领先守不住, 9-5/9-25 同忌)+大海水(防虚热)+身弱杀重+六爻水山蹇九五「大蹇朋来」→谦(险中求稳不追高) = 零胆零单选(连续第十五日)、24 场全双选(主 15/客 9)、SP≤1.20 深热双选+直输风险标注; combo7 停更(10-11 硬规则第三日)。
   用法: node tools/_build1015.js   → 把 2026-10-15 对象插到 data/predictions.js 最前(幂等:已存在则替换) */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);

const { MATCHES } = require("./_d1015/data.js");
const { BLOCKS } = require("./_d1015/blocks.js");
const { TEXT } = require("./_d1015/text.js");
const fivePillars = fs.readFileSync(path.join(__dirname, "_d1015", "five.txt"), "utf8").trim();
const { betAdviceCard } = require("./_bet_advice.js");

/* ---------- 组装 matches ---------- */
const ttgByNum = (() => {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "jc_ttg_1015.json"), "utf8"));
    const m = {};
    j.forEach(x => {
      const vals = Object.entries(x.sp || {}).filter(([k]) => /^s\d$/.test(k)).map(([, v]) => parseFloat(v)).filter(v => Number.isFinite(v));
      if (vals.length) m[x.num] = Math.min(...vals).toFixed(2);
    });
    return m;
  } catch (e) { return {}; }
})();

const matches = MATCHES.map(h => {
  if (!/^(周四|周五)\d{3}$/.test(h.n)) throw new Error("10-15 场次 id 必须为「周四NNN」或「周五NNN」: " + h.n);
  if (!h.dir || !h.tag) throw new Error("缺 dir/tag: " + h.n);
  if (!Array.isArray(h.s) || h.s.length !== 2) throw new Error("缺预测比分: " + h.n);
  return {
    id: h.n,
    league: h.lg,
    time: h.time,
    home: h.home,
    away: h.away,
    direction: h.dir,
    dirTag: h.tag,
    synthesis: h.syn,
    overUnder: "",
    ttgSp: ttgByNum[h.n] || "—",
    score: h.s,
    scoreSp: h.ssp || [null, null],
    confidence: h.conf,
    note: h.note,
    sp: h.sp || null,
    spHandicap: h.hc ?? null,
    hhad: h.hhad || null,
    ah: null,          // 亚盘停更(球探 WAF 不可达)
    ouOdds: null,      // 大小盘停更
    ahPick: null,
    ahConf: null,
    ouPick: "",
    ouConf: null,
    finalScore: null,
  };
});
if (matches.length !== 24) throw new Error("10-15 场次数应为 24, 实际 " + matches.length);
const dupIds = matches.map(m => m.id).filter((v, i, a) => a.indexOf(v) !== i);
if (dupIds.length) throw new Error("id 重复: " + dupIds.join(","));
console.log("✓ matches 组装完成: 24 场(竞彩 SP 口径, 亚盘/大小盘停更)");

/* ---------- 板块 result 补 null ---------- */
const KEYS = ["combo7", "score3", "beidan310", "zucai310"];
KEYS.forEach(k => {
  if (!BLOCKS[k]) return;
  (BLOCKS[k].legs || []).forEach(l => { l.result = null; });
  BLOCKS[k].result = null;
});
BLOCKS.plan.forEach(p => { if (p.result === undefined) p.result = null; });

/* 构建时护栏: 北单腿必须让0(9-23 口径护栏) */
if (BLOCKS.beidan310) {
  BLOCKS.beidan310.legs.forEach(l => {
    if (String(l.handicap) !== "0") throw new Error("北单腿让球数必须为 0(护栏): " + l.match);
    if (!Array.isArray(l.sp3) || l.sp3.length !== 3) throw new Error("北单腿缺 sp3: " + l.match);
  });
  console.log("✓ 北单护栏: " + BLOCKS.beidan310.legs.length + " 腿全部让0");
}
if (BLOCKS.combo7 && BLOCKS.combo7.legs.length > 7) throw new Error("combo7 超过 7 关");
if (BLOCKS.zucai310 && BLOCKS.zucai310.legs.length !== 14) throw new Error("胜负彩应为 14 场: " + BLOCKS.zucai310.legs.length);

/* ---------- 写入(倒序插到最前, 幂等) ---------- */
const day = {
  date: "2026-10-15",
  dayPillar: TEXT.dayPillar,
  dayNote: TEXT.dayNote,
  matches,
  plan: BLOCKS.plan,
  dailyPost: TEXT.dailyPost,
  fivePillars,
  analysis: TEXT.analysis,
  planNote: TEXT.planNote,
  review: "",
  ...(BLOCKS.combo7 ? { combo7: BLOCKS.combo7 } : {}),
  ...(BLOCKS.score3 ? { score3: BLOCKS.score3 } : {}),
  ...(BLOCKS.beidan310 ? { beidan310: BLOCKS.beidan310 } : {}),
  ...(BLOCKS.zucai310 ? { zucai310: BLOCKS.zucai310 } : {}),
};
/* 💰 投注建议策略卡: plan 首位, 先删旧卡幂等 */
day.plan = (day.plan || []).filter(p => p.name !== "💰 投注建议");
day.plan.unshift(betAdviceCard(day, days));
console.log("✓ 💰 投注建议卡已置 plan 首位");

const idx = days.findIndex(x => x.date === "2026-10-15");
if (idx >= 0) { days[idx] = day; console.log("替换已存在的 2026-10-15"); }
else { days.unshift(day); console.log("已插入 2026-10-15"); }

let json = JSON.stringify(days, null, 2);
json = json.split("\n").map(l => l.startsWith("  ") ? l.slice(2) : l).join("\n");
json = json.replace(/\n\]$/, "];");
const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");

console.log("✓ 10-15 写入完成: 24 场 | plan 块: " + day.plan.map(p => p.name).join(" / "));
console.log("  投注块: combo7=" + (day.combo7 ? day.combo7.legs.length + "关" : "停更") + " score3=" + (day.score3 ? day.score3.legs.length + "腿" : "无") + " beidan310=" + (day.beidan310 ? day.beidan310.stakes + "注" + day.beidan310.cost + "元" : "无") + " zucai310=" + (day.zucai310 ? day.zucai310.legs.length + "场" : "无"));
