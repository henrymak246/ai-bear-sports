/* tools/_build1117.js — 2026-11-17 周二池(15 场; 幂等)
   池面: 竞彩周二001-010(001 新加坡让球-only/002 中国vs巴林/003 日本vs巴拉圭/004-009 欧国联末轮/010 智利vs哥伦比亚)
        +北单 26116 期(500.com 实证当前期)补 5 场(004 卡塔尔vs韩国/005 捷克U21/006 荷兰U21/007 爱尔兰U21/008 卢顿)。
   数据: 竞彩 jc_had/hhad/ttg/crs_1117 + 北单 bd500_1117 + 出奇 11:22 快照(_ah_1117.json)+三公司互证 _ahfund_1117.json。
   五式: 乙未日(乙木坐未土木库, 干克支=主温和; 乙干四化 天机禄/天梁权/紫微科/**太阴化忌**=忌日, 11-11 乙酉/10-28 乙亥同忌先例: 深赔热门防折);
        六爻(梅花: 年支午7+十月10+初九9=26)泽火革(九三动「征凶贞厉, 革言三就有孚」)→泽雷随(变革日忌冒进, 随顺跟势; 11-12 丙戌日革卦=冷门预警先例)。
   ★V4.12 互证: conflict 弃选级 1 场(010 智利=升盘+客低水 3/3); strong=002 巴林/005 瑞典/006 丹麦(升盘)/008 北爱/北单004 韩国 3/3/北单006 丹麦U21 3/3/北单008 卢顿; soft=003 日本/004 波黑/009 爱尔兰/北单007(禁胆单选)。
   定案: 0 胆(日本 1.57 超胆区间+soft/韩国北单场无竞彩胆通道)+1 单选级=006 丹麦 2.40★2(strong 主升盘+战意: 丹麦赢才保争头名, 挪威 H2H 优威尔士基本保三无欲)——★竞彩单关全 0(10 场 single=0), 单选只进混选不出单关产品(V4.9);
        弃选 2 场(010 conflict/北单005 none+U21); 001 让球-only 让负表达。
   今日无足彩新期(26165 停售中, 26166 未开)。
   用法: node tools/_build1117.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const bd = JSON.parse(fs.readFileSync(path.join(__dirname, 'bd500_1117.json'), 'utf8').replace(/^[^\[]*/, ''));
const bdByNum = Object.fromEntries(bd.map(b => [b.num, b]));
const had = require('./jc_had_1117.json');
const hhad = require('./jc_hhad_1117.json');
const crs = require('./jc_crs_1117.json');
const AHFUND = require('./_ahfund_1117.json');

const DATE = '2026-11-17';
if (days.some(d => d.date === DATE)) { days.splice(days.findIndex(d => d.date === DATE), 1); console.log('重建 ' + DATE + '（已移除旧版）'); }

