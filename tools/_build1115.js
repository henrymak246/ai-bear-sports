/* tools/_build1115.js — 2026-11-15 周日池(15 场; 幂等)
   池面: 竞彩周日001-011 共 11 场(日联赛杯 1/4 决赛次回合 4+荷乙 1+欧国联 5+芬兰让球-only)+北单补足 4 场(西乙 088 特内里费/092 格拉纳达/095 埃瓦尔+欧国联 094 白俄罗斯)。
   数据: 竞彩 jc_had/hhad/crs_1115(11 场) + 北单 bd500_1115(26117 期) + 出奇澳彩 12:54 即时盘(_cq_odds_snap_1115_1254, 本机中继现抓)。
        ★澳客 okooo.com 今日 HTTP 405=单源出奇注记; 04:08 快照只覆盖昨日场, 12:54 现抓覆盖全 15 场。
   五式: 癸巳日(癸水坐巳火=干克支, 主队温和; 癸干四化 破军禄/巨门权/太阴科/贪狼忌=进攻冒进受损·防守得利, 9-6 癸未日同忌先例);
        六爻 雷山小过(五爻动)→泽山咸(小过=宜守不宜冒进小胜, 咸=均势易平)。
   规则: V4.7 胆档(009 克罗地亚 1.34 在区间但 AH 一球主水 1.98 浅盘高水=盘路反向+莫德里奇轮休风险 ⇒ 否决, 0 胆)
        + V4.8 方向不得逆资金(003 樱花/004 川崎/092 拉斯帕尔马斯跟资金; 006/009/088/095 弃选)
        + V4.10 主仓 SP≥1.5(混选 4 关全 ≥1.61)。
   用法: node tools/_build1115.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const bd = JSON.parse(fs.readFileSync(path.join(__dirname, 'bd500_1115.json'), 'utf8').replace(/^[^\[]*/, ''));
const bdByNum = Object.fromEntries(bd.map(b => [b.num, b]));
const had = require('./jc_had_1115.json');
const hhad = require('./jc_hhad_1115.json');
const crs = require('./jc_crs_1115.json');

const DATE = '2026-11-15';
if (days.some(d => d.date === DATE)) { days.splice(days.findIndex(d => d.date === DATE), 1); console.log('重建 ' + DATE + '（已移除旧版）'); }

