/* tools/_build1116.js — 2026-11-16 周一池(11 场; 幂等)
   池面: 竞彩周一001-008 全欧国联末轮(法罗/哈萨克/爱沙尼亚/冰岛/瑞士/德国/北马其顿/希腊)+北单补 3 场(105 希腊U21/106 阿尔瓦塞特vs塞尔塔B/111 加拿大vs危地马拉)。
   数据: 竞彩 jc_had/hhad/crs_1116 + 北单 bd500_1116(★期号=26115 当前期[500.com 实证, 11-15 的 26117 系递增臆造已修正]) + 出奇 14:58 即时盘(中继现抓)。澳客午后解析 0 场注记(上午 26 场正常)。
   五式: 甲午日(甲木坐午火=干生支, 无强侧向; 甲干四化 廉贞禄/破军权/武曲科/太阳忌=太阳化忌·名门受损, 9-7 甲申日同忌先例: 强队防翻车);
        六爻 艮为山(四爻动)→地山谦(静止沉闷小球倾向→谦逊稳进小胜格局)。
   ★V4.12 首次实跑: ahFund 三公司互证(出奇快照澳彩/365/伟德):
     conflict(升盘矛盾=弃选级)=001 法罗/002 哈萨克/004 冰岛/106/111 五场全弃选;
     strong 互证=003 爱沙尼亚主(2/3+伟德升盘同向)/006 德国主(3/3 全同向)/005 苏格兰客(2/3+降盘一致)/008 塞尔维亚客(2/3);
     none=007 北马其顿(平水无信号)。
   定案: 0 胆+1 单选=006 德国 1.72★2(三公司全同向+背水战意+荷兰残阵德容缺阵)+弃选 6 场(001/002/004/008 超深资金反/106/111)。
   用法: node tools/_build1116.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const bd = JSON.parse(fs.readFileSync(path.join(__dirname, 'bd500_1116.json'), 'utf8').replace(/^[^\[]*/, ''));
const bdByNum = Object.fromEntries(bd.map(b => [b.num, b]));
const had = require('./jc_had_1116.json');
const hhad = require('./jc_hhad_1116.json');
const crs = require('./jc_crs_1116.json');
const AHFUND = require('./_ahfund_1116.json');

const DATE = '2026-11-16';
if (days.some(d => d.date === DATE)) { days.splice(days.findIndex(d => d.date === DATE), 1); console.log('重建 ' + DATE + '（已移除旧版）'); }