const hadArr = had.matchList || had, hhadArr = hhad.matchList || hhad, crsArr = crs.matchList || crs;
const hadOf = num => { const x = hadArr.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const hhadOf = num => { const x = hhadArr.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const goalLineOf = num => { const x = hhadArr.find(y => y.num === num); return x ? Number(x.sp.goalLine) : null; };
const crsOf = (num, sc) => { const x = crsArr.find(y => y.num === num); const v = x && x.sp && x.sp[sc]; return v == null ? null : Number(v); };
const bdSp = num => { const b = bdByNum[num]; return b ? b.sp.map(Number) : null; };
const bdHcp = num => { const b = bdByNum[num]; return b ? Number(b.handicap) : 0; };

/* 出奇澳彩即时盘(11:22 快照) */
const AH = {
  '周二001': { g: '-4.5', name: '受四球半', home: '1.96', away: '1.82' },
  '周二002': { g: '0.5', name: '半球', home: '1.92', away: '1.86' },
  '周二003': { g: '0.75', name: '半/一', home: '1.88', away: '1.90' },
  '周二004': { g: '0.5', name: '半球', home: '1.88', away: '1.96' },
  '周二005': { g: '0.25', name: '平/半', home: '1.94', away: '1.90' },
  '周二006': { g: '0', name: '平手', home: '1.82', away: '2.02' },
  '周二007': { g: '-1.25', name: '受一/球半', home: '1.94', away: '1.90' },
  '周二008': { g: '0.5', name: '半球', home: '1.98', away: '1.86' },
  '周二009': { g: '0.25', name: '平/半', home: '1.84', away: '2.00' },
  '周二010': { g: '-0.25', name: '受平/半', home: '2.05', away: '1.73' },
  '北单004': { g: '-1', name: '受一球', home: '2.02', away: '1.76' },
  '北单005': { g: '0.25', name: '平/半', home: '1.90', away: '1.88' },
  '北单006': { g: '1.25', name: '一/球半', home: '2.01', away: '1.77' },
  '北单007': { g: '0.25', name: '平/半', home: '1.82', away: '1.96' },
  '北单008': { g: '1', name: '一球', home: '1.82', away: '1.96' }
};
const OU = {
  '周二001': { goals: '5.25', over: '1.80', under: '1.92' },
  '周二002': { goals: '2.25', over: '1.91', under: '1.81' },
  '周二003': { goals: '2.5', over: '1.92', under: '1.80' },
  '周二004': { goals: '2.5', over: '1.84', under: '1.96' },
  '周二005': { goals: '2.75', over: '1.80', under: '2.00' },
  '周二006': { goals: '3.25', over: '1.96', under: '1.84' },
  '周二007': { goals: '3', over: '1.93', under: '1.87' },
  '周二008': { goals: '2', over: '1.84', under: '1.96' },
  '周二009': { goals: '2', over: '1.80', under: '2.00' },
  '周二010': { goals: '2.25', over: '1.95', under: '1.77' },
  '北单004': { goals: '2.5', over: '1.87', under: '1.85' },
  '北单005': { goals: '2.25', over: '1.80', under: '1.92' },
  '北单006': { goals: '3.25', over: '1.91', under: '1.81' },
  '北单007': { goals: '2.5', over: '1.93', under: '1.79' },
  '北单008': { goals: '3.5', over: '1.90', under: '1.82' }
};

const M = [
  { id: '周二001', bdNum: '001', lg: '国际赛', time: '18:00', home: '新加坡', away: '巴西', d: '让负', tag: '让球', c: 1,
    sy: '让负(让球-only 展示)——竞彩仅开让+4(让负 1.70 热); 巴西表演赛性质+大轮换, 穿 4 球取决于兴致, 方向不进产品',
    n: '信息面: 邀请赛表演赛; 巴西名气温床, 深盘无方向价值。' },
  { id: '周二002', bdNum: '002', lg: '国际赛', time: '20:00', home: '中国', away: '巴林', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.8 跟互证资金)——肇庆邀请赛: 国足 11-14 2-0 马来西亚止三连败+对巴林近 5 场 2 胜 3 平不败, 但三公司半球盘 2/3 低水站巴林受让(strong 客), 友谊赛防平',
    n: '信息面: 邵佳一挂帅第二期, 吴曦回归+韦世豪落选; 巴林 FIFA97 与中国(95)实力同档, 12 强赛班底。盘口: 半球 主1.92/客1.86=资金站客队受让。' },
  { id: '周二003', bdNum: '003', lg: '国际赛', time: '21:10', home: '日本', away: '巴拉圭', d: '主胜', tag: '双选', c: 2,
    sy: '主胜双选——日本 1.57 主热+三公司半/一主低水 2/3; 伟德一球→半/一降盘=穿盘信心降(V4.12 soft: 禁胆禁单选, 方向保留主胜), 巴拉圭跨洲远征',
    n: '信息面: 麒麟挑战杯性质; 日本主场对南美队历史压制, 巴拉圭世界杯后换血。盘口: 半/一 主1.88/客1.90; 降盘+主低水=soft 降权级。' },
  { id: '周二004', bdNum: '009', lg: '欧国联', time: '03:45', home: '波黑', away: '罗马尼亚', d: '主胜', tag: '双选', c: 1,
    sy: '主胜防平(降权)——B4 末轮: 波黑 8 分锁定第 2 无欲无求, 罗马尼亚 3 分垫底求生(须赢+波兰不胜才保级); 三公司半/一→半球降盘+主低水(soft), 战意倒挂场防冷平',
    n: '信息面: 波黑哲科老核心主场告别氛围 vs 罗马尼亚 5 场 1 胜 4 负净-9; 盘口降+主低水=机构降穿盘信心但资金仍站主。' },
  { id: '周二005', bdNum: '013', lg: '欧国联', time: '03:45', home: '波兰', away: '瑞典', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.8 跟互证资金)——波兰 4 分保级生死战(罗马尼亚赢球即被反超) vs 瑞典 13 分锁定头名无欲无求; 战意全在主队但三公司低水站瑞典受让(strong 客 2/3), 不逆资金+降信心',
    n: '信息面: 波兰莱万领衔必须赢, 瑞典 4 胜 1 平锁定升 A 或大幅轮换; 资金与战意对撞=分歧场, 纪律站资金侧。' },
  { id: '周二006', bdNum: '010', lg: '欧国联', time: '03:45', home: '丹麦', away: '挪威', d: '主胜', tag: '单选', c: 2,
    sy: '单选级·主胜——A4 末轮: 丹麦 9 分必须赢保留争头名希望(葡萄牙输才有机会), 挪威 6 分凭对威尔士交锋优势基本锁第三=无欲; 三公司平手→平/半升盘+主低水(strong 主 2/3+升盘同向); ★竞彩单关未开售, 经混选表达',
    n: '信息面: 丹麦主场帕肯球场, 埃里克森体系完整; 挪威哈兰德国家队连场进球但出线无望战意打折。盘口: 平手 主1.82/客2.02, 伟德平手→平/半升盘。' },
  { id: '周二007', bdNum: '011', lg: '欧国联', time: '03:45', home: '威尔士', away: '葡萄牙', d: '客胜', tag: '双选', c: 1,
    sy: '客胜防平——葡萄牙 12 分平即锁头名+预测首发无 C 罗(大轮换), 威尔士 3 分垫底名义生死(需赢+挪威输+扳交锋劣势≈理论出局); 客 1.34 深赔不做单腿(V4.10), 乙未太阴忌+革卦=深赔防折',
    n: '信息面: 首回合葡萄牙 1-0; 威尔士 5 场仅 3 球进攻贫弱, 葡萄牙 B 队仍碾压级。盘口: 受一/球半 主1.94/客1.90, 三公司 1.5→1.25 集体退盘=穿盘信心降。' },
  { id: '周二008', bdNum: '012', lg: '欧国联', time: '03:45', home: '匈牙利', away: '北爱尔兰', d: '客胜', tag: '双选', c: 2,
    sy: '客不败(V4.8 跟互证资金)——B2 头名生死战: 匈牙利 10 分主胜即反超升 A, 北爱尔兰 11 分 5 场不败(3 胜 2 平)平即锁头名; 竞彩 1.80 主热 vs 三公司半球盘 2/3 客低水(strong 客)=分歧场按纪律站资金侧',
    n: '信息面: 匈牙利主场普斯卡什竞技场抢攻开局, 北爱铁桶+反击; 北爱本届客场两平未尝败绩。盘口: 半球 主1.98/客1.86。' },
  { id: '周二009', bdNum: '014', lg: '欧国联', time: '03:45', home: '爱尔兰', away: '科索沃', d: '主胜', tag: '双选', c: 1,
    sy: '主胜防平——B3 末轮: 奥地利 11 分锁头名, 爱尔兰 5 分主胜即反超科索沃(6 分)抢第 2(升级附加赛位), 科索沃平即保位; 三公司半球→平/半降盘+主低水 3/3(soft 降权级)',
    n: '信息面: 都柏林主场氛围+科索沃客场虫; 降盘=机构降穿盘信心, 主胜方向资金同向。' },
  { id: '周二010', bdNum: '015', lg: '国际赛', time: '07:00', home: '智利', away: '哥伦比亚', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选(V4.12 conflict)——哥伦比亚客热(365/伟德受半球→受平/半)+三公司客低水 3/3=升盘+受让低水=诱下预警, 南美友谊赛变数大',
    n: '信息面: 智利主场高原但新老交替, 哥伦比亚 J 罗回归; 盘路矛盾场不碰。' },
  { id: '北单004', bdNum: '004', lg: '国际赛', time: '21:50', home: '卡塔尔', away: '韩国', d: '客胜', tag: '双选', c: 2,
    sy: '客胜双选——三公司 3/3 全同向站韩国(受一球客低水 1.75-1.77, 伟德半/一→一球升盘)=strong 客全池最强档; 卡塔尔海湾杯后练兵, 韩国旅欧主力回归',
    n: '信息面: 多哈主场但卡塔尔 2026 后重建期; 韩国孙兴慜+李刚仁领衔。盘口: 受一球 主2.02/客1.76。' },
  { id: '北单005', bdNum: '005', lg: '欧青U21', time: '23:50', home: '捷克U21', away: '土耳其U21', d: '放弃', tag: '弃选', c: 1,
    sy: '弃选——U21 三公司平/半平水无互证信号(none), 青年队波动大+情报不足, 不碰',
    n: '信息面: 欧青 U21 资格赛; 两队实力接近, 盘口平水=无方向。' },
  { id: '北单006', bdNum: '006', lg: '欧青U21', time: '01:30', home: '荷兰U21', away: '丹麦U21', d: '客胜', tag: '双选', c: 1,
    sy: '客不败(V4.8 跟互证资金)——三公司 3/3 低水站丹麦U21 受让一/球半(客水 1.77-1.79)=strong 客 3/3; 荷兰U21 让深盘资金不信穿, U21 降信心',
    n: '信息面: 欧青 U21 资格赛; 荷兰青训名气盘 vs 丹麦 U21 务实防反。' },
  { id: '北单007', bdNum: '007', lg: '欧青U21', time: '01:45', home: '爱尔兰U21', away: '芬兰U21', d: '主胜', tag: '双选', c: 1,
    sy: '主胜防平(降权)——soft 主(半球→平/半降盘+主低水 2/3), 爱尔兰 U21 主场, 芬兰 U21 客场弱; U21+soft 双降权',
    n: '信息面: 欧青 U21 资格赛; 盘口降=穿盘信心降, 方向资金同向保留。' },
  { id: '北单008', bdNum: '008', lg: '英锦赛', time: '03:00', home: '卢顿', away: '彼得堡联', d: '主胜', tag: '双选', c: 1,
    sy: '主胜双选——英锦标赛: 卢顿(英冠)高彼得堡(英甲)两级, 三公司半/一→一球升盘+主低水(strong 主 2/3+升盘); 杯赛轮换风险降信心',
    n: '信息面: 卢顿肯尼尔沃斯路主场; 彼得堡联小组赛已出线或轮换=注意 EFL 末轮放水降权。' }
];