const hadOf = num => { const x = had.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const hhadOf = num => { const x = hhad.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const goalLineOf = num => { const x = hhad.find(y => y.num === num); return x ? Number(x.sp.goalLine) : null; };
const crsOf = (num, sc) => { const x = crs.find(y => y.num === num); const v = x && x.sp && x.sp[sc]; return v == null ? null : Number(v); };
const bdSp = num => { const b = bdByNum[num]; return b ? b.sp.map(Number) : null; };
const bdHcp = num => { const b = bdByNum[num]; return b ? Number(b.handicap) : 0; };

/* 出奇澳彩即时盘(12:54 快照, 纯水→十进制 +1) */
const AH = {
  '周日001': { g: '0', name: '平手', home: '1.83', away: '1.95' },
  '周日002': { g: '0.5', name: '半球', home: '1.83', away: '1.95' },
  '周日003': { g: '-0.25', name: '受平/半', home: '1.74', away: '2.04' },
  '周日004': { g: '0.5', name: '半球', home: '2.00', away: '1.78' },
  '周日005': { g: '-0.25', name: '受平/半', home: '1.90', away: '1.88' },
  '周日006': { g: '-0.25', name: '受平/半', home: '1.84', away: '2.00' },
  '周日007': { g: '-0.25', name: '受平/半', home: '1.88', away: '1.96' },
  '周日008': { g: '3.5', name: '三球半', home: '1.98', away: '1.86' },
  '周日009': { g: '1', name: '一球', home: '1.98', away: '1.86' },
  '周日010': { g: '0.5', name: '半球', home: '1.84', away: '2.00' },
  '周日011': { g: '0.25', name: '平/半', home: '1.90', away: '1.94' },
  '北单088': { g: '0.75', name: '半/一', home: '1.98', away: '1.80' },
  '北单092': { g: '0.5', name: '半球', home: '1.97', away: '1.81' },
  '北单094': { g: '-0.5', name: '受半球', home: '1.88', away: '1.96' },
  '北单095': { g: '1', name: '一球', home: '2.03', away: '1.75' }
};
const OU = {
  '周日001': { goals: '2.5', over: '1.95', under: '1.77' },
  '周日002': { goals: '3', over: '1.91', under: '1.81' },
  '周日003': { goals: '3', over: '1.92', under: '1.80' },
  '周日004': { goals: '3.25', over: '1.96', under: '1.76' },
  '周日005': { goals: '3', over: '1.95', under: '1.77' },
  '周日006': { goals: '2.25', over: '1.96', under: '1.84' },
  '周日007': { goals: '2.5', over: '2.00', under: '1.80' },
  '周日008': { goals: '4', over: '1.90', under: '1.90' },
  '周日009': { goals: '2.75', over: '1.86', under: '1.94' },
  '周日010': { goals: '3', over: '2.02', under: '1.78' },
  '周日011': { goals: '2.75', over: '1.82', under: '1.98' },
  '北单088': { goals: '2.5', over: '1.90', under: '1.82' },
  '北单092': { goals: '2.5', over: '1.83', under: '1.89' },
  '北单094': { goals: '2', over: '1.80', under: '2.00' },
  '北单095': { goals: '2.75', over: '1.92', under: '1.80' }
};

const M = [
  { id: '周日001', bdNum: '080', lg: '日联赛杯', time: '13:00', home: '町田泽维亚', away: '神户胜利船', d: '主胜', tag: '双选', c: 1,
    sy: '主不败——联赛杯 1/4 决赛次回合, 首回合町田客场 1-0 占先, 回主场守反击; 神户必须攻出来留身后空间; 平手盘主水 1.83 低=资金站町田',
    n: '信息面: 町田升班马联赛第二, 主场韧性强; 神户控球派但破密防效率一般; 杯赛次回合轮换变量, 降信心。' },
  { id: '周日002', bdNum: '083', lg: '日联赛杯', time: '14:00', home: '鹿岛鹿角', away: '横滨水手', d: '主胜', tag: '双选', c: 2,
    sy: '主不败——联赛杯 1/4 决赛次回合, 鹿岛主场让半球主水 1.83 低=资金同向; 横滨近 10 场 5 胜 5 平不败是反向证据, 杯赛防平',
    n: '信息面: 竞彩 1.64 主热与亚盘半球低水双同向; 横滨客场反击有威胁(近 4 主场 11 球火力在主场, 客场折扣)。' },
  { id: '周日003', bdNum: '084', lg: '日联赛杯', time: '14:00', home: '大阪樱花', away: '浦和红钻', d: '主胜', tag: '双选', c: 1,
    sy: '主不败(V4.8 跟资金)——浦和客让平/半但客水 2.04 高=资金不信浦和, 樱花受让 1.74 全池最低水; 竞彩 2.21 客热与亚盘水位打架(两源分歧注记), 跟低水',
    n: '信息面: 杯赛 1/4 次回合; 樱花主场硬朗, 浦和客场起伏; ★竞彩 SP 客热 vs 亚盘主受让低水=分歧场, 按 V4.8 站资金侧。' },
  { id: '周日004', bdNum: '085', lg: '日联赛杯', time: '16:00', home: '柏太阳神', away: '川崎前锋', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.8 跟资金)——柏 1.64 主热但半球盘主水 2.00 高=高水热门诱上, 川崎客水 1.78 低=资金站川崎+0.5; 两源分歧跟低水',
    n: '信息面: 杯赛 1/4 次回合; 川崎前锋底蕴在, 柏主场强势是 SP 主热原因; ★高水热门+杯赛次回合=诱上预警, 方向跟资金。' },
  { id: '周日005', bdNum: '086', lg: '荷乙', time: '21:30', home: '马斯特里赫特', away: '维特斯', d: '客胜', tag: '双选', c: 1,
    sy: '客不败——马斯特里荷乙第 8 vs 维特斯第 11, 客让平/半客水 1.88 微低; 竞彩客胜 2.00 与亚盘同向, 防平',
    n: '信息面: 维特斯降班马阵容底子厚但稳定性差; 马斯特里主场有韧性。平水偏弱信号, 降信心。' },
  { id: '周日006', bdNum: '089', lg: '欧国联', time: '22:00', home: '拉脱维亚', away: '亚美尼亚', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——亚美尼亚对拉脱维亚三连胜+拉脱维亚 5 轮 1 分进攻全 C 级最差(基本面客侧), 但亚盘受平/半主水 1.84 低=资金站拉脱维亚受让, 竞彩客热 2.20 与亚盘打架, 两源分歧不追',
    n: '信息面: 双方名次已锁定=零战意闷场温床; 基本面(交锋三连胜)与资金(主受让低水)直接冲突, 弃选。' },
  { id: '周日007', bdNum: '090', lg: '欧国联', time: '22:00', home: '塞浦路斯', away: '黑山', d: '主胜', tag: '双选', c: 1,
    sy: '主不败——C2 名次全锁定(黑山头名/塞浦路斯第二)+C 级无降级=零战意闷场温床; 黑山大概率轮换, 塞浦路斯主场谢幕; 受平/半主水 1.88 低=资金站主队受让, 首选闷平',
    n: '信息面: 黑山客场无欲+轮换; 闷局格局, 小球倾向(线 2.5 小水 1.80 双证)。' },
  { id: '周日008', bdNum: '096', lg: '欧国联', time: '01:00', home: '芬兰', away: '圣马力诺', d: '让负', tag: '让球', c: 2,
    sy: '让负(圣马力诺+4)——芬兰争第二附加赛有战意, 圣马力诺 0 分 4 战丢 16 球(场均 4); 但竞彩让 4 球过深, 亚盘三球半主水 1.98 高=资金不信穿盘, 站受让方',
    n: '信息面: 官方未开胜平负=让球-only 场按让球写; 圣马力诺近 10 场场均丢 3.6 球, 让 4 需芬兰赢 5 球, 概率不足两成; 让负 1.93 价值。' },
  { id: '周日009', bdNum: '099', lg: '欧国联', time: '03:45', home: '克罗地亚', away: '捷克', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——克罗地亚 1.34 超深热, 但亚盘一球主水 1.98 高=浅盘高水诱上(1.34 对应应开球半), 资金站捷克受让; 莫德里奇轮休风险+捷克须赢 2 球保级的困兽斗, 方向与资金相反',
    n: '信息面: 捷克 5 连败 0 分=不可能任务但必死拼; 克罗地亚主场+相互战绩占优; ★胆档否决=盘路反向(浅盘高水)+轮休预警(V4.7 盘路反向不作胆)。' },
  { id: '周日010', bdNum: '100', lg: '欧国联', time: '03:45', home: '西班牙', away: '英格兰', d: '主胜', tag: '双选', c: 2,
    sy: '主不败——西班牙 43 场不败+打平即锁头名+首回合 3-2, 亚马尔缺阵是唯一削弱点; 英格兰须赢 2 球翻盘难度极大; 半球盘主水 1.84 低=资金同向, 防平',
    n: '信息面: A 级强强对话; 西班牙主场控制力独一档; 英格兰客场压出来打有身后空间但也有进球能力, 大球倾向(线 3 大水 2.02 高=机构防小)。' },
  { id: '周日011', bdNum: '098', lg: '欧国联', time: '03:45', home: '比利时', away: '意大利', d: '主胜', tag: '双选', c: 2,
    sy: '主不败——比利时背水一战(赢球才进前二)+首回合客场已 2-0, 意大利打平即锁第二=保平动机强; 平/半平水(1.90/1.94)无强信号, 战意驱动, 防平',
    n: '信息面: 意大利保平即可, 客场大概率低位防守; 比利时主场必须压上, 破密集是考验; 战意差=本日最深动机场之一。' },
  { id: '北单088', bdNum: '088', lg: '西乙', time: '21:00', home: '特内里费', away: '休达', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——特内里费主场让半/一但主水 1.98 高=高水浅盘, 资金站休达受让(客水 1.80 低); 北单 2.04 主热与亚盘打架, 两源分歧小联赛不追',
    n: '信息面: 西乙第 13 轮; 休达升班马客场虫但资金认可受让; 方向不做, 亚盘腿站资金侧。' },
  { id: '北单092', bdNum: '092', lg: '西乙', time: '23:15', home: '格拉纳达', away: '拉斯帕尔马斯', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.8 跟资金)——格拉纳达半球主水 1.97 高, 拉斯帕尔马斯客水 1.81 低=资金站客队受让; 两队同为降班马实力接近, 跟低水',
    n: '信息面: 西乙第 13 轮; 北单 1.98 主热 vs 亚盘客低水=分歧场, 按 V4.8 站资金侧; 格拉纳达主场胜率不足四成。' },
  { id: '北单094', bdNum: '094', lg: '欧国联', time: '01:00', home: '白俄罗斯', away: '阿尔巴尼亚', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——阿尔巴尼亚实力明显高档(欧洲杯正赛队)+北单客热 1.89, 但亚盘受半球主水 1.88 低=资金站白俄罗斯受让, 基本面与资金打架, 两源分歧不追',
    n: '信息面: 白俄罗斯主场中立场氛围淡; 阿尔巴尼亚客场稳定性一般; ★竞彩/北单客热 vs 亚盘主受让低水=分歧场, 弃选; 亚盘腿站资金侧。' },
  { id: '北单095', bdNum: '095', lg: '西乙', time: '01:30', home: '埃瓦尔', away: '加的斯', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——埃瓦尔 1.60 主热但一球盘主水 2.03 高=深盘高水诱上, 资金站加的斯+1(客水 1.75 全池最低之一); 方向与资金相反',
    n: '信息面: 西乙第 13 轮; 加的斯降班马客场羸弱是 SP 主热原因, 但深盘高水=穿盘不信; 亚盘腿站资金侧。' }
];

