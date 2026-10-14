/* _patch1014_levain.js — 10-14 「日职(日联杯)」扩容: 北单池 5 场日本联赛杯观赛口径补进 10-13 day + 周三001 比分回填
   幂等: 已存在同 id 场次跳过; 周三001 已有 finalScore 则不动 */
const fs = require("fs");
const path = require("path");

const F = path.join(__dirname, "..", "data", "predictions.js");
let src = fs.readFileSync(F, "utf8");
const m = src.match(/const PREDICTION_DAYS = (\[[\s\S]*?\]);\s*\n/);
if (!m) { console.log("ERROR: PREDICTION_DAYS not found"); process.exit(1); }
const days = eval(m[1]);
const d = days.find(x => x.date === "2026-10-13");
if (!d) { console.log("ERROR: 2026-10-13 day not found"); process.exit(1); }

const base = {
  dirTag: "双选",
  overUnder: "", ttgSp: "—",
  sp: null, spHandicap: null, hhad: null,
  ah: null, ouOdds: null, ahPick: null, ahConf: null, ouPick: "", ouConf: null,
};

const mk = (o) => ({ ...base, ...o });

const newMatches = [
  mk({
    id: "北单028", league: "日联杯", time: "17:30", home: "横滨FC", away: "浦和红钻",
    direction: "客胜",
    synthesis: "客胜·双选——J1 内斗: 浦和传统强队客热 1.68(让+1) vs 横滨FC 升班马级; 出奇快照显示开场后浦和已 0-2 领先(待复核) ⇒ 客不败",
    score: ["0-2", "1-2"], scoreSp: [null, null], confidence: 2,
    note: "日联杯(Levain Cup)第 3 轮单败淘汰(10-14 17:30 北京; ⚠️本场系「日职扩容」观赛口径——发布时已开球, 不进任何投注块)。**赔率面**: 北单官方池 SP(让+1)4.21/3.83/1.68——浦和客热; 竞彩未开售。**基本面**: ①横滨FC 升班马 J1 下游保级圈, 主场抢分型; ②浦和红钻 J1 传统强队班底厚, 上轮联赛状态回暖; ③历史交锋浦和占优。**实况**: 出奇 17:50 快照显示开场后浦和 0-2 客场领先(进行中, 半场前两球, 待复核)。**结论**: 客不败双选(0/1)★2, 比分档 0-2/1-2; 进行中口径以终场为准。",
    finalScore: null,
  }),
  mk({
    id: "北单031", league: "日联杯", time: "18:00", home: "水户蜀葵", away: "FC东京",
    direction: "客胜",
    synthesis: "客胜·双选——J2 水户 vs J1 FC东京等级差明确: 东京客热 1.49(让+1); 天同忌「轻松局防松懈」⇒ 客不败, 但 J2 主场杯赛摆大巴防平",
    score: ["0-1", "1-1"], scoreSp: [null, null], confidence: 2,
    note: "日联杯(Levain Cup)第 3 轮单败淘汰(10-14 18:00 北京; ⚠️日职扩容·观赛口径, 发布临近开球不进投注块)。**赔率面**: 北单官方池 SP(让+1)5.72/4.01/1.49——FC东京客热深盘; 竞彩未开售。**基本面**: ①水户蜀葵 J2 中下游, 杯赛主场多轮换; ②FC东京 J1 中坚, 阵容深度对 J2 明显占优, 杯赛也常上主力轮换混编; ③日联杯让+1 口径: 东京赢一球即红。**结论**: 客不败双选(0/1)★2, 比分档 0-1/1-1; 庚申天同忌(J1 打 J2 轻松局)防平是主逻辑。",
    finalScore: null,
  }),
  mk({
    id: "北单033", league: "日联杯", time: "18:00", home: "名古屋鲸", away: "冈山绿雉",
    direction: "主胜",
    synthesis: "主胜·双选——J1 名古屋主场 vs J2 冈山: 让0 主 2.24 微热(市场未敢深盘=名古屋状态一般); 等级差+主场杯赛战意 ⇒ 主不败防平",
    score: ["2-1", "1-0"], scoreSp: [null, null], confidence: 2,
    note: "日联杯(Levain Cup)第 3 轮单败淘汰(10-14 18:00 北京; ⚠️日职扩容·观赛口径, 不进投注块)。**赔率面**: 北单官方池 SP(让0)2.24/3.33/2.87——名古屋微热但让0 未敢让球; 竞彩未开售。**基本面**: ①名古屋鲸 J1 主场(丰田体育场), 杯赛单败淘汰主场有战意; ②冈山绿雉 J2 前列(升班马候选), 状态不错是让0 的原因; ③两队近况均无大伤病。**结论**: 主不败双选(3/1)★2, 比分档 2-1/1-0; 让0 五五开边缘场, 主胜仅微热, 防平权重高。",
    finalScore: null,
  }),
  mk({
    id: "北单034", league: "日联杯", time: "18:00", home: "磐田喜悦", away: "川崎前锋",
    direction: "客胜",
    synthesis: "客胜·双选——J2 磐田 vs J1 川崎: 川崎客热 1.87(让+1); 川崎杯赛主力出战意愿强 vs 磐田 J2 保级优先 ⇒ 客不败",
    score: ["1-2", "0-2"], scoreSp: [null, null], confidence: 2,
    note: "日联杯(Levain Cup)第 3 轮单败淘汰(10-14 18:00 北京; ⚠️日职扩容·观赛口径, 不进投注块)。**赔率面**: 北单官方池 SP(让+1)3.57/3.55/1.87——川崎客热; 竞彩未开售。**基本面**: ①磐田喜悦 J2 中游(刚从 J1 降级不久), 主场有一定战力; ②川崎前锋 J1 老牌强队, 联赛无争冠压力后杯赛是赛季主目标, 主力出战意愿强; ③让+1 口径: 川崎赢一球即红。**结论**: 客不败双选(0/1)★2, 比分档 1-2/0-2; 天同忌防平(J1 客战 J2 主场哨)。",
    finalScore: null,
  }),
  mk({
    id: "北单035", league: "日联杯", time: "18:00", home: "鸟栖砂岩", away: "福冈黄蜂",
    direction: "主胜",
    synthesis: "主胜·双选——九州德比(鸟栖 vs 福冈): 让0 五五开(2.67/2.53), 市场对 J1 福冈客战不给热度; 鸟栖 J2 主场德比战意拉满 ⇒ 主不败",
    score: ["1-1", "2-1"], scoreSp: [null, null], confidence: 2,
    note: "日联杯(Levain Cup)第 3 轮单败淘汰(10-14 18:00 北京; ⚠️日职扩容·观赛口径, 不进投注块)。**赔率面**: 北单官方池 SP(让0)2.67/3.05/2.53——近五五开, 福冈(J1)客战无热度; 竞彩未开售。**基本面**: ①九州德比氛围, 鸟栖砂岩 J2 主场对老对手战意拉满; ②福冈黄蜂 J1 中游, 杯赛客场轮换概率高; ③德比+轮换=主队受益。**结论**: 主不败双选(3/1)★2, 比分档 1-1/2-1; 德比战意场, 平局权重同样高。",
    finalScore: null,
  }),
];