function mk(m) {
  const isJc = /^周二/.test(m.id);
  return {
    id: m.id, league: m.lg, time: m.time, home: m.home, away: m.away,
    direction: m.d, confidence: m.c,
    sp: isJc ? hadOf(m.id) : null,
    spHandicap: isJc ? goalLineOf(m.id) : bdHcp(m.bdNum),
    hhad: isJc ? hhadOf(m.id) : bdSp(m.bdNum),
    ah: AH[m.id] ? { goals: AH[m.id].g, name: AH[m.id].name, home: AH[m.id].home, away: AH[m.id].away } : { goals: '待补', name: '待补', home: '—', away: '—' },
    ahPick: null, ahConf: null,
    ahFund: AHFUND[m.id] || null,
    ouOdds: OU[m.id] ? { goals: OU[m.id].goals, name: OU[m.id].goals, over: OU[m.id].over, under: OU[m.id].under } : { goals: '', name: '待补', over: '—', under: '—' },
    ouPick: null, ouConf: null,
    score: [], scoreSp: [], ttgSp: null,
    synthesis: m.sy, note: m.n, dirTag: m.tag
  };
}
const matches = M.map(mk);
const byId = Object.fromEntries(matches.map(m => [m.id, m]));

/* ahPick(V4.4 不留空; 站互证资金侧, none/深盘场无星) */
const AHP = {
  '周二001': ['巴西-4.5', null], '周二002': ['巴林+0.5', 2], '周二003': ['日本-0.75', 1],
  '周二004': ['波黑-0.5', 1], '周二005': ['瑞典+0.25', 2], '周二006': ['丹麦-0', 2],
  '周二007': ['葡萄牙-1.25', null], '周二008': ['北爱尔兰+0.5', 2], '周二009': ['爱尔兰-0.25', 1],
  '周二010': ['哥伦比亚-0.25', 1],
  '北单004': ['韩国-1', 2], '北单005': ['土耳其U21+0.25', null], '北单006': ['丹麦U21+1.25', 2],
  '北单007': ['爱尔兰U21-0.25', 1], '北单008': ['卢顿-1', 1]
};
matches.forEach(m => { if (AHP[m.id]) { m.ahPick = AHP[m.id][0]; m.ahConf = AHP[m.id][1]; } });
matches.forEach(m => {
  const a = AH[m.id]; if (!a) return;
  const f = m.ahFund;
  const ftxt = f && f.side ? '三公司互证站' + f.side + '队(' + f.strength + '/3, ' + f.signal + (f.move ? ', 盘路' + f.move : '') + ')' : '无互证信号';
  m.note += '盘口: ' + a.name + ' 主' + a.home + '/客' + a.away + '; ' + ftxt + '。';
});