function mk(m) {
  const isJc = /^周日/.test(m.id);
  const item = {
    id: m.id, league: m.lg, time: m.time, home: m.home, away: m.away,
    direction: m.d, confidence: m.c,
    sp: isJc ? hadOf(m.id) : null,
    spHandicap: isJc ? goalLineOf(m.id) : bdHcp(m.bdNum),
    hhad: isJc ? hhadOf(m.id) : bdSp(m.bdNum),
    ah: AH[m.id] ? { goals: AH[m.id].g, name: AH[m.id].name, home: AH[m.id].home, away: AH[m.id].away } : { goals: '待补', name: '待补', home: '—', away: '—' },
    ahPick: null, ahConf: m.c,
    ouOdds: OU[m.id] ? { goals: OU[m.id].goals, name: OU[m.id].goals, over: OU[m.id].over, under: OU[m.id].under } : { goals: '', name: '待补', over: '—', under: '—' },
    ouPick: null, ouConf: m.c,
    score: [], scoreSp: [], ttgSp: null,
    synthesis: m.sy, note: m.n, dirTag: m.tag
  };
  return item;
}
const matches = M.map(mk);
const byId = Object.fromEntries(matches.map(m => [m.id, m]));

/* ahPick(站资金侧) */
const AHP = {
  '周日001': ['町田泽维亚 平手', 1], '周日002': ['鹿岛鹿角-0.5', 2], '周日003': ['大阪樱花+0.25', 2],
  '周日004': ['川崎前锋+0.5', 2], '周日005': ['维特斯-0.25', 1], '周日006': ['拉脱维亚+0.25', 1],
  '周日007': ['塞浦路斯+0.25', 1], '周日008': ['圣马力诺+3.5', 2], '周日009': ['捷克+1', 2],
  '周日010': ['西班牙-0.5', 2], '周日011': ['比利时-0.25', 1],
  '北单088': ['休达+0.75', 2], '北单092': ['拉斯帕尔马斯+0.5', 2], '北单094': ['白俄罗斯+0.5', 1], '北单095': ['加的斯+1', 2]
};
matches.forEach(m => { if (AHP[m.id]) { m.ahPick = AHP[m.id][0]; m.ahConf = AHP[m.id][1]; } });
matches.forEach(m => {
  const a = AH[m.id]; if (!a) return;
  const h = Number(a.home), aw = Number(a.away);
  const side = Math.abs(h - aw) < 0.05 ? null : (h < aw ? '主队' : '客队');
  m.note += '盘口: ' + a.name + ' 主' + a.home + '/客' + a.away + (side ? '=资金站' + side : '=平水') + '。';
});

