/* 10-07 终审(幂等): 替换 review 终审正文(fullPayout 已由 _bd_payout_backfill.js 登记)。
   用法: node tools/_patch1007_review_final.js */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const src = fs.readFileSync(file, "utf8");
const days = JSON.parse(src.match(/const PREDICTION_DAYS = (\[[\s\S]*\]);/)[1]);
const d = days.find(x => x.date === "2026-10-07");
if (!d) throw new Error("无 2026-10-07");

/* 终审正文 */
d.review = [
"【10-07 终审 · 甲寅日 · 太阳忌】薄日定格: 方向 3/6(50%)、双选语义 6红0黑(100% —— 本段第四个满级日)、比分 1/6 精确命中。",
"三黑全落平局(比和日剧本): 001 赫尔火花 0-0 国际图尔(头号分歧场兑现——Inter 深热客不胜, 格尼斯坦本季双杀+7 轮不败魔咒生效)/003 里莫 1-1 格雷米奥(全市场平局共识兑现)/004 布拉干RB 1-1 米拉索尔(港媒「诱主盘」警告兑现, 1.62 大热不胜)。",
"框架兑现: 零胆零单选(连续第九日)躲过全部三场平局的方向黑; 太阳忌「名门受损」双兑现(001 Inter 争冠组名门/004 布拉干大热不胜); 廉贞化禄强队正路(005 维多利亚 4-0 全场最深盘兑现); 破军化权黑马得势(006 达伽马 1-2 客胜, 近 8 场 6 胜状态队); 干支比和 3 平 = 均势剧本最干净一次落地。",
"比分 1/6: 003 里莫 1-1 精确(六场中平局共识最强的一场)。",
"串关: combo7 3红3黑断缆——三黑全是平局场(001/003/004), 「平局日直胜串必死」9-26 同构再现; score3 0红6黑全灭; 🀄北单310 4 腿全红第二次全中(16注32元 → 名义中奖 127.10 元/净 +95.10, sp3 欧赔口径以官方开奖为准)——四腿全是双选, 两场平局(068/070)被 3/1 罩住, 双选复式是平局日唯一存活结构。",
"教训: ①「干支比和日=平局高发日」: 6 场 3 平, 方向层 3 黑全为平局且全被双选罩住——比和日方向层只做双选, 双选语义第四次满级实证(继 9-26/9-29/9-30); ②平局日串关猎杀二次验证: combo7/score3 直胜腿全灭于平局, 北单双选复式全中——结构与 9-26 完全同构, 忌日+比和日直胜串一律让位双选结构; ③「诱主盘」信号兑现(布拉干): 状态一降一升 vs 排名差场, 港媒反向站队有效——与 9-12 美因茨「三证同源假互证」对照, 诱主信号要验状态证据是否独立; ④忌日让球腿例外成立: 005 维多利亚让-1 主胜@2.64 打出(4-0 净胜4), 「低赔强队改让球表达」在主场屠杀局可行; ⑤双杀/长魔咒叙事(格尼斯坦双杀 Inter)在分歧场继续兑现——分歧场双选降档规则第三次验证。",
].join("\n\n");

let json = JSON.stringify(days, null, 2);
json = json.split("\n").map(l => l.startsWith("  ") ? l.slice(2) : l).join("\n");
json = json.replace(/\n\]$/, "];");
const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
console.log("10-07 终审已写入");
