/* 10-19 深夜快车窗口终审补丁(_review1019.js 的方向层/🔵卡已判, 本脚本补):
   ① 🎯 胜平负 → push(零胆零单选; _review1019 用 '0胆0单选' 匹配, 与中文文案不符未判到)
   ② asian7 7 关混合过关逐腿判定(让球=队名±盘口, 大小球=2.5 线, 平手=0)
   ③ review 正文。
   用法: node tools/_review1019b.js; DRY=1 只打印不写。 */
const fs = require("fs");
const path = require("path");
const S = require(path.join(__dirname, "..", "stats.js"));
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-19");
if (!d) { console.log("无 2026-10-19 数据"); process.exit(1); }
let touched = 0;

const setCard = (name, v) => { const c = (d.plan || []).find(p => p.name === name); if (c && c.result !== v) { c.result = v; touched++; } };
setCard("🎯 胜平负", "push");

// --- asian7 逐腿判定 ---
// 跨日比分源: 周日022/023/025 在 10-18 日, 北单338/339/340/342 在 10-19 日
function findScore(matchStr) {
  for (const dt of ["2026-10-18", "2026-10-19"]) {
    const dd = days.find(x => x.date === dt);
    for (const m of (dd ? dd.matches : [])) {
      if (matchStr.includes(m.home) && matchStr.includes(m.away)) return { fs: m.finalScore, s: S.parseScore(m.finalScore) };
    }
  }
  return null;
}
function judgeLeg(leg) {
  const r = findScore(leg.match);
  if (!r || !r.s) return { res: "unknown", why: "赛果未知" };
  const { s } = r;
  if (leg.play === "大小球") {
    const line = 2.5;
    const tot = s.home + s.away;
    return tot > line ? { res: "hit", why: tot + "球>" + line } : { res: "miss", why: tot + "球<" + line };
  }
  // 让球腿: "队名-0.25"=让平/半, "队名+1"=受让1, "队名平手"=0
  const m = String(leg.pick).match(/^(.*?)(平手|([+-]?\d+(?:\.\d+)?))$/);
  if (!m) return { res: "unknown", why: "pick 无法解析: " + leg.pick };
  const team = m[1];
  const hc = m[2] === "平手" ? 0 : parseFloat(m[3]);
  const [hpart, apart] = String(leg.match).split(" vs ");
  const isHome = hpart.includes(team);
  const sideG = isHome ? s.home : s.away;
  const oppG = isHome ? s.away : s.home;
  const diff = sideG + hc - oppG;
  const res = diff > 0.0001 ? "hit" : Math.abs(diff) <= 0.0001 ? "push" : "miss";
  return { res, why: team + (hc === 0 ? "平手" : (hc > 0 ? "+" + hc : hc)) + " 净" + diff.toFixed(2) };
}

const a7 = d.asian7;
let rh = 0, rm = 0, rp = 0;
if (a7) {
  for (const l of a7.legs) {
    const j = judgeLeg(l);
    if (l.result !== j.res) { l.result = j.res; touched++; }
    if (j.res === "hit") rh++; else if (j.res === "miss") rm++; else if (j.res === "push") rp++;
    console.log("  " + l.play + " " + l.pick + "(" + l.match + ") → " + j.res + " [" + j.why + "]");
  }
  console.log("asian7: " + rh + "红" + rm + "黑" + rp + "走" + (rm > 0 ? " → 断缆 miss" : ""));
}

// --- review 正文 ---
d.review = `【10-19 终审 · 丙寅日 · 廉贞忌】(深夜快车窗口 北单池 23 场全齐)

★定格: 方向页面口径 **9/23(39.1%)**、双选语义 **15红8黑(65.2%)**——双选语义刷新历史下限(10-17 76.9% 原最差), 深夜小联赛窗口情报面薄+忌日双杀; 8 黑 = 7 场主不败爆冷(317 巴利亚多利德 2-3/321 桑普 1-2/324 特温特 1-2/333 CRB 0-1/336 拉普拉塔 1-2/338 辛辛那提 0-2/342 贝尔格拉诺 0-3)+1 场客不败黑(337 里奥夸尔托 2-1)。

★亚盘混合过关 7 关(让球×大小球, ≈142 倍): **${rh}红${rp}走${rm}黑${rm > 0 ? ", 断于辛辛那提平手(0-2)" : ""}**——河床-0.25(0-3 穿)/拉齐奥+1(0-3 穿)/里昂大 2.5(2-1)/弗鲁米嫩大 2.5(1-2)/弗拉门戈平手(0-3 穿)五红; 维拉诺瓦平手 2-2 走盘; 💰增强层 2 元亏。

★亮点: 皇马 4-1 塞维利亚(主胜红, 让-2 不追穿纪律兑现——净胜 3 本可穿但未入串无伤); 弗拉门戈 0-3 客胜兑现榜首 7 场不败; 6 场平局(320/322/323/334/339/341)全在双选红内。

★教训: ①深夜窗口方向层 39% 远低于常规(北单池小联赛情报面薄), 深夜快车专栏维持"双选防平"但降低对方向的期望; ②平手盘腿 1红1走1黑(美职德比主热 0-2 被屠)——平手盘弱于受让盘, 忌日平手盘主热侧慎入串; ③忌日中档主热爆冷第三日(特温特/CRB/辛辛那提/贝尔格拉诺全主热被屠), 主不败框架在深夜窗口需降权。`;
touched++;

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