/* 比分 3 场×3 */
const SCORE = [
  { id: '周日002', picks: ['2:0', '2:1', '1:0'] },
  { id: '周日010', picks: ['2:1', '1:0', '2:0'] },
  { id: '周日011', picks: ['2:1', '1:1', '1:0'] }
];
const score3 = {
  result: null,
  legs: SCORE.map(s => ({
    match: s.id + ' ' + byId[s.id].home + ' vs ' + byId[s.id].away,
    pick: s.picks,
    odds: s.picks.map(p => { const v = crsOf(s.id, p); return v == null ? '—' : v.toFixed(2); }),
    result: null, finalScore: null
  })),
  note: '比分只展示不串关: 002 鹿岛场正路档/010 西班牙场强攻档/011 比利时场战意防平档。'
};

/* 混选串关 4 关(全 ≥1.5, V4.10) */
const COMBO = [
  { id: '周日002', play: '胜平负', pick: '主胜', odds: hadOf('周日002')[0], reason: '鹿岛半球低水同向, 横滨客场折扣。' },
  { id: '周日010', play: '胜平负', pick: '主胜', odds: hadOf('周日010')[0], reason: '西班牙 43 场不败+半球低水, 英格兰须赢 2 球。' },
  { id: '周日011', play: '胜平负', pick: '主胜', odds: hadOf('周日011')[0], reason: '比利时背水一战最强动机, 意大利保平即可。' },
  { id: '周日005', play: '胜平负', pick: '客胜', odds: hadOf('周日005')[2], reason: '维特斯客让平/半低水, 降班马底子厚。' }
];
const comboOdds = COMBO.reduce((n, l) => n * l.odds, 1);

/* 大小 2 串(线位 ≤2.5, 结构+资金双证) */
const OU_LEGS = [
  { id: '周日007', pick: '小2.5', odds: '1.80', reason: '双零战意闷场温床(名次全锁+黑山轮换), 小水 1.80 低=双证。' },
  { id: '周日006', pick: '小2.25', odds: '1.84', reason: '拉脱维亚进攻全 C 级最差+名次已锁闷场, 线 2.25 小水 1.84=双证。' }
];
const ou2 = { result: null, legs: OU_LEGS.map(l => ({ match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null })), note: '大小 2 串(各 10 元): 007 塞浦路斯场小 2.5 @1.80 + 006 拉脱维亚场小 2.25 @1.84, 约 3.3 倍; 线位 ≤2.5+结构资金双证(11-14 大小连黑后收紧口径)。' };

