/* _final1021.js — 10-21 终审(32 场全完赛): asian7/大小盘/胜负彩 legs 手工回填 + 终审正文写入。
   判定依据(2026-10-21 06:0x 核算): asian7=萨巴赫+1.75 win/斯拉维亚+1 win/博德+0.75 loseHalf/比利亚雷+1.25 winHalf/埃因霍温+1 win → 3红2半含1输半=half;
   大小盘 4 串=003 小2.75✓/007 大3.25✓/009 大3.25✗/010 大3✗=2红2黑=miss; 北单 4红2黑净-128(理论全中 18567.64); 胜负彩 26146 期第一晚 5 场 4红1黑(波尔图胆拖黑)。
   用法: node tools/_final1021.js (幂等); 之后 _deploy_watch.sh 1021 + sync-data.js */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "..", "data", "predictions.js");
const days = require(file);
const d = days.find(x => x.date === "2026-10-21");
if (!d) { console.error("无 2026-10-21"); process.exit(1); }
let touched = 0;
const set = (obj, k, v) => { if (obj && obj[k] !== v) { obj[k] = v; touched++; } };

/* ① asian7 逐腿+块 */
const AH = { "002": "win", "004": "loseHalf", "001": "win", "007": "winHalf", "010": "win" };
if (d.asian7) {
  for (const l of d.asian7.legs) {
    const id3 = l.match.slice(0, 3);
    const r = AH[id3];
    if (r && l.result !== r) { l.result = r; touched++; }
  }
  set(d.asian7, "result", "half");
}
/* ② plan 卡: 🌏 亚洲让球=half / 🟣 大小盘=miss / 💥 综合过关=null(停更保持) */
const card = (n) => (d.plan || []).find(p => p.name === n);
if (card("🌏 亚洲让球")) set(card("🌏 亚洲让球"), "result", "half");
if (card("🟣 大小盘")) set(card("🟣 大小盘"), "result", "miss");
/* ③ 胜负彩 26146 期第一晚 5 场 legs 回填(明晚 9 场不动) */
if (d.zucai310) {
  const Z = { "利物浦": 1, "那不勒斯": 1, "波尔图": 0, "巴黎圣日耳曼": 1, "斯图加特": 1 };
  for (const l of d.zucai310.legs) {
    for (const k of Object.keys(Z)) {
      if (l.match.includes(k)) { const v = Z[k] ? "hit" : "miss"; if (l.result !== v) { l.result = v; touched++; } }
    }
  }
}
/* ④ 终审正文 */
const review = `10-21 终审(V2.16 胆位恢复首日, 32 场=竞彩 8+深夜快车英系 24, 全完赛; 北单结算=64注128元 4红2黑 净-128, 理论全中 18567.64):

【定格】方向页面 13/32(40.6%) · **双选 23红8黑(74.2%)** · 单选 0/1 · 比分 0/32 全灭; 分层: 竞彩 8 场双选 6红1黑(唯一黑=010 波尔图 0-1 爆冷, 深赔预警兑现) vs 深夜英系 24 场 17红7黑(71%); 🎯胜平负=miss(单选黑)/🔵双选=hit/🏅比分=miss/🀄北单=miss/🌏亚盘=half(3红2半)/🟣大小盘=miss(2红2黑)/💥combo7 停更。

【V2.16 首日复盘】① **0 胆写明缺证执行到位**: 胆档 4 候选全否, 其中 010 波尔图(亚盘穿盘存疑+深热预警)果然 0-1 直输——空仓躲过; 007 利物浦(最接近胆, 缺亚盘同向证)4-3 险胜=赢球不穿盘, 胆档否决正确。② **单选回归首战黑**: 009 马竞 1-1 斯图加特——五证全齐(市场客热 1.72+亚盘客水 1.82 低+FP 客不败+零预警)仍被主场 4 位逼平; 归因=排名盘口背离场的主队主场强度被低估(主场 80% 胜率), 单选轻仓纪律保命。③ **盘路 ahMoves 首验**: 001 费内巴切判读临场翻转(诱上盘→真热上盘), 实际 2-2 平=升盘场穿不了, 双选兜平红; 003 狼队「资金站主」1-1 平/004 那不勒斯「资金站主」4-3 险胜——资金站队≠赢球, 首日样本 3 场仅 1 场方向兑现, 盘路信号暂作参考层不作加证。④ **英系精选亚盘 1红3黑**: 莱斯特城-0.75(0-4 穿)✓ / 布拉德福德-0.75(0-0)✗ / 谢周三-0.5(0-2 直输, 6 位输 23 位=单日最大冷门)✗ / 普利茅斯0(0-3 被屠)✗——低级别联赛客队精选被排名背书反噬, 收紧口径: 精选须水位<1.85+排名差≥8 位双硬证, 且只做让球方不败结构(谢周三/普利茅斯都是让球方直输)。⑤ 名气盘卢顿 2-1 打出(警惕未兑现); 屠杀夜比分档全灭(4-2/4-3/4-3 连环); 北单让-1 两腿(001/004)死于让球负——让-1 场防平 3/1 盖不住实际平局(让球后变客胜), 忌日让-1 深热场北单口径改 3/1→直接放弃或 1/0 待拍板。

【胜负彩 26146 期】第一晚 5 场 4红1黑(波尔图胆拖 0-1 黑=忌日深热预警再兑现); 明晚 9 场(罗马/曼城/皇马/贝蒂斯/科莫场/里尔/维拉/拜仁/布鲁日)待赛, 10-22 晚停售后开奖。

【模型改进方向】① 单选/胆的五证之外加「排名盘口背离场主队主场胜率」反向校验(009 教训); ② 盘路信号首日 3 场 2 场方向未兑现, 降为参考层(不入五证), 积累 2 周样本再定权重; ③ 英系精选亚盘收紧双硬证; ④ 深夜窗口低级别联赛直输爆冷密集(7 黑里 5 场直输), 双选防平不防爆老问题在小联赛放大——后续深夜场考虑「受让方双选」表达(主场虫侧直接站客队受让)。`;

set(d, "review", review);

if (touched) {
  let json = JSON.stringify(days, null, 2);
  json = json.split("\n").map(x => x.startsWith("  ") ? x.slice(2) : x).join("\n");
  json = json.replace(/\n\]$/, "];");
  const header = "/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n";
  const footer = "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n";
  fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + footer, "utf8");
  console.log("✓ 10-21 终审已写入, touched=" + touched);
} else console.log("无变更");