let added = 0;
for (const nm of newMatches) {
  if (d.matches.some(x => x.id === nm.id)) { console.log("skip exists:", nm.id); continue; }
  d.matches.push(nm);
  added++;
  console.log("added:", nm.id, nm.home, "vs", nm.away);
}

// 周三001 回填 3-0
const m001 = d.matches.find(x => x.id === "周三001");
if (m001) {
  if (!m001.finalScore) { m001.finalScore = "3-0"; console.log("finalScore 周三001 -> 3-0"); }
  else console.log("周三001 already has finalScore:", m001.finalScore);
}

// dayNote 追加扩容说明
const tag = "【日职扩容 10-14】";
if (!d.dayNote.includes(tag)) {
  d.dayNote += " **" + tag + "**: 北单池日联杯第 3 轮 6 场(横滨FC/水户/名古屋/磐田/鸟栖 + 已建周三004 横滨水手)观赛口径补建(北单028/031/033/034/035, 发布临近开球不进投注块; 028 发布时已开球进行中); 竞彩仅开售周三004 一场。";
  console.log("dayNote updated");
}

// 写回: 保持 PREDICTION_DAYS 数组文本整体替换
const newArr = JSON.stringify(days, null, 1);
const newSrc = src.replace(m[1], newArr);
fs.writeFileSync(F, newSrc, "utf8");
console.log("written, total matches in 10-13:", d.matches.length);