/* 北单腿池(按信心排名) */
const BD_POOL = [
  { num: '083', id: '周日002', pick: '3/1', rank: 1, conf: 3, note: '鹿岛-1 主不败: 1.64 主热+半球低水双同向(杯赛次回合)。' },
  { num: '098', id: '周日011', pick: '3/1', rank: 2, conf: 3, note: '比利时让 0 主不败: 背水一战=全池最强战意, 平/半平水。' },
  { num: '100', id: '周日010', pick: '3/1', rank: 3, conf: 3, note: '西班牙-1 主不败: 43 场不败+半球低水; 让-1=赢 2 或正好 1 球。' },
  { num: '080', id: '周日001', pick: '3/1', rank: 4, conf: 2, note: '町田让 0 主不败: 首回合 1-0 领先+平手低水, 神户压上留反击空间。' },
  { num: '090', id: '周日007', pick: '3/1', rank: 5, conf: 2, note: '塞浦路斯让 0 主不败: 零战意闷场+主受让低水, 首选平。' },
  { num: '084', id: '周日003', pick: '3/1', rank: 6, conf: 2, note: '樱花让 0 主不败(跟资金): 受让 1.74 全池最低水。' },
  { num: '085', id: '周日004', pick: '0/1', rank: 7, conf: 2, note: '柏-1 场 0/1(跟资金站川崎): 高水热门诱上, 川崎+0.5 低水。' },
  { num: '092', id: '北单092', pick: '0/1', rank: 8, conf: 2, note: '格拉纳达场让 0 客不败(跟资金): 客水 1.81 低。' },
  { num: '094', id: '北单094', pick: '3/1', rank: 9, conf: 1, note: '白俄罗斯场让 0 弃选场腿站资金侧(主受让低水 1.88)。' },
  { num: '095', id: '北单095', pick: '0/1', rank: 10, conf: 1, note: '埃瓦尔-1 弃选场腿站资金侧: 加的斯+1(客水 1.75 低)。' },
  { num: '099', id: '周日009', pick: '0/1', rank: 11, conf: 1, note: '克罗地亚-1 弃选场腿站资金侧: 捷克+1(浅盘高水+魔笛轮休)。' }
];
const beidan310 = {
  issue: '26117', result: null,
  legs: BD_POOL.map(l => ({
    match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
    bdNum: l.num, pick: l.pick,
    handicap: String(bdHcp(l.num)),
    sp3: bdSp(l.num), rank: l.rank, conf: l.conf, note: l.note, result: null, finalScore: null
  })),
  note: '北单 26117 期腿池(11 腿按信心排名, 实下三票=早场 4 关+夜场 3 关+深夜 4 关); 让 0 腿所选 SP 均 ≥1.5(V4.10); 弃选场(094/095/099)腿站资金侧。'
};

/* 梦想 5 关(展示) */
const DREAM = [
  { id: '周日002', pick: '鹿岛鹿角 让球主胜(-1)', odds: String(hhadOf('周日002')[0]), reason: '半球低水穿盘幻想。' },
  { id: '周日010', pick: '西班牙 让球主胜(-1)', odds: String(hhadOf('周日010')[0]), reason: '英格兰压上留空间, 赢 2+ 幻想。' },
  { id: '周日011', pick: '比利时 让球主胜(-1)', odds: String(hhadOf('周日011')[0]), reason: '背水一战爆发幻想。' },
  { id: '周日008', pick: '圣马力诺 让球客胜(+4)', odds: String(hhadOf('周日008')[2]), reason: '让 4 过深, 受让直接赢盘幻想。' },
  { id: '周日004', pick: '川崎前锋 让球客胜(+1)', odds: String(hhadOf('周日004')[2]), reason: '高水热门诱上, 川崎受让赢盘幻想。' }
];
const dreamOdds = DREAM.reduce((n, l) => n * (Number(l.odds) || 1), 1);
const dream7 = {
  totalOdds: '约' + dreamOdds.toFixed(1) + '倍', result: null,
  legs: DREAM.map(l => ({ league: byId[l.id].league, match: (byId[l.id].bdNum || '') + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null })),
  note: '高赔幻想关展示不投注。'
};