/* ouPick(双证收紧: 线位≤2.5+水位同向才带星) */
const OUP = {
  '周二002': ['小2.25', 2], '周二003': ['小2.5', 2],
  '周二008': ['大2', 1], '周二009': ['大2', 1], '北单006': ['小3.25', 1]
};
matches.forEach(m => { if (OUP[m.id]) { m.ouPick = OUP[m.id][0]; m.ouConf = OUP[m.id][1]; } });

/* 比分 3 场×3(展示) */
const SCORE = [
  { id: '周二006', picks: ['2:1', '2:0', '1:0'] },
  { id: '周二003', picks: ['2:0', '1:0', '2:1'] },
  { id: '周二009', picks: ['1:0', '2:1', '1:1'] }
];
const score3 = {
  result: null,
  legs: SCORE.map(s => ({
    match: s.id + ' ' + byId[s.id].home + ' vs ' + byId[s.id].away,
    pick: s.picks,
    odds: s.picks.map(p => { const v = crsOf(s.id, p); return v == null ? '—' : v.toFixed(2); }),
    result: null, finalScore: null
  })),
  note: '比分只展示不串关: 006 丹麦场单选档/003 日本场主胜档/009 爱尔兰场争二位档。'
};

/* 混选 2 关(单关全 0, 单选经混选表达; 双腿 SP≥1.5 V4.10) */
const COMBO = [
  { id: '周二006', play: '胜平负', pick: '主胜', odds: hadOf('周二006')[0], reason: '单选级: strong 主升盘+战意(赢才保争头名), 挪威无欲。' },
  { id: '周二003', play: '胜平负', pick: '主胜', odds: hadOf('周二003')[0], reason: 'soft 降权但主胜=资金同向侧(禁的是胆/单关穿盘表达, 主胜方向保留)。' }
];
const comboOdds = COMBO.reduce((n, l) => n * l.odds, 1);