const hadOf = num => { const x = had.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const hhadOf = num => { const x = hhad.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const goalLineOf = num => { const x = hhad.find(y => y.num === num); return x ? Number(x.sp.goalLine) : null; };
const crsOf = (num, sc) => { const x = crs.find(y => y.num === num); const v = x && x.sp && x.sp[sc]; return v == null ? null : Number(v); };
const bdSp = num => { const b = bdByNum[num]; return b ? b.sp.map(Number) : null; };
const bdHcp = num => { const b = bdByNum[num]; return b ? Number(b.handicap) : 0; };

/* 出奇澳彩即时盘(14:58 快照, 纯水→十进制 +1) */
const AH = {
  '周一001': { g: '0.75', name: '半/一', home: '2.06', away: '1.78' },
  '周一002': { g: '-0.5', name: '受半球', home: '1.98', away: '1.86' },
  '周一003': { g: '0.25', name: '平/半', home: '1.80', away: '2.04' },
  '周一004': { g: '1.75', name: '球半/两球', home: '2.00', away: '1.84' },
  '周一005': { g: '0.75', name: '半/一', home: '1.94', away: '1.90' },
  '周一006': { g: '0.5', name: '半球', home: '1.84', away: '2.00' },
  '周一007': { g: '-1', name: '受一球', home: '1.94', away: '1.90' },
  '周一008': { g: '1.25', name: '一/球半', home: '1.98', away: '1.86' },
  '北单105': { g: '0.5', name: '半球', home: '1.86', away: '1.92' },
  '北单106': { g: '1', name: '一球', home: '1.98', away: '1.80' },
  '北单111': { g: '2.25', name: '两/两球半', home: '2.00', away: '1.78' }
};
const OU = {
  '周一001': { goals: '2.25', over: '1.97', under: '1.83' },
  '周一002': { goals: '2.5', over: '2.00', under: '1.80' },
  '周一003': { goals: '2', over: '1.86', under: '1.94' },
  '周一004': { goals: '2.75', over: '1.90', under: '1.90' },
  '周一005': { goals: '2.25', over: '1.80', under: '2.00' },
  '周一006': { goals: '3.5', over: '1.82', under: '1.98' },
  '周一007': { goals: '2.25', over: '1.92', under: '1.88' },
  '周一008': { goals: '2.75', over: '1.87', under: '1.93' },
  '北单105': { goals: '2.5', over: '1.87', under: '1.85' },
  '北单106': { goals: '3', over: '1.92', under: '1.80' },
  '北单111': { goals: '3.25', over: '1.94', under: '1.78' }
};

const M = [
  { id: '周一001', bdNum: '101', lg: '欧国联', time: '23:00', home: '法罗群岛', away: '摩尔多瓦', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——法罗 1.58 主热, 但三公司低水全站摩尔多瓦受让(客水 1.77-1.82)且盘口半/一由半球升来=升盘+受让低水=诱下预警(V4.12 conflict 弃选级)',
    n: '信息面: D 级末轮; 法罗主场人工草皮是已知变量但资金不买账。盘口: 半/一 主2.06/客1.78=资金站客队受让, 盘路半球→半/一升盘=矛盾。' },
  { id: '周一002', bdNum: '102', lg: '欧国联', time: '23:00', home: '哈萨克斯坦', away: '斯洛伐克', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——斯洛伐克 1.58 客热, 三公司盘口受一球→受半球集体变浅但低水仍站客队=盘口与水位矛盾(V4.12 conflict 弃选级)',
    n: '信息面: C 级末轮; 哈萨克高原主场 vs 斯洛伐克实力档。盘口: 受半球 主1.98/客1.86, 盘路 365/伟德受一球→受半球。' },
  { id: '周一003', bdNum: '104', lg: '欧国联', time: '01:00', home: '爱沙尼亚', away: '保加利亚', d: '主胜', tag: '双选', c: 2,
    sy: '主不败(资金同向)——澳彩/365 主水 1.80/1.77 低+伟德盘口平/半→半球升盘=上盘真热(V4.12 strong 2/3+升盘同向); 竞彩 1.87 主热同向',
    n: '信息面: C 级末轮两队下游, 爱沙尼亚主场; 三公司盘口一致性强。' },
  { id: '周一004', bdNum: '103', lg: '欧国联', time: '01:00', home: '冰岛', away: '卢森堡', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——冰岛 1.11 超深热, 但三公司两席低水站卢森堡受让+盘口球半→球半/两球升盘=超深+升盘矛盾双预警(V4.12 conflict 弃选级)',
    n: '信息面: C 级末轮; 冰岛实力碾压但穿 2 球盘需赢 3 球, 资金不信。' },
  { id: '周一005', bdNum: '109', lg: '欧国联', time: '03:45', home: '瑞士', away: '苏格兰', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.12 跟互证资金)——瑞士 1.45 主热领跑 B1(13 分进 11 失 1)但队长扎卡缺阵, 盘口一球→半/一降盘+365/伟德客水低=机构降温瑞士, 苏格兰保级抢分',
    n: '信息面: B1 末轮; 瑞士近 5 场 4 胜 1 负主场强, 苏格兰近 5 场 1 胜 1 平 3 负锋线乏力; ★竞彩主热 vs 亚盘资金站客=分歧场, 按纪律站资金侧。' },
  { id: '周一006', bdNum: '107', lg: '欧国联', time: '03:45', home: '德国', away: '荷兰', d: '主胜', tag: '单选', c: 2,
    sy: '单选·主胜——A2 末轮生死战: 德国 8 分必须赢保出线主动(希腊胜负关系占优), 荷兰 11 分不败已大概率出线+德容缺阵残阵; 三公司半球盘全主低水(V4.12 strong 3/3 全同向)',
    n: '信息面: 德国 11-13 客场 3-1 塞尔维亚(维尔茨建功)势头起, 阵容完整度远优于荷兰; 斯图加特主场。外部: 主流看德国不败, 网易系预测德国 2-1。' },
  { id: '周一007', bdNum: '110', lg: '欧国联', time: '03:45', home: '北马其顿', away: '斯洛文尼亚', d: '客胜', tag: '双选', c: 1,
    sy: '客不败——斯洛文尼亚 1.34 客热, 三公司平水(无资金信号); 实力差+首回合斯洛文尼亚 2-0, 防平',
    n: '信息面: B 级末轮; 北马其顿主场韧性有, 斯洛文尼亚冲胜保排名; ★无互证资金信号, 方向按基本面, 降信心。' },
  { id: '周一008', bdNum: '108', lg: '欧国联', time: '03:45', home: '希腊', away: '塞尔维亚', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——希腊 1.24 超深热+头名生死战(赢才能压德国), 但澳彩/伟德低水站塞尔维亚受让=超深资金反(V4.12 strong 客), 弃选',
    n: '信息面: A2 末轮; 塞尔维亚 0 分垫底但首回合仅 1-2 小负; 希腊赢则出线主动权在手=大热剧本, 资金不买穿盘。' },
  { id: '北单105', bdNum: '105', lg: '欧青U21', time: '01:00', home: '希腊U21', away: '冰岛U21', d: '主胜', tag: '双选', c: 1,
    sy: '主不败(资金同向)——澳彩/365 主水 1.86/1.85 低(V4.12 strong 2/2, 伟德无盘); U21 附加赛性质, 防平',
    n: '信息面: U21 附加赛; 青年队波动大, 降信心。' },
  { id: '北单106', bdNum: '106', lg: '西乙', time: '03:30', home: '阿尔瓦塞特', away: '塞尔塔B队', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——三公司低水全站塞尔塔B受让(客水 1.80-1.81)但盘口半球→一球连升=升盘+受让低水=诱下预警(V4.12 conflict 弃选级)',
    n: '信息面: 西乙; 主队 1.98 高水深盘, 两队都不稳。' },
  { id: '北单111', bdNum: '111', lg: '中北美国家联赛', time: '09:00', home: '加拿大', away: '危地马拉', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(方向)——加拿大 1.14 超深, 盘口两球→两/两球半升盘+低水站危地马拉受让=超深+升盘矛盾(V4.12 conflict 弃选级)',
    n: '信息面: CNL; 加拿大实力碾压但穿盘需赢 3 球, 资金不信。' }
];

function mk(m) {
  const isJc = /^周一/.test(m.id);
  const item = {
    id: m.id, league: m.lg, time: m.time, home: m.home, away: m.away,
    direction: m.d, confidence: m.c,
    sp: isJc ? hadOf(m.id) : null,
    spHandicap: isJc ? goalLineOf(m.id) : bdHcp(m.bdNum),
    hhad: isJc ? hhadOf(m.id) : bdSp(m.bdNum),
    ah: AH[m.id] ? { goals: AH[m.id].g, name: AH[m.id].name, home: AH[m.id].home, away: AH[m.id].away } : { goals: '待补', name: '待补', home: '—', away: '—' },
    ahPick: null, ahConf: m.c,
    ahFund: AHFUND[m.id] || null,
    ouOdds: OU[m.id] ? { goals: OU[m.id].goals, name: OU[m.id].goals, over: OU[m.id].over, under: OU[m.id].under } : { goals: '', name: '待补', over: '—', under: '—' },
    ouPick: null, ouConf: m.c,
    score: [], scoreSp: [], ttgSp: null,
    synthesis: m.sy, note: m.n, dirTag: m.tag
  };
  return item;
}
const matches = M.map(mk);
const byId = Object.fromEntries(matches.map(m => [m.id, m]));

/* ahPick(站互证资金侧; none 场按澳彩单源低水, 标弱) */
const AHP = {
  '周一001': ['摩尔多瓦+0.75', 1], '周一002': ['斯洛伐克-0.5', 1], '周一003': ['爱沙尼亚-0.25', 2],
  '周一004': ['卢森堡+1.75', 1], '周一005': ['苏格兰+0.75', 2], '周一006': ['德国-0.5', 3],
  '周一007': ['斯洛文尼亚-1', 1], '周一008': ['塞尔维亚+1.25', 2],
  '北单105': ['希腊U21-0.5', 2], '北单106': ['塞尔塔B队+1', 1], '北单111': ['危地马拉+2.25', 1]
};
matches.forEach(m => { if (AHP[m.id]) { m.ahPick = AHP[m.id][0]; m.ahConf = AHP[m.id][1]; } });
matches.forEach(m => {
  const a = AH[m.id]; if (!a) return;
  const f = m.ahFund;
  const ftxt = f && f.side ? '三公司互证站' + f.side + '队(' + f.strength + '/3, ' + f.signal + (f.move ? ', 盘路' + f.move : '') + ')' : '无互证信号';
  m.note += '盘口: ' + a.name + ' 主' + a.home + '/客' + a.away + '; ' + ftxt + '。';
});

/* 比分 3 场×3 */
const SCORE = [
  { id: '周一006', picks: ['2:1', '2:0', '1:0'] },
  { id: '周一005', picks: ['1:1', '0:1', '1:2'] },
  { id: '周一003', picks: ['1:0', '2:0', '1:1'] }
];
const score3 = {
  result: null,
  legs: SCORE.map(s => ({
    match: s.id + ' ' + byId[s.id].home + ' vs ' + byId[s.id].away,
    pick: s.picks,
    odds: s.picks.map(p => { const v = crsOf(s.id, p); return v == null ? '—' : v.toFixed(2); }),
    result: null, finalScore: null
  })),
  note: '比分只展示不串关: 006 德国场生死战档/005 瑞士场跟资金档/003 爱沙尼亚场资金同向档。'
};

/* 混选 2 关(V4.10 全 ≥1.5) */
const COMBO = [
  { id: '周一003', play: '胜平负', pick: '主胜', odds: hadOf('周一003')[0], reason: '澳彩/365 主低水+伟德升盘同向=真热。' },
  { id: '周一006', play: '胜平负', pick: '主胜', odds: hadOf('周一006')[0], reason: '三公司全同向+德国背水战意+荷兰残阵。' }
];
const comboOdds = COMBO.reduce((n, l) => n * l.odds, 1);

/* 大小 2 串(线位 ≤2.5) */
const OU_LEGS = [
  { id: '周一001', pick: '小2.25', odds: '1.83', reason: 'D 级末轮+小水 1.83 低; 弃选场只出大小。' },
  { id: '周一007', pick: '小2.25', odds: '1.88', reason: '北马其顿场小球基因(首回合 2-0), 小水 1.88 微低。' }
];
const ou2 = { result: null, legs: OU_LEGS.map(l => ({ match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null })), note: '大小 2 串(各 10 元): 001 法罗场小 2.25 @1.83 + 007 北马其顿场小 2.25 @1.88, 约 3.4 倍。' };

/* 北单腿池(按信心排名, 期号=26115 当前期) */
const BD_POOL = [
  { num: '107', id: '周一006', pick: '3/1', rank: 1, conf: 3, note: '德国让 0 主不败: 三公司全同向+生死战+荷兰残阵。' },
  { num: '104', id: '周一003', pick: '3/1', rank: 2, conf: 3, note: '爱沙尼亚让 0 主不败: 澳彩/365 主低水+伟德升盘同向。' },
  { num: '109', id: '周一005', pick: '0/1', rank: 3, conf: 2, note: '瑞士让 0 场 0/1(跟互证资金): 降盘+客低水, 扎卡缺阵。' },
  { num: '105', id: '北单105', pick: '3/1', rank: 4, conf: 2, note: '希腊U21 让 0 主不败: 主低水互证 2/2。' },
  { num: '110', id: '周一007', pick: '0/1', rank: 5, conf: 1, note: '北马其顿+1 场: 斯洛文尼亚客侧(平水无信号, 基本面)。' },
  { num: '103', id: '周一004', pick: '0/1', rank: 6, conf: 1, note: '冰岛-2 弃选场腿站资金侧: 卢森堡+2(冰岛赢不到 3 球)。' },
  { num: '101', id: '周一001', pick: '0/1', rank: 7, conf: 1, note: '法罗场让 0 弃选场腿站资金侧: 摩尔多瓦客不败。' },
  { num: '102', id: '周一002', pick: '0/1', rank: 8, conf: 1, note: '哈萨克场让 0 弃选场腿站资金侧: 斯洛伐克客不败。' },
  { num: '108', id: '周一008', pick: '0/1', rank: 9, conf: 1, note: '希腊-1 弃选场腿站资金侧: 塞尔维亚+1(希腊赢 1 球内)。' }
];
const beidan310 = {
  issue: '26115', result: null,
  legs: BD_POOL.map(l => ({
    match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
    bdNum: l.num, pick: l.pick,
    handicap: String(bdHcp(l.num)),
    sp3: bdSp(l.num), rank: l.rank, conf: l.conf, note: l.note, result: null, finalScore: null
  })),
  note: '北单 26115 期腿池(9 腿按信心排名, 实下两票=夜场 2 关+深夜 4 关); 让 0 腿所选 SP 均 ≥1.5(V4.10); 弃选场腿站互证资金侧(V4.12)。★期号修正: 北单期号跨多天, 当前期=26115(500.com 实证), 11-15 的 26117 系递增臆造。'
};

/* 梦想 5 关(展示, 弃选场不进) */
const DREAM = [
  { id: '周一006', pick: '德国 让球主胜(-1)', odds: String(hhadOf('周一006')[0]), reason: '背水+残阵对手, 赢 2 球幻想。' },
  { id: '周一003', pick: '爱沙尼亚 让球主胜(-1)', odds: String(hhadOf('周一003')[0]), reason: '资金真热穿盘幻想。' },
  { id: '周一007', pick: '斯洛文尼亚 让球客胜(+1)', odds: String(hhadOf('周一007')[2]), reason: '实力差赢 2 球幻想。' },
  { id: '周一005', pick: '苏格兰 让球客胜(+1)', odds: String(hhadOf('周一005')[2]), reason: '跟资金冷门幻想。' },
  { id: '北单105', pick: '希腊U21 主胜(让0)', odds: String(bdByNum['105'].sp[0]), reason: '互证 2/2 主低水。' }
];
const dreamOdds = DREAM.reduce((n, l) => n * (Number(l.odds) || 1), 1);
const dream7 = {
  totalOdds: '约' + dreamOdds.toFixed(1) + '倍', result: null,
  legs: DREAM.map(l => ({ league: byId[l.id].league, match: (byId[l.id].bdNum || '') + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null })),
  note: '高赔幻想关展示不投注。'
};

/* 三时段(早场无场) */
const mkBd = (legs, unit) => {
  const dbl = legs.filter(l => String(l.pick).includes('/')).length;
  const u = unit == null ? 2 : unit;
  return { issue: '26115', legs, stakes: 2 ** dbl, unit: u, cost: 2 ** dbl * u, result: null };
};
const toBd = legs => legs.map(l => ({
  bdNum: l.num, match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
  pick: l.pick, handicap: bdHcp(l.num), sp3: bdSp(l.num), note: l.note || '与方向同向', result: null
}));
const nightBdLegs = [
  { num: '101', id: '周一001', pick: '0/1', note: '弃选场站互证资金侧' },
  { num: '102', id: '周一002', pick: '0/1', note: '弃选场站互证资金侧' }
];
const lateBdLegs = [
  { num: '104', id: '周一003', pick: '3/1' }, { num: '107', id: '周一006', pick: '3/1' },
  { num: '109', id: '周一005', pick: '0/1', note: '跟互证资金' }, { num: '108', id: '周一008', pick: '0/1', note: '弃选场站互证资金侧' }
];
const toAsian = legs => legs.map(l => ({
  id: l.id, match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, league: byId[l.id].league,
  pick: l.pick, play: '亚盘', odds: l.odds, reason: l.reason, result: null
}));
const lateAsianLegs = [
  { id: '周一006', pick: '德国-0.5', odds: '1.84', reason: '三公司全同向主低水+生死战。' },
  { id: '周一003', pick: '爱沙尼亚-0.25', odds: '1.80', reason: '澳彩/365 主低水+伟德升盘同向。' },
  { id: '周一005', pick: '苏格兰+0.75', odds: '1.90', reason: '降盘+客低水互证, 扎卡缺阵。' }
];
const mkAsian = (legs, cost) => {
  const sum = legs.reduce((n, l) => n * Number(l.odds), 1);
  return { legs, cost: cost == null ? 2 : cost, totalOdds: sum.toFixed(1), result: null };
};
const slot8 = {
  early: {
    asian: { legs: [], cost: 0, totalOdds: '0', result: null },
    beidan: { issue: '26115', legs: [], stakes: 0, unit: 2, cost: 0, result: null },
    review: '早场(12:00-17:59)无场次, 全天最早 23:00 开球。'
  },
  night: {
    asian: { legs: [], cost: 0, totalOdds: '0', result: null },
    beidan: mkBd(toBd(nightBdLegs), 5),
    review: '夜场(18:00-23:59)=法罗/哈萨克两场弃选场: 北单 2 关 4 注×5 元=20 元(双腿站互证资金侧, V4.11 单票 ≥20)。'
  },
  late: {
    asian: mkAsian(toAsian(lateAsianLegs), 20),
    beidan: mkBd(toBd(lateBdLegs), 2),
    review: '深夜(次日00:00-11:59)=欧国联末轮 6 场+U21+西乙+CNL: 亚盘 3 腿 20 元(德国-0.5/爱沙尼亚-0.25/苏格兰+0.75, 全互证同向) + 北单 4 关 16 注 32 元。'
  }
};

/* asianPool(9 腿按信心) */
const asianPool = {
  note: '亚盘腿池(9 腿按信心排名, 全站互证资金侧, 出奇 14:58 三公司; 实下=深夜 3 腿 20 元):',
  legs: [
    { rank: 1, conf: 3, play: '亚盘让球', match: '周一006 德国 vs 荷兰', pick: '德国-0.5', odds: '1.84', note: '三公司 3/3 主低水全同向+生死战+荷兰残阵。', result: null },
    { rank: 2, conf: 3, play: '亚盘让球', match: '周一003 爱沙尼亚 vs 保加利亚', pick: '爱沙尼亚-0.25', odds: '1.80', note: '澳彩/365 主低水+伟德升盘=真热。', result: null },
    { rank: 3, conf: 2, play: '亚盘让球', match: '周一005 瑞士 vs 苏格兰', pick: '苏格兰+0.75', odds: '1.90', note: '降盘+客低水互证; 扎卡缺阵。', result: null },
    { rank: 4, conf: 2, play: '亚盘让球', match: '北单105 希腊U21 vs 冰岛U21', pick: '希腊U21-0.5', odds: '1.86', note: '主低水互证 2/2(伟德无盘)。', result: null },
    { rank: 5, conf: 2, play: '亚盘让球', match: '周一008 希腊 vs 塞尔维亚', pick: '塞尔维亚+1.25', odds: '1.86', note: '弃选场站互证资金侧(2/3 客低水)。', result: null },
    { rank: 6, conf: 1, play: '亚盘让球', match: '周一001 法罗群岛 vs 摩尔多瓦', pick: '摩尔多瓦+0.75', odds: '1.78', note: '弃选场: 升盘矛盾, 受让低水。', result: null },
    { rank: 7, conf: 1, play: '亚盘让球', match: '周一002 哈萨克 vs 斯洛伐克', pick: '斯洛伐克-0.5', odds: '1.86', note: '弃选场: 客低水 2/3。', result: null },
    { rank: 8, conf: 1, play: '亚盘让球', match: '北单106 阿尔瓦塞特 vs 塞尔塔B队', pick: '塞尔塔B队+1', odds: '1.80', note: '弃选场: 升盘矛盾, 受让低水。', result: null },
    { rank: 9, conf: 1, play: '亚盘让球', match: '北单111 加拿大 vs 危地马拉', pick: '危地马拉+2.25', odds: '1.78', note: '弃选场: 超深+升盘矛盾。', result: null }
  ]
};

/* 足彩 26165(今晚 22:00 停售): 9 单 5 双 32 注 64 元 + 任九 8 注 16 元 */
const zucai310 = {
  period: '26165', result: null,
  legs: [
    { pick: '1/0', match: '法罗群岛 vs 摩尔多瓦', note: '弃选场跟互证资金(摩尔多瓦受让)。', result: null },
    { pick: '1/0', match: '哈萨克斯坦 vs 斯洛伐克', note: '弃选场跟互证资金(斯洛伐克)。', result: null },
    { pick: '3', match: '爱沙尼亚 vs 保加利亚', note: '单: 资金真热同向。', result: null },
    { pick: '3/1', match: '冰岛 vs 卢森堡', note: '冰岛超深但实力碾压, 主不败覆盖。', result: null },
    { pick: '3', match: '德国 vs 荷兰', note: '单: 三公司全同向+背水+残阵。', result: null },
    { pick: '3/1', match: '希腊 vs 塞尔维亚', note: '希腊头名生死战, 主不败。', result: null },
    { pick: '0', match: '北马其顿 vs 斯洛文尼亚', note: '单: 实力差+首回合 0-2。', result: null },
    { pick: '1/0', match: '瑞士 vs 苏格兰', note: '跟互证资金(苏格兰受让)。', result: null },
    { pick: '3', match: '波黑 vs 罗马尼亚', note: '11-18 场: 波黑主场, 无盘口暂走主。', result: null },
    { pick: '3', match: '丹麦 vs 挪威', note: '11-18 场: 丹麦主场强, 无盘口暂走主。', result: null },
    { pick: '3', match: '匈牙利 vs 北爱尔兰', note: '11-18 场: 匈牙利主场, 无盘口暂走主。', result: null },
    { pick: '3', match: '爱尔兰 vs 科索沃', note: '11-18 场: 爱尔兰主场, 无盘口暂走主。', result: null },
    { pick: '3', match: '波兰 vs 瑞典', note: '11-18 场: 波兰主场, 无盘口暂走主(瑞典或已出线轮换)。', result: null },
    { pick: '1/0', match: '威尔士 vs 葡萄牙', note: '11-18 场: 葡萄牙客强, 客不败。', result: null }
  ],
  rensuan9: {
    dan: [],
    tuo: ['德国 3', '爱沙尼亚 3', '斯洛文尼亚 0', '丹麦 3', '波兰 3', '葡萄牙 0', '法罗群岛 1/0', '冰岛 3/1', '希腊 3/1'],
    note: '任九 0胆6单3双=8注16元。',
    result: null
  },
  note: '胜负彩26165期(11-16 22:00 停售; 对阵源=500.com官方页): 0胆9单5双=32注64元+任九8注16元; 前 8 腿=今明欧国联末轮(与本池方向一致), 后 6 腿为 11-17/18 场无盘口暂走主场/实力侧, 明晚盘路复核时可调。⚠️11-18 六腿不确定度高。'
};

const plan = [
  { market: 'jc', name: '🎯 胜平负', pct: '1单选0胆+6场弃选', result: null,
    text: '单选=006 德国 1.72★2(三公司 3/3 主低水全同向+背水战意+荷兰残阵德容缺阵)。零胆: 无区间内候选(001 法罗 1.58 conflict/004 冰岛 1.11 超深 conflict/008 希腊 1.24 资金反/007 客 1.34 无信号)。弃选 6 场=001/002/004/106/111(V4.12 升盘矛盾诱下预警)+008(超深资金反)。' },
  { market: 'jc', name: '🔵 双选方向', pct: '5场有效+6场弃选', result: null,
    text: '有效 5 场: 003 爱沙尼亚/006 德国/105 希腊U21 主侧 3 + 005 苏格兰(跟资金)/007 斯洛文尼亚 客侧 2。主 3 客 2=60% 踩 V4.4 复核线(甲午日干生支无强侧向+太阳忌名门防翻车+艮为山小球沉闷, 复核通过: 逐场互证同向或弃选)。' },
  { market: 'jc', name: '🌏 亚洲让球', pct: '腿池9腿+深夜3腿20元', result: null,
    text: '亚盘腿池 9 腿按信心排名(全站互证资金侧): 德国-0.5★3/爱沙尼亚-0.25★3/苏格兰+0.75★2 领衔。实下: 深夜 3 腿 20 元。' },
  { market: 'jc', name: '🟣 大小盘', pct: '2串约3.4倍', result: null,
    text: '大小 2 串(各 10 元): 001 法罗场小 2.25 @1.83(D 级末轮)+007 北马其顿场小 2.25 @1.88(首回合 2-0 小球基因), 线位 ≤2.5 合规。' },
  { market: 'jc', name: '🏅 比分', pct: '3场×3', result: null,
    text: '比分只展示: 006 德国场 2:1/2:0/1:0; 005 瑞士场 1:1/0:1/1:2(跟资金); 003 爱沙尼亚场 1:0/2:0/1:1。' },
  { market: 'bd', name: '🀄 北单310', pct: '腿池9腿+两票52元', result: null,
    text: '北单 26115 期(当前期, 跨多天)腿池 9 腿按信心排名(107 德国/104 爱沙尼亚/109 苏格兰 领衔); 实下两票: 夜场 2 关 ×5 倍投 20 元(101/102 弃选场站资金侧)+深夜 4 关 32 元, 全双选。' },
  { market: 'jc', name: '🌍 胜负彩', pct: '26165期今晚22:00停售', result: null,
    text: '26165 期: 今晚 22:00 停售, 0胆9单5双 32 注 64 元+任九 8 注 16 元; 前 8 腿=今明欧国联末轮与本池一致, 后 6 腿(11-17/18)无盘口暂走主场/实力侧, 明晚盘路复核可调。' },
  { market: 'jc', name: '💰 投注建议', pct: '方案262元', result: null,
    text: '💰262 元(日预算 300-500)=单选 50(德国 1.72) + 混选 2 关 40(约 ' + comboOdds.toFixed(1) + ' 倍: 爱沙尼亚/德国) + 大小 2 串 20 + 北单两票 52(夜场 2 关 ×5 倍投 20/深夜 4 关 32) + 亚盘深夜 3 腿 20 + 足彩 26165 期 80(64+16)。1 单选 0 胆 6 弃选; 比分/梦想 5 关只展示。' }
];

const dayNote = '★11-16 周一池=竞彩 8 场全欧国联末轮+北单补 3 场(U21/西乙/CNL), 共 11 场。五式: **甲午日**(甲木坐午火=干生支, 无强侧向; 甲干四化 廉贞禄·破军权·武曲科·**太阳化忌**=名门受损日, 9-7 甲申日同忌先例: 强队防翻车); 六爻**艮为山**(四爻动)→**地山谦**(静止沉闷小球→谦逊小胜)。**★V4.12 三公司互证首次实跑**: conflict 弃选级拦下 5 场(001 法罗/002 哈萨克/004 冰岛/106/111=升盘+受让低水矛盾), strong 互证 4 场(003/006 主/005/008 客)。**结论=0 胆+1 单选 006 德国**(3/3 全同向+背水+荷兰残阵)**+弃选 6 场**; 足彩 26165 今晚 22:00 停售(0胆9单5双 64+任九 16)。★澳客午后解析 0 场注记(上午 26 场正常, 单源出奇)。⚠️仅供娱乐参考, 不构成投注建议。';

const dailyPost = {
  title: '周一 11 场: 欧国联末轮全灭局, 单选德国背水一战, 五场升盘矛盾全弃',
  content: '今天 11 场全是欧国联末轮+小联赛补场。头戏是 03:45 德国 vs 荷兰: 德国 8 分排第三, 不赢就交出出线主动权, 荷兰 11 分不败基本出线还缺了德容。三家公司盘口全站德国(半球主低水 3/3 同向), 这是今天唯一够硬的方向, 单选 50 元。\n\n**今天最大的变化是资金口径升级后第一次实战**: 五场"看起来能买"的场被三公司互证拦下——法罗群岛(1.58 主热但盘口升半/一还受让低水=诱下)、哈萨克、冰岛(1.11 超深+升盘矛盾)、阿尔瓦塞特、加拿大, 全部弃选。昨天这种矛盾场我们跟资金黑了两场(川崎/圣马力诺), 今天开始不碰。\n\n**方案 262 元**: 单选德国 50 + 混选 2 关 40(德国×爱沙尼亚) + 大小 2 串 20 + 北单两票 52 + 亚盘深夜 3 腿 20 + 足彩 26165 期 80(今晚 22:00 停售)。另外瑞士场跟资金站苏格兰受让(扎卡缺阵+盘口一球降半/一=机构降温瑞士)。\n\n仅供娱乐参考, 不构成投注建议。'
};

const betPlan = {
  total: 262,
  note: '北单为浮动 SP，全中回报以官方开奖为准；比分与梦想 5 关只展示不计投入。',
  rows: [
    { rank: 1, tier: '稳定', name: '单选', detail: '德国 主胜 1.72★2(三公司全同向+背水)', stake: 50, odds: '1.72', payout: '86.0' },
    { rank: 2, tier: '增强', name: '混选 2 关', detail: '003 主胜 1.87 / 006 主胜 1.72', stake: 40, odds: comboOdds.toFixed(1), payout: (40 * comboOdds).toFixed(1) },
    { rank: 3, tier: '足彩', name: '足彩26165期+任九', detail: '0胆9单5双 32注 + 任九 8注', stake: 80, odds: '—', payout: '以官方开奖为准' },
    { rank: 4, tier: '深夜', name: '北单 4 关', detail: '104 3/1 · 107 3/1 · 109 0/1 · 108 0/1（16 注×2 元）', stake: 32, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 5, tier: '深夜', name: '亚盘 3 腿', detail: '德国-0.5 / 爱沙尼亚-0.25 / 苏格兰+0.75', stake: 20, odds: lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1).toFixed(1), payout: (20 * lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1)).toFixed(1) },
    { rank: 6, tier: '夜场', name: '北单 2 关', detail: '101 0/1 · 102 0/1（4 注×5 元）', stake: 20, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 7, tier: '增强', name: '大小 2 串', detail: '001 小 2.25 / 007 小 2.25', stake: 20, odds: '3.4', payout: '68.9' }
  ]
};

const day = {
  date: DATE,
  dayPillar: '丙午年·己亥月·甲午日',
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
  zucai310,
  bank: { stake: 262, ret: null, net: null },
  review: ''
};

days.unshift(day);

/* 北单期号修正: 11-15 的 26117 系递增臆造, 500.com 实证当前期=26115(跨多天) */
let fixed = 0;
const d15 = days.find(x => x.date === '2026-11-15');
if (d15) {
  const fix = o => { if (o && o.issue === '26117') { o.issue = '26115'; fixed++; } };
  fix(d15.beidan310);
  for (const s of ['early', 'night', 'late']) fix(d15.slot8 && d15.slot8[s] && d15.slot8[s].beidan);
  if (d15.beidan310 && /26117/.test(d15.beidan310.note || '')) { d15.beidan310.note = d15.beidan310.note.replace(/26117/g, '26115'); fixed++; }
}

const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写入 ' + DATE + ' 池, ' + matches.length + ' 场: ' + matches.map(m => m.id).join(','));
console.log('单选 006 德国 1.72★2 / 混选 2 关约 ' + comboOdds.toFixed(1) + ' 倍 / 足彩 26165 80 元 / 💰262 / 期号修正 ' + fixed + ' 处');