/* 三时段 */
const mkBd = (legs, unit) => {
  const dbl = legs.filter(l => String(l.pick).includes('/')).length;
  const u = unit == null ? 2 : unit;
  return { issue: '26117', legs, stakes: 2 ** dbl, unit: u, cost: 2 ** dbl * u, result: null };
};
const toBd = legs => legs.map(l => ({
  bdNum: l.num, match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
  pick: l.pick, handicap: bdHcp(l.num), sp3: bdSp(l.num), note: l.note || '与方向同向', result: null
}));
const earlyBdLegs = [
  { num: '080', id: '周日001', pick: '3/1' }, { num: '083', id: '周日002', pick: '3/1' },
  { num: '084', id: '周日003', pick: '3/1' }, { num: '085', id: '周日004', pick: '0/1', note: '跟资金站川崎' }
];
const nightBdLegs = [
  { num: '090', id: '周日007', pick: '3/1' }, { num: '092', id: '北单092', pick: '0/1', note: '跟资金' },
  { num: '088', id: '北单088', pick: '0/1', note: '弃选场站资金侧(休达)' }
];
const lateBdLegs = [
  { num: '094', id: '北单094', pick: '3/1', note: '弃选场站资金侧(白俄罗斯受让)' }, { num: '095', id: '北单095', pick: '0/1', note: '弃选场站资金侧(加的斯)' },
  { num: '098', id: '周日011', pick: '3/1' }, { num: '100', id: '周日010', pick: '3/1' }
];
/* 亚盘票(站资金侧) */
const toAsian = legs => legs.map(l => ({
  id: l.id, match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, league: byId[l.id].league,
  pick: l.pick, play: '亚盘', odds: l.odds, reason: l.reason, result: null
}));
const earlyAsianLegs = [
  { id: '周日002', pick: '鹿岛鹿角-0.5', odds: '1.83', reason: '主水 1.83 低+1.64 主热同向。' },
  { id: '周日003', pick: '大阪樱花+0.25', odds: '1.74', reason: '受让 1.74 全池最低水。' },
  { id: '周日004', pick: '川崎前锋+0.5', odds: '1.78', reason: '客水 1.78 低, 高水热门反向。' }
];
const nightAsianLegs = [
  { id: '周日005', pick: '维特斯-0.25', odds: '1.88', reason: '客水微低+竞彩同向。' },
  { id: '周日007', pick: '塞浦路斯+0.25', odds: '1.88', reason: '闷场主受让低水。' }
];
const lateAsianLegs = [
  { id: '周日010', pick: '西班牙-0.5', odds: '1.84', reason: '主水 1.84 低+43 场不败同向。' },
  { id: '周日008', pick: '圣马力诺+3.5', odds: '1.86', reason: '让 4 过深, 客水 1.86 低。' },
  { id: '北单095', pick: '加的斯+1', odds: '1.75', reason: '弃选场站资金侧(客水 1.75 低)。' }
];
const mkAsian = (legs, cost) => {
  const sum = legs.reduce((n, l) => n * Number(l.odds), 1);
  return { legs, cost: cost == null ? 2 : cost, totalOdds: sum.toFixed(1), result: null };
};
const slot8 = {
  early: {
    asian: mkAsian(toAsian(earlyAsianLegs), 20),
    beidan: mkBd(toBd(earlyBdLegs), 2),
    review: '早场(12:00-17:59)=日联赛杯 1/4 次回合 4 场: 北单 4 关 16 注 32 元(085 腿跟资金站川崎) + 亚盘 3 腿 20 元(鹿岛-0.5/樱花+0.25/川崎+0.5)。'
  },
  night: {
    asian: mkAsian(toAsian(nightAsianLegs), 10),
    beidan: mkBd(toBd(nightBdLegs), 2),
    review: '夜场(18:00-23:59)=荷乙+欧国联 C+西乙: 北单 3 关 8 注 16 元(092/088 跟资金) + 亚盘 2 腿 10 元。'
  },
  late: {
    asian: mkAsian(toAsian(lateAsianLegs), 20),
    beidan: mkBd(toBd(lateBdLegs), 2),
    review: '深夜(次日00:00-11:59)=欧国联 A/C+西乙: 北单 4 关 16 注 32 元(095 弃选场站资金侧) + 亚盘 3 腿 20 元(西班牙-0.5/圣马力诺+3.5/加的斯+1)。'
  }
};

/* asianPool(10 腿按信心) */
const asianPool = {
  note: '亚盘腿池(10 腿按信心排名, 全部站资金侧, 出奇 12:54 即时盘单源[澳客 405 注记]; 实下=早场 3 腿 20+夜场 2 腿 10+深夜 3 腿 20):',
  legs: [
    { rank: 1, conf: 3, play: '亚盘让球', match: '周日002 鹿岛鹿角 vs 横滨水手', pick: '鹿岛鹿角-0.5', odds: '1.83', note: '主水 1.83 低+1.64 主热双同向。', result: null },
    { rank: 2, conf: 3, play: '亚盘让球', match: '周日010 西班牙 vs 英格兰', pick: '西班牙-0.5', odds: '1.84', note: '主水低+43 场不败+打平锁头名。', result: null },
    { rank: 3, conf: 3, play: '亚盘让球', match: '周日004 柏太阳神 vs 川崎前锋', pick: '川崎前锋+0.5', odds: '1.78', note: '高水热门反向, 客水 1.78 低。', result: null },
    { rank: 4, conf: 2, play: '亚盘让球', match: '周日003 大阪樱花 vs 浦和红钻', pick: '大阪樱花+0.25', odds: '1.74', note: '受让 1.74 全池最低水(竞彩客热分歧注记)。', result: null },
    { rank: 5, conf: 2, play: '亚盘让球', match: '周日008 芬兰 vs 圣马力诺', pick: '圣马力诺+3.5', odds: '1.86', note: '让 4 过深, 三球半主水 1.98 高不信穿。', result: null },
    { rank: 6, conf: 2, play: '亚盘让球', match: '北单095 埃瓦尔 vs 加的斯', pick: '加的斯+1', odds: '1.75', note: '弃选场站资金侧: 深盘高水诱上。', result: null },
    { rank: 7, conf: 2, play: '亚盘让球', match: '北单092 格拉纳达 vs 拉斯帕尔马斯', pick: '拉斯帕尔马斯+0.5', odds: '1.81', note: '跟资金客水 1.81 低。', result: null },
    { rank: 8, conf: 2, play: '亚盘让球', match: '周日011 比利时 vs 意大利', pick: '比利时-0.25', odds: '1.90', note: '平水弱信号, 背水战意驱动。', result: null },
    { rank: 9, conf: 1, play: '亚盘让球', match: '周日005 马斯特里赫特 vs 维特斯', pick: '维特斯-0.25', odds: '1.88', note: '客水微低, 弱展示腿。', result: null },
    { rank: 10, conf: 1, play: '亚盘让球', match: '周日007 塞浦路斯 vs 黑山', pick: '塞浦路斯+0.25', odds: '1.88', note: '闷场主受让低水, 弱展示腿。', result: null }
  ]
};

