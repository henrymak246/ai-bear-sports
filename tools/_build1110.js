/* tools/_build1110.js — 2026-11-10 周二池(英锦标赛末轮 12 场; 幂等)
   数据: sporttery jc_hhad/had/crs 周二001-002 + bd500_1110 北单001-012 + ESPN eng.trophy 小组赛战绩/英甲英乙排名。
   五式: 甲申日(11-11 03:00 开球), 甲木得亥月生扶、申金七杀克干=客侧得利; 六爻水天需→水泽节(等待/节制); 零胆零单选, 小池低仓。
   用法: node tools/_build1110.js */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const bd = JSON.parse(fs.readFileSync(path.join(__dirname, '_bd1110.txt'), 'utf8').replace(/^[^\[]*/, ''));
const bdByNum = Object.fromEntries(bd.map(b => [b.num, b]));
const hhad = require('../tmp/jc_hhad_1110.json');
const had = require('../tmp/jc_had_1110.json');
const crs = require('../tmp/jc_crs_1110.json');

const DATE = '2026-11-10';
if (days.some(d => d.date === DATE)) { days.splice(days.findIndex(d => d.date === DATE), 1); console.log('重建 ' + DATE + '（已移除旧版）'); }

function spOf(num, score) { const c = crs.find(x => x.num === num); const v = c && c.sp && c.sp[score]; return v == null ? null : Number(v); }
function hhadOf(num) { const h = hhad.find(x => x.num === num); return h ? [Number(h.sp.h), Number(h.sp.d), Number(h.sp.a)] : null; }
function hadOf(num) { const h = had.find(x => x.num === num); return h ? [Number(h.sp.h), Number(h.sp.d), Number(h.sp.a)] : null; }
function bdLine(num) { const b = bdByNum[num]; return b ? Number(b.handicap) : 0; }
function bdSp(num) { const b = bdByNum[num]; return b ? b.sp.map(Number) : null; }

// 小组赛战绩(ESPN eng.trophy, 已赛2轮): 胜-平-负 → 积分(EFL Trophy 点球胜2分/点球负1分口径按官方为主, 此处只用战意定性)
// 英甲/英乙联赛排名也来自 ESPN standings(11-10 快照)
const M = [
  // 北单001 巴尼特(英乙2) vs 莱顿东方(英甲14)
  { id: '北单001', bdNum: '001', league: '英锦标赛', time: '02:50', home: '巴尼特', away: '莱顿东方', d: '主胜', ap: '巴尼特0', op: '小2.5', s: '1:1', sy: '主不败——巴尼特英乙第2且小组4分, 主场只需1分锁定出线; 莱顿东方英甲第14、小组仅1分但联赛保级压力更大', n: '信息面: 小组=巴尼特1胜1平4分/莱顿0胜1平1负; 联赛=英乙2 vs 英甲14; 战意=主队稳出线、客队须胜但联赛优先; 轮换=杯赛末轮双方均可能轮换。' },
  // 北单002 布里斯托尔流浪者(英乙17) vs 雷丁(英甲6)
  { id: '北单002', bdNum: '002', league: '英锦标赛', time: '02:50', home: '布里斯托尔流浪者', away: '雷丁', d: '客胜', ap: '雷丁0', op: '小2.5', s: '0:1', sy: '客不败——雷丁英甲第6、小组1分必须取胜, 布流浪英乙第17且防守漏; 平手盘客队水位低', n: '信息面: 小组=双方各1分; 联赛=英乙17 vs 英甲6; 战意=客队须胜; 轮换=雷丁周末有联赛, 但出线权重要。' },
  // 竞彩周二001 / 北单003 伯顿 vs 诺茨郡
  { id: '周二001', bdNum: '003', league: '英锦标赛', time: '03:00', home: '伯顿', away: '诺茨郡', d: '主胜', ap: '伯顿0', op: '大2.5', s: '1:1', sy: '主不败——诺茨郡小组2胜6分已出线必然轮换, 伯顿2分主场需分; 竞彩开主让1球属官方盘口而非实力盘', n: '信息面: 小组=伯顿2分/诺茨郡2胜6分已出线; 联赛=英甲15 vs 英甲17; 战意=主队需分、客队无欲; 轮换=诺茨郡大幅轮换是主队机会。' },
  // 北单004 克鲁(英乙4) vs 维冈(英甲21)
  { id: '北单004', bdNum: '004', league: '英锦标赛', time: '02:50', home: '克鲁', away: '维冈竞技', d: '主胜', ap: '克鲁0', op: '小2.5', s: '1:0', sy: '主不败——维冈英甲倒数第4、小组6分已出线; 克鲁英乙第4且小组4分主场只需要1分', n: '信息面: 小组=克鲁4分/维冈6分已出线; 联赛=英乙4 vs 英甲21; 战意=主队需分、客队保级优先; 轮换=维冈英甲保级压力大。' },
  // 北单005 莱斯特城(英甲10) vs 沃尔索尔(英乙3)
  { id: '北单005', bdNum: '005', league: '英锦标赛', time: '02:50', home: '莱斯特城', away: '沃尔索尔', d: '主胜', ap: '莱斯特城-1', op: '大2.5', s: '2:0', sy: '主胜——莱斯特城英甲第10、小组3分主场必须拿分; 沃尔索尔英乙第3但跨级对抗, 北单让1球SP1.28偏深只作方向', n: '信息面: 小组=双方各3分; 联赛=英甲10 vs 英乙3; 战意=双方都要分; 深热=让1球1.28禁胆, 只走方向。' },
  // 北单006 曼斯菲尔德(英甲11) vs 切斯特菲尔德(英乙10)
  { id: '北单006', bdNum: '006', league: '英锦标赛', time: '02:50', home: '曼斯菲尔德', away: '切斯特菲尔德', d: '客胜', ap: '切斯特菲尔德0', op: '小2.5', s: '1:2', sy: '客不败——曼斯菲尔德小组2负0分已淘汰, 英甲第11但杯赛无欲; 切斯特菲尔德4分需分, 平手盘客队方向', n: '信息面: 小组=曼斯菲尔德0分已淘汰/切斯特菲尔德4分; 联赛=英甲11 vs 英乙10; 战意=客队需胜、主队轮换。' },
  // 北单007 北安普顿(英乙21) vs 吉林汉姆(英乙8)
  { id: '北单007', bdNum: '007', league: '英锦标赛', time: '02:50', home: '北安普顿', away: '吉林汉姆', d: '客胜', ap: '吉林汉姆0', op: '小2.5', s: '0:1', sy: '客不败——北安普顿英乙第21、小组2负0分已淘汰; 吉林汉姆英乙第8、小组3分需分, 状态与战意双优', n: '信息面: 小组=北安0分已淘汰/吉林汉姆3分; 联赛=英乙21 vs 英乙8; 战意=客队需胜、主队垫底轮换。' },
  // 北单008 牛津联(英甲3) vs 切尔滕汉姆(英乙5)
  { id: '北单008', bdNum: '008', league: '英锦标赛', time: '02:50', home: '牛津联', away: '切尔滕汉姆', d: '主胜', ap: '牛津联-1', op: '大2.5', s: '2:0', sy: '主胜——牛津联英甲第3、小组1分主场必须取胜; 切尔滕汉姆英乙第5但跨级, 北单让2球SP1.21=超深热不碰让球盘', n: '信息面: 小组=牛津联1分/切尔滕2分; 联赛=英甲3 vs 英乙5; 战意=双方都要分; 深热=让2球1.21禁胆且让球盘不碰, 只走胜平负方向。' },
  // 北单009 普利茅斯(英甲5) vs 斯文登(英乙13)
  { id: '北单009', bdNum: '009', league: '英锦标赛', time: '02:50', home: '普利茅斯', away: '斯文登', d: '主胜', ap: '普利茅斯-1', op: '大2.5', s: '2:1', sy: '主胜——普利茅斯英甲第5、小组4分争头名; 斯文登英乙第13、小组2负0分已淘汰', n: '信息面: 小组=普利茅斯4分/斯文登0分已淘汰; 联赛=英甲5 vs 英乙13; 战意=主队争头名、客队已淘汰。' },
  // 北单010 斯托克波特郡(英甲2) vs 特兰米尔(英乙11)
  { id: '北单010', bdNum: '010', league: '英锦标赛', time: '02:50', home: '斯托克波特郡', away: '特兰米尔流浪者', d: '主胜', ap: '斯托克波特郡-1', op: '大2.5', s: '2:1', sy: '主不败——斯托克波特英甲第2、小组2胜6分已出线会轮换; 特兰米尔英乙第11、小组3分需分, 平局风险保留', n: '信息面: 小组=斯托克波特6分已出线/特兰米尔3分; 联赛=英甲2 vs 英乙11; 战意=主队无欲轮换、客队需分; 防平。' },
  // 北单011 布拉德福德城(英甲7) vs 约克城(英乙7)
  { id: '北单011', bdNum: '011', league: '英锦标赛', time: '03:20', home: '布拉德福德城', away: '约克城', d: '主胜', ap: '布拉德福德城-0.5', op: '小2.5', s: '1:0', sy: '主不败——布拉德福德英甲第7、小组2胜6分已出线轮换; 约克城英乙第7、小组1分需胜; 主队轮换幅度决定上限', n: '信息面: 小组=布拉德福德6分已出线/约克城1分; 联赛=英甲7 vs 英乙7; 战意=客队需胜、主队轮换; 防平。' },
  // 竞彩周二002 / 北单012 布罗姆利(英乙24) vs 米尔顿凯恩斯(英甲12)
  { id: '周二002', bdNum: '012', league: '英锦标赛', time: '03:30', home: '布罗姆利', away: '米尔顿凯恩斯', d: '客胜', ap: '米尔顿凯恩斯-1', op: '小2.5', s: '0:2', sy: '客不败——布罗姆利英乙垫底第24、小组2负0分已淘汰; 米尔顿英甲第12、小组2胜6分已出线会轮换, 客让1球只走方向', n: '信息面: 小组=布罗姆利0分已淘汰/米尔顿6分已出线; 联赛=英乙24 vs 英甲12; 战意=客队无欲、主队垫底; 轮换=客队大幅轮换, 客胜不稳取双选。' }
];

function mk(m) {
  const line = bdLine(m.bdNum);
  const bsp = bdSp(m.bdNum);
  const hh = hadOf(m.id);
  // 竞彩场次: sp=胜平负(had), hhad=让球盘; 北单-only 场次: 只有让球盘, sp 留空让页面走"让球-only"口径
  const isJc = !!hh;
  const item = {
    id: m.id, league: m.league, time: m.time, home: m.home, away: m.away,
    direction: m.d, confidence: 1,
    sp: isJc ? hh : null,
    spHandicap: isJc ? Number((hhad.find(x => x.num === m.id) || { sp: { line: line } }).sp.line) : line,
    hhad: isJc ? hhadOf(m.id) : bsp,
    ah: { goals: '待补', name: '待补', home: '—', away: '—' },
    ahPick: m.ap, ahConf: 1,
    ouOdds: { goals: '', name: '待补', over: '—', under: '—' },
    ouPick: m.op, ouConf: 1,
    score: [m.s], scoreSp: [spOf(m.id, m.s)],
    ttgSp: null,
    synthesis: m.sy, note: m.n,
    dirTag: '双选'
  };
  if (m.id === '周二001') { item.score = ['1:1', '0:1']; item.scoreSp = [spOf('周二001', '01:01'), spOf('周二001', '00:01')]; }
  if (m.id === '周二002') { item.score = ['0:2', '0:1']; item.scoreSp = [spOf('周二002', '00:02'), spOf('周二002', '00:01')]; }
  return item;
}

const matches = M.map(mk);
const day = {
  date: DATE,
  dayPillar: '丙午年·己亥月·甲申日',
  dayNote: '★11-10 周二池=英锦标赛(EFL Trophy)末轮 12 场, 全部北京时间 11-11 02:50-03:30 开球。五式: **甲申日**甲木得亥月生扶(主队基础不弱), 申金七杀克干=**客侧得利**, 甲己合土=主队节奏被牵制; 六爻**水天需→水泽节**(等待、节制, 不宜重仓); 六壬申亥相害=局中多变、末段见分晓。**结论=零胆零单选, 12 场全双选, 小池低仓**。核心变量是杯赛末轮战意: 已出线的诺茨郡/维冈/斯托克波特/布拉德福德/米尔顿大概率轮换, 已淘汰的曼斯菲尔德/北安普顿/斯文登/布罗姆利无欲无求, 真正需要分数的 002/004/006/007/008/009 是本池主线。深热让球盘(008 让2球1.21/005 让1球1.28)只作方向不作投注依据。⚠️仅供娱乐参考, 不构成投注建议。',
  matches: matches,
  dailyPost: null,
  plan: [
    { market: 'jc', name: '🎯 胜平负', pct: '0胆0单选', result: null, text: '12 场全双选: 主不败=001/003/004/006(客)/010/011, 客不败=002/007/008? 见逐场。忌日纪律: 杯赛末轮轮换不可测, 不出胆不单选; 深热让球盘 005/008 不碰。' },
    { market: 'jc', name: '🔵 双选方向', pct: '12场全覆盖', result: null, text: '主侧 7 场 / 客侧 5 场; 战意主线=需分队(002 雷丁/004 克鲁/006 切斯特菲尔德/007 吉林汉姆/008 牛津联/009 普利茅斯), 轮换主线=已出线强队对手(003 伯顿/010 特兰米尔方向)。' },
    { market: 'jc', name: '🌏 亚洲让球', pct: '4关≈?', result: null, text: 'asian7 4 关待盘口补齐: 001 巴尼特0 / 004 克鲁0 / 006 切斯特菲尔德0 / 012 米尔顿-1; 出奇盘口 09:08 快照, 赛前复核。' },
    { market: 'jc', name: '🟣 大小盘', pct: '2串', result: null, text: '大小 2 串: 005 莱斯特场大2.5(英甲攻强) + 011 布拉德福德场小2.5(轮换+低战意); 其余场次只做方向。' },
    { market: 'jc', name: '🏅 比分', pct: '2场×2', result: null, text: '比分只展示: 001 巴尼特场 1:1/0:0; 006 曼斯菲尔德场 1:2/0:1。' },
    { market: 'bd', name: '🀄 北单310', pct: '4关16注32元', result: null, text: '北单 4 关双选 16 注 32 元: 002 雷丁(1/0) + 006 切斯特菲尔德(1/0) + 007 吉林汉姆(1/0) + 012 米尔顿(1/0), 全平手/受让且与方向同向。' },
    { market: 'jc', name: '🌍 胜负彩', pct: '无新期', result: null, text: '周二无胜负彩期次(足彩周五/六/日开售), 本期不挂。' },
    { market: 'jc', name: '💰 投注建议', pct: '方案36元', result: null, text: '💰36元(远低于138元上限)=稳定0元(无合规胆)+增强4元(asian7 2元+大小2串2元)+北单32元。小池+轮换不可测, 主动降仓; 比分/梦想7关只展示不投入。' }
  ],
  slot8: null,
  dream7: null,
  asian7: {
    play: '混编', totalOdds: '待盘口', result: null,
    legs: [
      { match: '001 巴尼特 vs 莱顿东方', league: '英锦标赛', pick: '巴尼特0', play: '亚盘', odds: '—', reason: '小组4分主场只需1分; 英乙第2对英甲第14。', result: null, finalScore: null },
      { match: '004 克鲁 vs 维冈竞技', league: '英锦标赛', pick: '克鲁0', play: '亚盘', odds: '—', reason: '维冈已出线且英甲保级, 克鲁主场需分。', result: null, finalScore: null },
      { match: '006 曼斯菲尔德 vs 切斯特菲尔德', league: '英锦标赛', pick: '切斯特菲尔德0', play: '亚盘', odds: '—', reason: '主队0分已淘汰, 客队4分需胜。', result: null, finalScore: null },
      { match: '012 布罗姆利 vs 米尔顿凯恩斯', league: '英锦标赛', pick: '米尔顿凯恩斯-1', play: '亚盘', odds: '—', reason: '英乙垫底对英甲中游, 客队即便轮换仍占优。', result: null, finalScore: null }
    ],
    note: 'asian7 4 关, 盘口与水位待出奇补齐后复核; 小池只做 4 腿不硬凑 8 腿。'
  },
  ou2: {
    result: null,
    legs: [
      { match: '005 莱斯特城 vs 沃尔索尔', pick: '大2.5', odds: '—', reason: '英甲对英乙, 双方都要分且防线一般。', result: null, finalScore: null },
      { match: '011 布拉德福德城 vs 约克城', pick: '小2.5', odds: '—', reason: '主队已出线轮换、客队客场保守, 低战意。', result: null, finalScore: null }
    ],
    note: '大小 2 串, 赔率待补; 英锦标赛末轮大球风险来自轮换后防线混乱, 只做 2 腿。'
  },
  score3: {
    result: null,
    legs: [
      { match: '001 巴尼特 vs 莱顿东方', pick: ['1:1', '0:0'], odds: ['6.0', '8.5'], result: null, finalScore: null },
      { match: '006 曼斯菲尔德 vs 切斯特菲尔德', pick: ['1:2', '0:1'], odds: ['8.0', '6.5'], result: null, finalScore: null }
    ],
    note: '比分只展示不串关; 英锦标赛轮换大, 比分精度低。'
  },
  beidan310: {
    issue: '26114',
    result: null,
    legs: [
      { match: '002 布里斯托尔流浪者 vs 雷丁', bdNum: '002', pick: '1/0', handicap: '0', sp3: bdSp('002'), note: '雷丁须胜, 客不败。', result: null, finalScore: null },
      { match: '006 曼斯菲尔德 vs 切斯特菲尔德', bdNum: '006', pick: '1/0', handicap: '0', sp3: bdSp('006'), note: '主队已淘汰, 客队需分。', result: null, finalScore: null },
      { match: '007 北安普顿 vs 吉林汉姆', bdNum: '007', pick: '1/0', handicap: '0', sp3: bdSp('007'), note: '主队垫底已淘汰, 客队需分。', result: null, finalScore: null },
      { match: '012 布罗姆利 vs 米尔顿凯恩斯', bdNum: '012', pick: '1/0', handicap: '+1', sp3: bdSp('012'), note: '客队出线轮换, 受让1球防平。', result: null, finalScore: null }
    ],
    note: '北单 26114 期 4 关全双选 16 注 32 元, 与方向层同向; 官方 SP 为准。'
  },
  zucai310: null,
  review: ''
};

days.unshift(day);
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写入 ' + DATE + ' 池, ' + matches.length + ' 场: ' + matches.map(m => m.id).join(','));