/* 大小 2 串(线位 ≤2.5+低水同向双证) */
const OU_LEGS = [
  { id: '周二002', pick: '小2.25', odds: '1.81', reason: '肇庆友谊赛+小线 2.25+小水 1.81 低=双证; 国足新帅保守开局。' },
  { id: '周二003', pick: '小2.5', odds: '1.80', reason: '线 2.5+小水 1.80 低=双证; 日本控场型, 友谊赛节奏慢。' }
];
const ou2 = { result: null, legs: OU_LEGS.map(l => ({ match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null })), note: '大小 2 串(各 10 元): 002 中国场小 2.25 @1.81 + 003 日本场小 2.5 @1.80, 约 3.3 倍。' };

/* 北单腿池(按信心排名, 期号=26116, 500.com 实证当前期) */
const BD_POOL = [
  { num: '010', id: '周二006', pick: '3/1', rank: 1, conf: 3, note: '丹麦让 0 主不败: strong 主升盘+战意, 全池最干净。' },
  { num: '004', id: '北单004', pick: '1/0', rank: 2, conf: 3, note: '卡塔尔+1 场 1/0=韩国赢球: strong 客 3/3 全同向+伟德升盘。' },
  { num: '012', id: '周二008', pick: '0/1', rank: 3, conf: 2, note: '匈牙利场让 0: 北爱不败(strong 客 2/3, 头名战平即锁)。' },
  { num: '006', id: '北单006', pick: '0/1', rank: 4, conf: 2, note: '荷兰U21-1 场 0/1=丹麦U21+1 不输盘: strong 客 3/3。' },
  { num: '003', id: '周二003', pick: '3/1', rank: 5, conf: 2, note: '日本-1 场 3/1=日本赢球: 主低水 2/3, soft 降权。' },
  { num: '013', id: '周二005', pick: '0/1', rank: 6, conf: 2, note: '波兰场让 0: 瑞典不败(strong 客 2/3, 波兰生死战降权)。' },
  { num: '014', id: '周二009', pick: '3/1', rank: 7, conf: 1, note: '爱尔兰让 0 主不败: soft 主低水 3/3, 争第 2 战意。' },
  { num: '009', id: '周二004', pick: '3/1', rank: 8, conf: 1, note: '波黑让 0 主不败: soft 主低水, 但波黑无欲=风险注记。' },
  { num: '011', id: '周二007', pick: '3/1', rank: 9, conf: 1, note: '威尔士+1 场 3/1=葡萄牙赢不到 2 球: 深赔防冷腿(轮换+革卦)。' },
  { num: '015', id: '周二010', pick: '0/1', rank: 10, conf: 1, note: '智利场弃选场腿站互证资金侧: 哥伦比亚不败。' }
];
const beidan310 = {
  issue: '26116', result: null,
  legs: BD_POOL.map(l => ({
    match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
    bdNum: l.num, pick: l.pick,
    handicap: String(bdHcp(l.num)),
    sp3: bdSp(l.num), rank: l.rank, conf: l.conf, note: l.note, result: null, finalScore: null
  })),
  note: '北单 26116 期腿池(10 腿按信心排名, 实下两票=夜场 3 关+深夜 4 关); 让 0 腿所选 SP 均 ≥1.5(V4.10); 弃选场腿站互证资金侧(V4.12)。期号=500.com 实证当前期 26116(非递增臆造)。'
};