const plan = [
  { market: 'jc', name: '🎯 胜平负', pct: '0胆0单选+4场弃选', result: null,
    text: '零胆: 唯一区间内候选 009 克罗地亚 1.34 否决(AH 一球主水 1.98 浅盘高水=盘路反向+莫德里奇轮休风险, V4.7 盘路反向不作胆)。零单选: 最接近=002 鹿岛 1.64(杯赛次回合+首回合形势变量)/010 西班牙 1.61(强强对话), 均不够单选级。弃选 5 场=006 拉脱维亚(两源分歧)/009 克罗地亚(超深浅盘资金反)/088 特内里费(两源分歧)/094 白俄罗斯(两源分歧)/095 埃瓦尔(深盘高水资金反)。' },
  { market: 'jc', name: '🔵 双选方向', pct: '10场有效+5场弃选', result: null,
    text: '有效 10 场: 001 町田/002 鹿岛/003 樱花(跟资金)/007 塞浦路斯/010 西班牙/011 比利时 主侧 6 + 004 川崎/005 维特斯/092 拉斯帕尔马斯(跟资金) 客侧 3 + 008 让负(圣马力诺+4)。主 6 客 3=67% 触发 V4.4 复核(癸巳日干克支主温和+贪狼忌防守得利, 主侧 6 场中 4 场带防平/闷场属性, 复核通过: 逐场资金同向或战意驱动)。' },
  { market: 'jc', name: '🌏 亚洲让球', pct: '腿池10腿+三票50元', result: null,
    text: '亚盘腿池 10 腿按信心排名(全站资金侧): 鹿岛-0.5★3/西班牙-0.5★3/川崎+0.5★3 领衔。实下三票: 早场 3 腿 20(鹿岛/樱花/川崎)+夜场 2 腿 10(维特斯/塞浦路斯)+深夜 3 腿 20(西班牙/圣马力诺/加的斯)。' },
  { market: 'jc', name: '🟣 大小盘', pct: '2串约3.3倍', result: null,
    text: '大小 2 串(各 10 元): 007 塞浦路斯场小 2.5 @1.80(双零战意闷场)+006 拉脱维亚场小 2.25 @1.84(进攻最差+闷场), 线位 ≤2.5+结构资金双证(11-14 大小连黑后收紧口径)。' },
  { market: 'jc', name: '🏅 比分', pct: '3场×3', result: null,
    text: '比分只展示: 002 鹿岛场 2:0/2:1/1:0; 010 西班牙场 2:1/1:0/2:0; 011 比利时场 2:1/1:1/1:0(战意防平)。' },
  { market: 'bd', name: '🀄 北单310', pct: '腿池11腿+三票80元', result: null,
    text: '北单 26117 期腿池 11 腿按信心排名(083 鹿岛/098 比利时/100 西班牙 领衔); 实下三票: 早场 4 关 32 元 + 夜场 3 关 16 元 + 深夜 4 关 32 元, 全双选(忌日禁单锚)。' },
  { market: 'jc', name: '🌍 胜负彩', pct: '26163已灭·26165明日建', result: null,
    text: '26163 期(挂 11-13): 已赛 8 场 5红3黑(葡萄牙 1-4/罗马尼亚 2-1/米拉索尔 0-0), 14 场票与任九均已灭, 余 6 场今晚赛后补判定格; 开奖公告待官方。26165 期(11-16~18 场: 中国vs巴林/德国vs荷兰/丹麦vs挪威等)在售, 明日(11-16)建票。' },
  { market: 'jc', name: '💰 投注建议', pct: '方案190元', result: null,
    text: '💰190 元(日预算 300-500)=混选 4 关 40(约 ' + comboOdds.toFixed(1) + ' 倍: 鹿岛/西班牙/比利时主胜+维特斯客胜) + 大小 2 串 20 + 北单三票 80(早场 4 关 32/夜场 3 关 16/深夜 4 关 32) + 亚盘三票 50(早 20/夜 10/深夜 20)。0 胆 0 单选 4 弃选; 比分/梦想 5 关只展示。' }
];

const dayNote = '★11-15 周日池=竞彩 11 场(日联赛杯 1/4 决赛次回合 4[町田/鹿岛/樱花/柏]+荷乙 1+欧国联 5[含 008 芬兰让球-only])+北单补 4 场(西乙 3+欧国联白俄罗斯), 共 15 场。五式: **癸巳日**, 癸水坐巳火=**干克支, 主队温和**; 癸干四化=破军禄·巨门权·太阴科·**贪狼化忌**(进攻冒进受损·防守得利, 9-6 癸未日同忌先例); 六爻**雷山小过**(五爻动)→**泽山咸**(小过=宜守不宜冒进小胜, 咸=均势易平)。**结论=忌日防守局, 热门降半格**: **0 胆**(唯一候选 009 克罗地亚 1.34 浅盘高水盘路反向+魔笛轮休=否决)+**0 单选**(鹿岛杯赛/西班牙强强对话均不够级)+**弃选 5 场**(006/009/088/094/095); V4.8 跟资金 3 场=003 樱花/004 川崎/092 拉斯帕尔马斯。两源分歧注记=003/004/006/088/094(竞彩 SP 与亚盘水位打架, 一律站资金侧或弃选)。★澳客今日 405=出奇单源。⚠️仅供娱乐参考, 不构成投注建议。';

