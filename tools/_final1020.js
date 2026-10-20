/* 10-20 终审复盘(深夜快车窗口全池 23 场): 写 review 正文 + 🌏/🟣 块结果(其余块东京自动复盘已设)。
   先 DRY=1 node tools/_final1020.js 检查, 再实跑。 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-20");
if (!d) { console.log("无 2026-10-20 数据"); process.exit(1); }

const REVIEW = `【10-20 终审 · 丁卯日 · 巨门忌】(深夜快车窗口全池 23 场全齐)

★定格: 方向页面口径 **8/23(34.8%)**、双选语义 **16红7黑(69.6%)**——方向层连续第二日低于 40%(10-19 39.1% 后再创新低), 深夜窗口情报面薄+忌日双杀; 双选语义较昨(65.2%)回升但仍低于 80% 常规线。7 黑 = 001 蒙扎 4-0 血洗客不败(卡利亚里客场 4 连胜·平队史 61 年纪录被终结)/002 代格福什 1-2/350 PSV 青年 0-1/352 阿贾克斯青年 2-1(亚盘-欧赔分歧场输主)/005 热刺 3-1(状态崩坏排除条款失效)/359 德里城 1-0(争冠生死战战意逻辑失效)/007 布拉加 1-2(Polymarket 反超信号兑现为客胜)。

★结构: 竞彩 8 场双选 4红4黑(50%), 深夜北单 15 场双选 12红3黑(80%)——三源互证轻仓口径反胜主池; 全日 8 场平局(343/348/353/006/362/363/008/365)全部兜住=忌日防平纪律兑现。

★过关全灭: asian7 5 关(≈16.9 倍)1红4黑 miss(仅 006 赫塔费+0.25 红; 卡利亚里+0.25/罗德兹+0.25/帕尔马+0.25 三受让全被屠, 考文垂+1.25 被热刺穿盘); 大小盘 4 串 3红1黑 miss(断于 003 都灵 0-3 三球打穿小 2.5); 比分 7 关 1红6黑 miss(唯一红=006 1-1@4.80 双源共识平局剧本); 北单 6 关 3红3黑 miss(64注128元, 344 蒙扎场/346 代格福什/357 热刺场三黑断缆); 🎯 零胆零单选连续第十九日 push(001/002/005/007 四大热侧全黑, 空仓再躲过)。💰 今日方案 130 元全亏(增强 2 元 + 北单 128 元)。

★亮点: 006 赫塔费 1-1 单场四线全红(主不败兜平+比分 1-1@4.80+小2.5+赫塔费+0.25); 003 都灵 0-3 客胜=H2H 近 7 次仅 1 负继续压制; 345 中日德兰/347 维斯瓦/349 布加勒斯特星 三场欧赔-亚盘-北单 SP 三源同向全红。

★教训: ①状态崩坏排除条款首败(热刺 3-1): 条款防"虚热不赢", 但热刺直接穿盘净胜 2——排除条款语义=不追主队, 不等于反向追客; 强队反弹日客不败侧是送分题, 排除条款场方向层应改"弃选"而非反向。②深热防平场 2红2黑(343 克卢日 2-2 兜平/356 沃特福德 3-2 直胜 vs 007 布拉加 1-2 直输/005 热刺 3-1 直赢)——实际平局兑现率仅 1/4, "防平"挡不住直输, 忌日深热场防平权重下调、直输预警上调。③争冠战意逻辑失效(359): 圣帕特里克客场 0-1 死, 无欲无求方反而赢——"必须赢"≠"能赢", 战意权重下调。④荷乙青年队 1红2黑, 青年队场维持降档处理。`;

let touched = 0;
if (d.review !== REVIEW) { d.review = REVIEW; touched++; }

function card(name) { return (d.plan || []).find(p => p.name === name); }
function setCard(name, v) { const c = card(name); if (c && c.result !== v) { c.result = v; touched++; } }
const sp = card("🎯 胜平负");
if (sp && /(0胆0单选|零胆零单选)/.test(sp.text + (sp.pct || ""))) setCard("🎯 胜平负", "push");
setCard("🌏 亚洲让球", "miss");   // asian7 5 关 1红4黑
setCard("🟣 大小盘", "miss");     // 4 串 3红1黑

if (process.env.DRY) {
  console.log("DRY 模式: touched=", touched, "| review 长度=", REVIEW.length);
  console.log("各块结果:");
  for (const p of (d.plan || [])) console.log("  ", p.name, "=", p.result);
  process.exit(0);
}
if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("终审写入完成, touched=", touched);
} else {
  console.log("无变更");
}