/* 梦想 3 关(展示, 弃选场不进) */
const DREAM = [
  { id: '周二003', pick: '日本 让球主胜(-1)', odds: String(hhadOf('周二003')[0]), reason: '主场压制穿盘幻想。' },
  { id: '周二009', pick: '爱尔兰 让球主胜(-1)', odds: String(hhadOf('周二009')[0]), reason: '争第 2 生死战穿盘幻想。' },
  { id: '北单008', pick: '卢顿 让球主胜(-1)', odds: String(bdByNum['008'].sp[0]), reason: '高两级+升盘穿盘幻想。' }
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
  return { issue: '26116', legs, stakes: 2 ** dbl, unit: u, cost: 2 ** dbl * u, result: null };
};
const toBd = legs => legs.map(l => ({
  bdNum: l.num, match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
  pick: l.pick, handicap: bdHcp(l.num), sp3: bdSp(l.num), note: l.note || '与方向同向', result: null
}));
const nightBdLegs = [
  { num: '002', id: '周二002', pick: '0/1', note: '跟互证资金(巴林不败)' },
  { num: '003', id: '周二003', pick: '3/1' },
  { num: '004', id: '北单004', pick: '1/0', note: '韩国赢球(3/3 全同向)' }
];
const lateBdLegs = [
  { num: '010', id: '周二006', pick: '3/1' }, { num: '012', id: '周二008', pick: '0/1', note: '跟互证资金' },
  { num: '014', id: '周二009', pick: '3/1' }, { num: '006', id: '北单006', pick: '0/1', note: '跟互证资金' }
];
const toAsian = legs => legs.map(l => ({
  id: l.id, match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, league: byId[l.id].league,
  pick: l.pick, play: '亚盘', odds: l.odds, reason: l.reason, result: null
}));
const nightAsianLegs = [
  { id: '周二002', pick: '巴林+0.5', odds: '1.86', reason: '半球盘 2/3 客低水互证; 友谊赛防平。' },
  { id: '北单004', pick: '韩国-1', odds: '1.76', reason: '三公司 3/3 全同向+伟德升盘。' }
];
const lateAsianLegs = [
  { id: '周二006', pick: '丹麦-0', odds: '1.82', reason: '平手升平/半+主低水, 战意全池最干净。' },
  { id: '周二008', pick: '北爱尔兰+0.5', odds: '1.86', reason: '半球客低水 2/3; 北爱平即锁头名。' },
  { id: '北单006', pick: '丹麦U21+1.25', odds: '1.77', reason: '受让低水 3/3 全同向。' }
];
const mkAsian = (legs, cost) => {
  const sum = legs.reduce((n, l) => n * Number(l.odds), 1);
  return { legs, cost: cost == null ? 2 : cost, totalOdds: sum.toFixed(1), result: null };
};
const nightAsianOdds = nightAsianLegs.reduce((n, l) => n * Number(l.odds), 1);
const lateAsianOdds = lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1);
const slot8 = {
  early: {
    asian: { legs: [], cost: 0, totalOdds: '0', result: null },
    beidan: { issue: '26116', legs: [], stakes: 0, unit: 2, cost: 0, result: null },
    review: '早场(12:00-17:59)无场次; 明晨 07:00 智利场弃选不出票。'
  },
  night: {
    asian: mkAsian(toAsian(nightAsianLegs), 20),
    beidan: mkBd(toBd(nightBdLegs), 3),
    review: '夜场(18:00-23:59)=新加坡(让球展示)/中国/日本/卡塔尔场/捷克U21(弃选): 亚盘 2 腿 20 元(巴林+0.5/韩国-1) + 北单 3 关 8 注×3=24 元。'
  },
  late: {
    asian: mkAsian(toAsian(lateAsianLegs), 20),
    beidan: mkBd(toBd(lateBdLegs), 2),
    review: '深夜(次日00:00-05:59)=欧国联末轮 6 场+U21 两场+英锦赛: 亚盘 3 腿 20 元(丹麦-0/北爱+0.5/丹麦U21+1.25) + 北单 4 关 16 注 32 元。'
  }
};

/* asianPool(15 腿按信心, V4.4 不留空) */
const asianPool = {
  note: '亚盘腿池(15 腿按信心排名, 出奇 11:22 三公司; 实下=夜场 2 腿 20+深夜 3 腿 20):',
  legs: [
    { rank: 1, conf: 2, play: '亚盘让球', match: '周二006 丹麦 vs 挪威', pick: '丹麦-0', odds: '1.82', note: 'strong 主升盘 2/3+伟德升盘; 丹麦赢才保争头名, 挪威无欲。', result: null },
    { rank: 2, conf: 2, play: '亚盘让球', match: '北单004 卡塔尔 vs 韩国', pick: '韩国-1', odds: '1.76', note: 'strong 客 3/3 全同向+伟德升盘。', result: null },
    { rank: 3, conf: 2, play: '亚盘让球', match: '周二008 匈牙利 vs 北爱尔兰', pick: '北爱尔兰+0.5', odds: '1.86', note: 'strong 客 2/3; 头名战北爱平即锁。', result: null },
    { rank: 4, conf: 2, play: '亚盘让球', match: '北单006 荷兰U21 vs 丹麦U21', pick: '丹麦U21+1.25', odds: '1.77', note: 'strong 客 3/3 受让低水。', result: null },
    { rank: 5, conf: 2, play: '亚盘让球', match: '周二002 中国 vs 巴林', pick: '巴林+0.5', odds: '1.86', note: 'strong 客 2/3; 友谊赛防平。', result: null },
    { rank: 6, conf: 2, play: '亚盘让球', match: '周二005 波兰 vs 瑞典', pick: '瑞典+0.25', odds: '1.90', note: 'strong 客 2/3; 波兰生死战战意风险注记。', result: null },
    { rank: 7, conf: 1, play: '亚盘让球', match: '周二003 日本 vs 巴拉圭', pick: '日本-0.75', odds: '1.88', note: 'soft 降权(降盘+主低水), 穿盘信心减。', result: null },
    { rank: 8, conf: 1, play: '亚盘让球', match: '周二009 爱尔兰 vs 科索沃', pick: '爱尔兰-0.25', odds: '1.84', note: 'soft 主低水 3/3; 争第 2 战意。', result: null },
    { rank: 9, conf: 1, play: '亚盘让球', match: '周二004 波黑 vs 罗马尼亚', pick: '波黑-0.5', odds: '1.88', note: 'soft 主低水; 波黑无欲=风险注记。', result: null },
    { rank: 10, conf: 1, play: '亚盘让球', match: '北单008 卢顿 vs 彼得堡联', pick: '卢顿-1', odds: '1.82', note: 'strong 主 2/3 升盘; 杯赛轮换风险。', result: null },
    { rank: 11, conf: 1, play: '亚盘让球', match: '北单007 爱尔兰U21 vs 芬兰U21', pick: '爱尔兰U21-0.25', odds: '1.82', note: 'soft 主; U21 降权。', result: null },
    { rank: 12, conf: 1, play: '亚盘让球', match: '周二010 智利 vs 哥伦比亚', pick: '哥伦比亚-0.25', odds: '1.73', note: '弃选场站互证资金侧(conflict=诱下预警)。', result: null },
    { rank: 13, conf: 1, play: '亚盘让球', match: '北单005 捷克U21 vs 土耳其U21', pick: '土耳其U21+0.25', odds: '1.88', note: 'none 无互证, 澳彩客微低水, 无星。', result: null },
    { rank: 14, conf: null, play: '亚盘让球', match: '周二007 威尔士 vs 葡萄牙', pick: '葡萄牙-1.25', odds: '1.90', note: 'none 无信号; 葡萄牙大轮换穿盘存疑, 无星。', result: null },
    { rank: 15, conf: null, play: '亚盘让球', match: '周二001 新加坡 vs 巴西', pick: '巴西-4.5', odds: '1.82', note: '深盘放弃清单(让 4.5 穿不穿看兴致), 无星。', result: null }
  ]
};