const dailyPost = {
  title: '周日 15 场: 0 胆防守日, 日联杯次回合 4 场+欧国联 5 场, 贪狼忌日只跟资金不追热门',
  content: '今天 15 场: 下午日联赛杯 1/4 决赛次回合 4 场(町田 vs 神户/鹿岛 vs 横滨/樱花 vs 浦和/柏 vs 川崎), 晚上荷乙+欧国联 C 级 3 场, 深夜欧国联 A 级强强对话 3 场(比利时 vs 意大利/克罗地亚 vs 捷克/西班牙 vs 英格兰)+芬兰让球盘, 明晨西乙 2 场。\n\n**今天的日柱是癸巳·贪狼化忌——进攻冒进受损日。** 卦象雷山小过→泽山咸, 也是"宜守不宜冒进、均势易平"的路数。所以今天 0 胆 0 单选: 唯一够区间的克罗地亚 1.34, 亚盘只开一球还高水——1.34 的赔率配球半才正常, 浅盘高水说明机构不信穿, 加上莫德里奇可能轮休, 直接否决。\n\n**跟资金的三场"不舒服"的场**: 樱花(浦和客热但客水 2.04 高, 樱花受让 1.74 全池最低水)、川崎(柏 1.64 主热但半球高水诱上)、拉斯帕尔马斯(格拉纳达主热但客水 1.81 低)。反过来弃掉五场: 拉脱维亚(基本面与资金直接打架)、克罗地亚(超深浅盘)、特内里费(两源分歧)、白俄罗斯(北单客热但亚盘主受让低水)、埃瓦尔(深盘高水诱上)。\n\n**方案 190 元**: 混选 4 关 40(约 10 倍: 鹿岛/西班牙/比利时主胜+维特斯客胜) + 大小 2 串 20(塞浦路斯/拉脱维亚两场闷场小球, 双证收紧) + 北单三票 80 + 亚盘三票 50。足彩 26163 期已灭(8 场 5红3黑, 余 6 场今晚补判), 26165 期明天建。\n\n仅供娱乐参考, 不构成投注建议。'
};

const betPlan = {
  total: 190,
  note: '北单为浮动 SP，全中回报以官方开奖为准；比分与梦想 5 关只展示不计投入。',
  rows: [
    { rank: 1, tier: '增强', name: '混选 4 关', detail: '002 主胜 1.64 / 010 主胜 1.61 / 011 主胜 1.90 / 005 客胜 2.00', stake: 40, odds: comboOdds.toFixed(1), payout: (40 * comboOdds).toFixed(1) },
    { rank: 2, tier: '增强', name: '大小 2 串', detail: '007 小 2.5 / 006 小 2.25', stake: 20, odds: '3.3', payout: '66.2' },
    { rank: 3, tier: '早场', name: '北单 4 关', detail: '080 3/1 · 083 3/1 · 084 3/1 · 085 0/1（16 注×2 元）', stake: 32, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 4, tier: '早场', name: '亚盘 3 腿', detail: '鹿岛-0.5 / 樱花+0.25 / 川崎+0.5', stake: 20, odds: earlyAsianLegs.reduce((n, l) => n * Number(l.odds), 1).toFixed(1), payout: (20 * earlyAsianLegs.reduce((n, l) => n * Number(l.odds), 1)).toFixed(1) },
    { rank: 5, tier: '夜场', name: '北单 3 关', detail: '090 3/1 · 092 0/1 · 088 0/1（8 注×2 元）', stake: 16, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 6, tier: '夜场', name: '亚盘 2 腿', detail: '维特斯-0.25 / 塞浦路斯+0.25', stake: 10, odds: nightAsianLegs.reduce((n, l) => n * Number(l.odds), 1).toFixed(1), payout: (10 * nightAsianLegs.reduce((n, l) => n * Number(l.odds), 1)).toFixed(1) },
    { rank: 7, tier: '深夜', name: '北单 4 关', detail: '094 0/1 · 095 0/1 · 098 3/1 · 100 3/1（16 注×2 元）', stake: 32, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 8, tier: '深夜', name: '亚盘 3 腿', detail: '西班牙-0.5 / 圣马力诺+3.5 / 加的斯+1', stake: 20, odds: lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1).toFixed(1), payout: (20 * lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1)).toFixed(1) },
  ]
};

const day = {
  date: DATE,
  dayPillar: '丙午年·己亥月·癸巳日',
  dayNote,
  matches,
  dailyPost,
  plan,
  betPlan,
  slot8,
  dream7,
  asian7: null,
  ou2,
  asianPool,
  score3,
  beidan310,
  zucai310: null,
  bank: { stake: 190, ret: null, net: null },
  review: ''
};

days.unshift(day);
const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写入 ' + DATE + ' 池, ' + matches.length + ' 场: ' + matches.map(m => m.id).join(','));
console.log('0 胆 0 单选 4 弃选 / 混选 4 关约 ' + comboOdds.toFixed(1) + ' 倍 / 梦想 5 关约 ' + dreamOdds.toFixed(1) + ' 倍 / 💰190');
