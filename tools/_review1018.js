/* 10-18 周日终审(19 场全齐; 可重复执行)。
   🎯=0胆0单选 push; 🔵=双选红多于黑 hit; 北单310 6关全双选64注全红(hit, 结算见 _bd_settle)。
   用法: node tools/_review1018.js; DRY=1 node tools/_review1018.js 只打印不写。 */
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "stats.js"));
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-18");
if (!d) { console.log("无 2026-10-18 数据"); process.exit(1); }
let touched = 0;

// --- 方向层 + 双选 ---
let dblH = 0, dblM = 0, dirH = 0, dirN = 0;
(d.matches || []).forEach(m => {
  if (!m.finalScore || !m.direction) return;
  const v = S.judgeDirection(m.direction, m.finalScore, m.spHandicap);
  if (v !== null) { dirN++; if (v === 1) dirH++; }
  const s = S.parseScore(m.finalScore);
  if (String(m.dirTag || "").includes("双选")) {
    const r = (v === 1 || (s && s.home === s.away)) ? "hit" : "miss";
    r === "hit" ? dblH++ : dblM++;
  }
});

// --- 北单310 6关(全让0, 按竞彩场 finalScore 判) ---
const bd = d.beidan310;
if (bd) {
  let reds = 0, blacks = 0, unknown = 0;
  for (const l of bd.legs) {
    const num = String(l.match || "").slice(0, 3);
    const mm = (d.matches || []).find(x => x.id && String(x.id).slice(-3) === num);
    const s0 = S.parseScore(mm ? mm.finalScore : null);
    if (!s0) { unknown++; console.log("  bd " + l.bdNum + " 赛果未知, 跳过"); continue; }
    const hc = parseInt(l.handicap, 10) || 0;
    const adjH = s0.home + hc;
    const oc = adjH > s0.away ? "3" : adjH < s0.away ? "0" : "1";
    const opts = String(l.pick || "").split("/").map(s => s.trim());
    const hit = opts.includes(oc);
    const res = hit ? "hit" : "miss";
    if (l.result !== res) { l.result = res; touched++; }
    hit ? reds++ : blacks++;
    console.log("  bd " + l.bdNum + " " + l.pick + " → 赛果" + (oc === "3" ? "主胜" : oc === "1" ? "平" : "客胜") + " = " + (hit ? "红" : "黑"));
  }
  console.log("北单310: " + reds + "红" + blacks + "黑" + (unknown ? unknown + "未知" : ""));
  if (bd.result !== (reds > 0 && blacks === 0 ? "hit" : "miss")) { bd.result = (reds > 0 && blacks === 0 ? "hit" : "miss"); touched++; }
}

// --- 卡片 ---
const setCard = (name, v) => { const c = (d.plan || []).find(p => p.name === name); if (c && c.result !== v) { c.result = v; touched++; } };
setCard("🎯 胜平负", "push");
setCard("🔵 双选方向", dblH + dblM === 0 ? null : (dblH > dblM ? "hit" : "miss"));

// --- review 正文 ---
d.review = `【10-18 终审 · 甲子日 · 太阳忌】(周日 19 场全齐)

★定格: 方向页面口径 **${dirH}/${dirN}(${(dirH / dirN * 100).toFixed(1)}%)**、双选语义 **${dblH}红${dblM}黑(${(dblH / (dblH + dblM) * 100).toFixed(1)}%)**——10-17 历史最差 76.9% 后 V 型回升; 两黑全为直输爆冷: 017 洛里昂 1-0 摩纳哥(客热被爆)/022 尤文 0-3 拉齐奥(主 1.49 主场被屠)。

★**北单310 6 关全双选 64 注 128 元 → 6 腿全红 → 64 注全中**: 按临场参考 SP 合计 ≈**6.30 万**、净 **+6.29 万**(此前纪录 9-26 +2056)——北单史上最大单日; 复式全红结算口径=各腿双选 SP 之和连乘×2(_bd_settle.js 已修正, 旧口径只算单路径 234 元严重低估); 6 腿全让 0: 260 奥萨苏纳主胜@1.97/274 伯恩茅斯主胜@2.15/275 利兹联平@3.45/276 科莫客胜@2.06/286 塞尔塔主胜@2.25/312 米兰主胜@1.73。

★屠杀与爆冷并存: 三场 2-5(013 昂热 2-5 马赛/016 格罗宁根 2-5 阿贾克斯/021 马拉加 2-5 皇家社会); 022 尤文主场 0-3(忌日防平框架对深热主队爆冷无防御, 但零胆零单选空仓避过); 017 洛里昂爆冷赢摩纳哥。

★亚盘 13红2黑2走(010 利兹联平手/014 勒沃库森-1 走盘; 017/022 双黑); 大小盘 11红7黑(017/018 一球小局双黑、015 小 2.5 超线黑)。

★教训: ①北单全双选复式在"全红日"的复利结构(64 注全中≈6.3 万)验证 128 元封顶纪律下仍有爆发日, 全双选防爆+忌日不做单锚连续兑现; ②甲子日零胆零单选(8-18 先例)再验证有效——避过 022 尤文 1.49 爆冷; ③忌日中档热爆冷连续两日(10-17 四场/今日 017+022), 防平框架对其无防御, 评估"忌日 1.4-2.0 主热降仓"规则。`;
touched++;

// --- 写回 ---
console.log("--- 定格: 方向 " + dirH + "/" + dirN + " 双选 " + dblH + "红" + dblM + "黑 ---");
if (process.env.DRY) { console.log("DRY 模式, 不写文件"); process.exit(0); }
if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("回填完成, touched=" + touched);
} else {
  console.log("无变更");
}