const plan = [
  { market: 'jc', name: '🎯 胜平负', pct: '1单选级0胆+2场弃选', result: null,
    text: '单选级=006 丹麦 2.40★2(strong 主升盘+战意: 赢才保争头名/挪威无欲)——★竞彩 10 场单关全 0(未开售), 单选只进混选不出单关产品(V4.9)。零胆: 日本 1.57 超胆区间+soft 降权/韩国为北单场无竞彩胆通道/匈牙利 1.80 资金逆。弃选 2 场=010 智利(conflict 升盘+客低水 3/3)+北单005 捷克U21(none+U21)。001 新加坡让球-only 让负表达不进产品。' },
  { market: 'jc', name: '🔵 双选方向', pct: '11双选+1单选+1让球', result: null,
    text: '双选 11 场: 主侧=003 日本/004 波黑/009 爱尔兰/北单007/北单008+006 丹麦(单选), 客侧=002 巴林/005 瑞典/007 葡萄牙/008 北爱/北单004 韩国/北单006 丹麦U21; 主 6 客 6=50% 过 V4.4 复核。001 让负展示+005/010 弃选。' },
  { market: 'jc', name: '🌏 亚洲让球', pct: '腿池15腿+两票40元', result: null,
    text: '亚盘腿池 15 腿按信心(V4.4 不留空, 深盘/none 场无星): 丹麦-0/韩国-1/北爱+0.5/丹麦U21+1.25 四★2 领衔。实下: 夜场 2 腿 20(巴林+0.5/韩国-1)+深夜 3 腿 20(丹麦-0/北爱+0.5/丹麦U21+1.25)。' },
  { market: 'jc', name: '🟣 大小盘', pct: '2串约3.3倍', result: null,
    text: '大小 2 串(各 10 元): 002 中国场小 2.25 @1.81+003 日本场小 2.5 @1.80, 线位 ≤2.5+低水同向双证; 友谊赛节奏慢。' },
  { market: 'jc', name: '🏅 比分', pct: '3场×3', result: null,
    text: '比分只展示: 006 丹麦场 2:1/2:0/1:0; 003 日本场 2:0/1:0/2:1; 009 爱尔兰场 1:0/2:1/1:1。' },
  { market: 'bd', name: '🀄 北单310', pct: '腿池10腿+两票56元', result: null,
    text: '北单 26116 期(500.com 实证当前期)腿池 10 腿按信心(010 丹麦/004 韩国/012 北爱 领衔); 实下两票: 夜场 3 关 8 注×3=24(002/003/004)+深夜 4 关 32(010/012/014/006), 全双选合规。' },
  { market: 'jc', name: '🌍 胜负彩', pct: '今日无新期', result: null,
    text: '足彩今日无新期: 26165 昨晚 22:00 停售(票已灭于第 1 腿法罗), 26166 未开; 26165 后 6 腿为今晚场(波黑/丹麦/匈牙利/爱尔兰/波兰/威尔士), 仅作记录与本池方向对照。' },
  { market: 'jc', name: '💰 投注建议', pct: '方案156元', result: null,
    text: '💰156 元(忌日减量; 日预算 300-500)=混选 2 关 40(约 ' + comboOdds.toFixed(1) + ' 倍: 丹麦×日本) + 北单两票 56(夜场 3 关 24/深夜 4 关 32) + 亚盘两票 40(夜场 2 腿 20/深夜 3 腿 20) + 大小 2 串 20。0 胆 0 单关(未开售) 2 弃选; 比分/梦想 3 关只展示。' }
];

const dayNote = '★11-17 周二池=竞彩 10 场(国际赛 4+欧国联末轮 6, 001 新加坡让球-only)+北单 26116 期补 5 场(韩国/U21×2/卢顿), 共 15 场。五式: **乙未日**(乙木坐未土木库, 干克支=主温和; 乙干四化 天机禄·天梁权·紫微科·**太阴化忌**=忌日, 11-11 乙酉/10-28 乙亥同忌先例: 深赔热门防折); 六爻(梅花 7+10+9=26)**泽火革**(九三动「征凶贞厉·革言三就有孚」)→**泽雷随**(变革日忌冒进, 随顺跟势; 11-12 丙戌革卦=冷门预警先例)。**★V4.12 互证**: conflict 拦 010 智利(升盘+客低水 3/3 弃选); strong=006 丹麦(升盘)/008 北爱/005 瑞典/002 巴林/004 韩国 3/3/006 丹麦U21 3/3/008 卢顿; soft=003 日本/004 波黑/009 爱尔兰/北单007(禁胆单选)。**结论=0 胆+1 单选级 006 丹麦 2.40★2(单关未开→混选表达)+弃选 2 场**; 无足彩新期。⚠️仅供娱乐参考, 不构成投注建议。';

const dailyPost = {
  title: '周二 15 场: 欧国联末轮第二夜, 单选丹麦背水, 韩国 3/3 全同向最稳',
  content: '今天 15 场: 晚上中国(肇庆对巴林)+日本(对巴拉圭)+韩国(客战卡塔尔)三场亚洲友谊赛, 明晨 03:45 欧国联末轮 6 场收官。头戏是丹麦 vs 挪威: 丹麦 9 分只有赢球才保留争头名希望, 挪威 6 分凭交锋优势基本锁定第三=无欲无求, 三家公司盘口平手升平/半+主低水(strong 主), 这是今天最干净的方向——可惜竞彩单关今天全场未开售, 丹麦只能经混选 2 关表达(×日本 1.57, 约 3.8 倍)。\n\n**最稳信号是韩国**: 三家公司 3/3 全部低水站韩国让一球, 伟德还从半/一升到一球, 全池唯一 3/3 全同向+升盘, 北单 004 场 1/0(韩国赢球)进两档票。\n\n**两场生死战跟资金站队**: 匈牙利 vs 北爱尔兰(B2 头名战, 匈牙利赢才反超, 北爱平即锁头名)资金 2/3 站北爱受让→客不败; 波兰 vs 瑞典(波兰保级生死战 vs 瑞典锁定头名无欲)资金站瑞典受让→客不败, 这两场战意和资金对撞, 按纪律(V4.8)不逆资金。\n\n**弃选两场**: 智利 vs 哥伦比亚(升盘+客低水 3/3=诱下预警), 捷克U21(无信号)。葡萄牙客胜 1.34 深赔+大轮换(预测首发无 C 罗)+革卦冷门预警, 只给双选客胜防平不做单腿。\n\n**方案 156 元**(忌日减量): 混选 2 关 40 + 北单两票 56 + 亚盘两票 40 + 大小 2 串 20。今天无足彩新期。\n\n仅供娱乐参考, 不构成投注建议。'
};

const betPlan = {
  total: 156,
  note: '北单为浮动 SP，全中回报以官方开奖为准；比分与梦想 3 关只展示不计投入。',
  rows: [
    { rank: 1, tier: '稳定', name: '混选 2 关', detail: '006 丹麦 主胜 2.40(单选级) / 003 日本 主胜 1.57', stake: 40, odds: comboOdds.toFixed(1), payout: (40 * comboOdds).toFixed(1) },
    { rank: 2, tier: '夜场', name: '北单 3 关', detail: '002 0/1 · 003 3/1 · 004 1/0（8 注×3 元）', stake: 24, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 3, tier: '深夜', name: '北单 4 关', detail: '010 3/1 · 012 0/1 · 014 3/1 · 006 0/1（16 注×2 元）', stake: 32, odds: '浮动 SP', payout: '以官方为准' },
    { rank: 4, tier: '夜场', name: '亚盘 2 腿', detail: '巴林+0.5 / 韩国-1', stake: 20, odds: nightAsianOdds.toFixed(1), payout: (20 * nightAsianOdds).toFixed(1) },
    { rank: 5, tier: '深夜', name: '亚盘 3 腿', detail: '丹麦-0 / 北爱尔兰+0.5 / 丹麦U21+1.25', stake: 20, odds: lateAsianOdds.toFixed(1), payout: (20 * lateAsianOdds).toFixed(1) },
    { rank: 6, tier: '增强', name: '大小 2 串', detail: '002 小 2.25 / 003 小 2.5', stake: 20, odds: '3.3', payout: '65.2' }
  ]
};

const day = {
  date: DATE,
  dayPillar: '丙午年·己亥月·乙未日',
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
  bank: { stake: 156, ret: null, net: null },
  review: ''
};

days.unshift(day);

const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写入 ' + DATE + ' 池, ' + matches.length + ' 场: ' + matches.map(m => m.id).join(','));
console.log('混选 2 关约 ' + comboOdds.toFixed(1) + ' 倍(丹麦×日本) / 北单 26116 两票 56 / 亚盘两票 40 / 大小 20 / 💰156 / 无足彩新期');
