/* tools/_build1112.js — 2026-11-12 周四池(11 场; 幂等)
   池面: 欧国联 2026-27 第 5 轮 7 场(土耳其/比利时、亚美尼亚/塞浦路斯、捷克/西班牙、阿尔巴尼亚/芬兰、黑山/拉脱维亚、圣马力诺/白俄罗斯、英格兰/克罗地亚, 均 11-13 01:00-03:45)
        + 巴西乙末轮 2 场(庞特普雷塔/铁路工人、圣贝尔纳多/巴西竞技, 11-13 06:00-07:00)
        + 阿根廷超级杯决赛 1 场(大学生/门多萨独立, 11-13 07:00) + CONCACAF Nations League 八强首回合 1 场(库拉索/巴拿马, 11-13 08:30)。
   数据: 竞彩 jc_had/hhad/ttg/crs_1112(周四001-006) + 北单 bd500_1112(021-031) + 澳彩 _ah_1112.json(10:08 单点, 开盘快照未覆盖本批赛事)。
   信息面: ESPN uefa.nations standings(4轮) + ESPN 赛前预览(Sports Mole) + TyC/维基(阿超杯/CNL) + ESPN bra.2 standings。
   五式: 丙戌日(丙火坐戌土=干生支, 主队得利温和; 丙干四化 天同禄/天机权/文昌科/廉贞忌); 六爻泽火革→泽山咸(变革/冷门预警)。
   用法: node tools/_build1112.js
*/
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const bd = JSON.parse(fs.readFileSync(path.join(__dirname, 'bd500_1112.json'), 'utf8').replace(/^[^\[]*/, ''));
const bdByNum = Object.fromEntries(bd.map(b => [b.num, b]));
const had = require('./jc_had_1112.json');
const hhad = require('./jc_hhad_1112.json');
const crs = require('./jc_crs_1112.json');
const ahSrc = require('./_ah_1112.json');

const DATE = '2026-11-12';
if (days.some(d => d.date === DATE)) { days.splice(days.findIndex(d => d.date === DATE), 1); console.log('重建 ' + DATE + '（已移除旧版）'); }

const hadOf = num => { const x = had.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const hhadOf = num => { const x = hhad.find(y => y.num === num); return x ? [Number(x.sp.h), Number(x.sp.d), Number(x.sp.a)] : null; };
const goalLineOf = num => { const x = hhad.find(y => y.num === num); return x ? Number(x.sp.goalLine) : null; };
const crsOf = (num, sc) => { const x = crs.find(y => y.num === num); const v = x && x.sp && x.sp[sc]; return v == null ? null : Number(v); };
const bdSp = num => { const b = bdByNum[num]; return b ? b.sp.map(Number) : null; };
const bdHcp = num => { const b = bdByNum[num]; return b ? Number(b.handicap) : 0; };
const ahOf = label => (ahSrc[label] && ahSrc[label].ah) || null;
const ouOf = label => {
  const o = ahSrc[label] && ahSrc[label].ou;
  return o ? { goals: String(o.line), name: String(o.line), over: o.over, under: o.under } : null;
};

/* 池内 11 场: 竞彩场次用周四00x, 北单-only 用北单02x */
const M = [
  { id: '周四001', bdNum: '021', lg: '欧国联', time: '01:00', home: '土耳其', away: '比利时', d: '放弃', tag: '弃选', c: 1,
    ap: '土耳其+0.75', op: '小3.25',
    sy: '弃选(方向)——基本面原本看比利时客胜(必须赢+De Bruyne回归), 但澳彩受半/一主水 1.80/客 2.04=资金站受让方土耳其, 方向与资金相反 ⇒ 按 V4.8 只留亚盘腿, 方向不做。',
    n: '信息面: A1=法国10/意大利7/比利时6/土耳其0(4战全败, 进2失11); 比利时伤停=库尔图瓦休战、Lavia 停赛, 但中前场主力回归; 土耳其=新帅 Yalçın 首战、Yıldız/Bardakçı 缺阵。盘口: 受半/一 主水1.80/客2.04=资金站土耳其(受让方); 竞彩让球+1 主1.94/客2.77。★弃选原因: 让球盘低水不等于胜平负资金, 两套口径冲突时按 V4.8 不出方向。' },
  { id: '周四002', bdNum: '022', lg: '欧国联', time: '01:00', home: '亚美尼亚', away: '塞浦路斯', d: '客胜', tag: '双选', c: 1,
    ap: '塞浦路斯+0.25', op: '小2.5',
    sy: '客不败——资金与基本面同向: 塞浦路斯 7 分争头名、近两轮连胜, 澳彩平/半客水 1.79 低(资金站客); 亚美尼亚 4 分必须赢但 Spertsyan 等 4 人伤缺、8 次交手仅 1 胜',
    n: '信息面: C2=黑山10/塞浦路斯7/亚美尼亚4/拉脱维亚1; 亚美尼亚缺 Spertsyan(跟腱)+4人伤缺; 塞浦路斯 Pileas 停赛、两门将伤缺, 但 Marcus Edwards 领衔进攻、近两轮连胜。盘口: 平/半 主2.05/客1.79=资金站客(与方向同向)。★按 V4.8 由原主胜改跟资金侧。' },
  { id: '周四006', bdNum: '023', lg: '欧国联', time: '03:45', home: '捷克', away: '西班牙', d: '放弃', tag: '弃选', c: 1,
    ap: '捷克+2', op: '大3.25',
    sy: '弃选(方向)——基本面原本看西班牙客胜(争头名), 但澳彩受两球主水 1.86/客 1.98=资金站受让方捷克, 方向与资金相反 ⇒ 按 V4.8 只留亚盘腿(捷克+2)与大小球, 方向不做。',
    n: '信息面: A3=西班牙12(4胜)/英格兰9/克罗地亚3/捷克0; 西班牙缺 亚马尔(右膝发炎)、奥亚萨瓦尔(流感), 预计半轮换仍强; 捷克 Sadílek 停赛、Krejčí 复出, 近 7 场 6 负。盘口: 受两球 主1.86/客1.98=资金站捷克; 竞彩让球+2 主2.37/客2.19。★西班牙让两球仍被买低水, 属深盘定价噪声, 不据此做方向, 直接弃选。' },
  { id: '周四003', bdNum: '024', lg: '欧国联', time: '03:45', home: '阿尔巴尼亚', away: '芬兰', d: '放弃', tag: '弃选', c: 1,
    ap: '芬兰+0.5', op: '小2',
    sy: '弃选(方向)——基本面原本看阿尔巴尼亚主胜(赢球锁头名), 但澳彩半球主水 1.98/客 1.86=资金站客队芬兰, 方向与资金相反 ⇒ 按 V4.8 只留亚盘受让腿(芬兰+0.5), 方向不做。',
    n: '信息面: C1=阿尔巴尼亚9/芬兰7/白俄罗斯7/圣马力诺0; 阿尔巴尼亚主帅 Maran, Manaj 本届 2 球、门将 Berisha 复出; 芬兰上轮 0-1 负白俄罗斯、客场近 10 场 7 负。盘口: 半球 主1.98/客1.86=资金站客(与基本面相反); 竞彩让球-1 主3.82/客1.77。★双方都要赢的 6 分战但资金偏客, 按 V4.8 弃选方向。' },
  { id: '周四004', bdNum: '025', lg: '欧国联', time: '03:45', home: '黑山', away: '拉脱维亚', d: '主胜', tag: '单选', c: 1,
    ap: '黑山-1.5', op: '大2.5',
    sy: '主胜——黑山 10 分已保证前二, 赢球+塞浦路斯失分即提前锁头名, 近 4 场不败(W3D1); 拉脱维亚 1 分垫底升级无望, Varslavāns 赛季报销',
    n: '信息面: C2=黑山10(3胜1平)/塞浦路斯7/亚美尼亚4/拉脱维亚1; 黑山缺 Lončar(停赛), Adžić 本届 2 球; 拉脱维亚近两窗口 3 负 1 平。⚠️历史: 黑山主场对拉脱维亚最近两次均打平(14 年 5 次交手 3胜2平不败), 深热防平, 只给 ★1 单选。盘口: 球半 1.92/1.92 平水; 竞彩让球-1 主1.78/客3.48。' },
  { id: '北单026', bdNum: '026', lg: '欧国联', time: '03:45', home: '圣马力诺', away: '白俄罗斯', d: '客胜', tag: '双选', c: 1,
    ap: '白俄罗斯-2', op: '大2.75',
    sy: '客不败——白俄罗斯 7 分第二, 赢球有望登顶(需阿尔巴尼亚失分), 连续 3 场零封、近 10 场各项仅 1 负, 首回合 4-0; 圣马力诺 0 分 4 战丢 16 球',
    n: '信息面: C1=阿尔巴尼亚9/芬兰7/白俄罗斯7/圣马力诺0; 白俄缺 Shumanskiy/Barkovskiy 双双停赛, 但实力差距仍大; 圣马力诺 10-06 客场仅 1-2 负阿尔巴尼亚(补时点球)有一定韧性。注意: 白俄主场实设布达佩斯, 本场为客场。盘口: 受两球 2.00/1.84=资金站白俄-2。' },
  { id: '周四005', bdNum: '027', lg: '欧国联', time: '03:45', home: '英格兰', away: '克罗地亚', d: '主胜', tag: '双选', c: 1,
    ap: '英格兰-1.75', op: '大3.25',
    sy: '主不败——英格兰 9 分, 赢球即锁定前二/QF 席位, 温布利主场; 克罗地亚 3 分保 A 级动机强但佩里西奇停赛+5 人伤缺(Šutalo/Pongračić/Kramarić/Ivanović/Jakić)',
    n: '信息面: A3=西班牙12/英格兰9/克罗地亚3/捷克0; 英格兰伤停一串=帕尔默未入选、格伊伤、孔萨个人训练、Lewis-Skelly 停赛, Reece James/Saka/Rashford 伤; 克罗地亚 41 岁 Modrić 第 207 帽、Bilić 明确保 A 级。盘口: 球半/两球 主1.90/客1.94; 竞彩让球-2 主2.66/客2.00。' },
  { id: '北单028', bdNum: '028', lg: '巴西乙', time: '06:00', home: '庞特普雷塔', away: '蓬塔格罗萨铁路工人', d: '放弃', tag: '弃选', c: 1,
    ap: '庞特普雷塔+1', op: '小2.75',
    sy: '弃选(方向)——巴西乙末轮双方无欲(主队 15 分垫底已降级、客队 54 分中游), 且澳彩受一球主水 1.79/客 1.91=资金站主队, 与基本面(客队实力占优)相反 ⇒ 按 V4.8 只留亚盘受让腿。',
    n: '信息面: 巴西乙第38轮(末轮)=庞特普雷塔20名15分(已降级, 净胜球-58)/铁路工人10名54分(升级无望、保级无忧); 双方均无目标。盘口: 受一球 主1.79/客1.91=资金站主队。★dead rubber + 资金反向, 方向弃选。' },
  { id: '北单029', bdNum: '029', lg: '阿根廷超级杯', time: '07:00', home: '拉普拉塔大学生', away: '门多萨独立', d: '客胜', tag: '双选', c: 1,
    ap: '门多萨独立+0.25', op: '小2',
    sy: '客不败——阿根廷超级杯决赛(单场), 大学生 11-28 解放者杯决赛要留力且 Correa/Castro 两攻击手伤缺、近 5 场 0 胜; 门多萨独立 10 天后季后赛需保节奏, 争队史第二冠动力更足',
    n: '信息面: 赛事=Supercopa Argentina 决赛(非阿甲联赛轮次), 中立场科尔多瓦; 大学生=克劳苏拉未进 8 强、11-28 解放者杯决赛; 门多萨独立=第 8 种子进季后赛。盘口: 平/半 主1.97/客1.82=资金站客(与方向同向)。' },
  { id: '北单030', bdNum: '030', lg: '巴西乙', time: '07:00', home: '圣贝尔纳多', away: '巴西竞技', d: '放弃', tag: '弃选', c: 1,
    ap: '巴西竞技+0.5', op: '小2.5',
    sy: '弃选(方向)——巴西乙末轮双方均已安全(圣贝尔纳多 52 分/巴西竞技 47 分), 且澳彩半球主水 1.88/客 1.82=资金站客队, 与基本面(主队主场体面)相反 ⇒ 按 V4.8 只留亚盘受让腿(巴西竞技+0.5)。',
    n: '信息面: 巴西乙第38轮=圣贝尔纳多11名52分/巴西竞技14名47分(数学保级); 4 个降级名额已定 3 席。双方无目标。盘口: 半球 主1.88/客1.82=资金站客。★dead rubber + 资金反向, 方向弃选。' },
  { id: '北单031', bdNum: '031', lg: '中北美国家联赛', time: '08:30', home: '库拉索', away: '巴拿马', d: '主胜', tag: '双选', c: 1,
    ap: '库拉索+0.25', op: '小2.25',
    sy: '主不败——CNL 八强首回合, 库拉索小组 10 分最佳第一 + 主场不败 + 近 5 场 3 胜; 巴拿马纸面更强但自 6 月后无正式比赛(近 5 场 3平2负), 首回合客场',
    n: '信息面: CONCACAF Nations League League A 八强首回合(次回合 11-15 移师巴拿马), 胜者进 4 强+直通 2027 金杯; 库拉索小组 3胜1平10分最佳第一, 巴拿马为 4 号种子; 库拉索缺 3 人(Margaritha/Antonisse/Floranus)。盘口: 受平/半 主1.77/客2.01=资金站主队(与方向同向)。' }
];

function mk(m) {
  const isJc = /^周四/.test(m.id);
  const line = isJc ? goalLineOf(m.id) : bdHcp(m.bdNum);
  const item = {
    id: m.id, league: m.lg, time: m.time, home: m.home, away: m.away,
    direction: m.d, confidence: m.c,
    sp: isJc ? hadOf(m.id) : null,
    spHandicap: line,
    hhad: isJc ? hhadOf(m.id) : bdSp(m.bdNum),
    ah: ahOf('北单' + m.bdNum.replace(/^0/, '')), // 出奇盘口键统一是北单编号(竞彩6场与北单021-027同场)
    ahPick: m.ap, ahConf: m.c,
    ouOdds: ouOf('北单' + m.bdNum.replace(/^0/, '')),
    ouPick: m.op, ouConf: m.c,
    score: [], scoreSp: [],
    ttgSp: null,
    synthesis: m.sy, note: m.n, dirTag: m.tag
  };
  item.ah = item.ah || { goals: '待补', name: '待补', home: '—', away: '—' };
  item.ouOdds = item.ouOdds || { goals: '', name: '待补', over: '—', under: '—' };
  return item;
}

const matches = M.map(mk);
const byId = Object.fromEntries(matches.map(m => [m.id, m]));

/* 比分(3 场 × 3 项, 只展示) */
const SCORE = [
  { id: '周四005', picks: ['2:0', '2:1', '3:0'] },
  { id: '周四004', picks: ['2:0', '3:0', '1:0'] },
  { id: '周四002', picks: ['0:1', '1:1', '1:0'] }
];
const score3 = {
  result: null,
  legs: SCORE.map(s => ({
    match: s.id + ' ' + byId[s.id].home + ' vs ' + byId[s.id].away,
    pick: s.picks,
    odds: s.picks.map(p => { const v = crsOf(s.id, p); return v == null ? '—' : v.toFixed(2); }),
    result: null, finalScore: null
  })),
  note: '比分只展示不串关; 欧国联第 5 轮战意分层明显, 三项取主队小胜与深热两档。'
};

/* 亚洲让球 4 关 */
const AH_LEGS = [
  { id: '周四004', pick: '黑山-1.5', odds: '1.92', reason: '黑山赢球锁头名、拉脱维亚 1 分无欲; 球半平水, 与方向同向。' },
  { id: '周四006', pick: '捷克+2', odds: '1.86', reason: '西班牙让两球且亚马尔缺阵, 捷克主场保三有动机; 受让两球是全日最宽盘。' },
  { id: '北单029', pick: '门多萨独立+0.25', odds: '1.82', reason: '大学生为解放者杯决赛留力+两攻击手伤缺; 客水 1.82 低, 与方向同向。' },
  { id: '北单031', pick: '库拉索+0.25', odds: '1.77', reason: '库拉索主场小组不败、巴拿马半年无正式比赛; 主水 1.77 低, 资金站主队。' }
].map(l => {
  const m = byId[l.id];
  return { match: l.id + ' ' + m.home + ' vs ' + m.away, league: m.league, pick: l.pick, play: '亚盘', odds: l.odds, reason: l.reason, result: null, finalScore: null };
});
const ahOdds = AH_LEGS.reduce((n, l) => n * Number(l.odds), 1);
const asian7 = {
  play: '混编', totalOdds: '约' + ahOdds.toFixed(1) + '倍', result: null, legs: AH_LEGS,
  note: 'asian7 4 关: 澳彩 10:08 水位 黑山-1.5@1.92 / 捷克+2@1.86 / 门多萨独立+0.25@1.82 / 库拉索+0.25@1.77, 名义约 ' + ahOdds.toFixed(1) + ' 倍; 40 元。⚠️开盘快照未覆盖本批赛事(盘口今日才挂出), 无初盘对比。'
};

/* 大小 2 串 */
const OU_LEGS = [
  { id: '周四006', pick: '大3.25', odds: '1.88', reason: '西班牙场均 3 球、捷克 4 战丢 10 球, 3.25 盘大球水位 1.88 不追。' },
  { id: '北单031', pick: '小2.25', odds: '1.82', reason: 'CNL 八强首回合两回合制, 双方首回合先求不失; 2.25 盘偏小。' }
].map(l => {
  const m = byId[l.id];
  return { match: l.id + ' ' + m.home + ' vs ' + m.away, pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null };
});
const ouOdds = OU_LEGS.reduce((n, l) => n * Number(l.odds), 1);
const ou2 = { result: null, legs: OU_LEGS, note: '大小 2 串(各 1 元): 006 大3.25 @1.88 + 031 小2.25 @1.82, 名义约 ' + ouOdds.toFixed(1) + ' 倍。' };

/* 北单 4 关 */
const BD = [
  { num: '022', id: '周四002', pick: '1/0', note: '塞浦路斯客不败——资金与基本面同向。' },
  { num: '026', id: '北单026', pick: '0/1', note: '白俄让两球客不败——白俄争头名、首回合 4-0。' },
  { num: '029', id: '北单029', pick: '1/0', note: '门多萨独立客不败——大学生留力解放者杯。' },
  { num: '031', id: '北单031', pick: '3/1', note: '库拉索主不败——主场小组 3 胜 1 平。' }
];
const beidan310 = {
  issue: '26114', result: null,
  legs: BD.map(l => ({
    match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
    bdNum: l.num, pick: l.pick,
    handicap: String(bdHcp(l.num)),
    sp3: bdSp(l.num), note: l.note, result: null, finalScore: null
  })),
  note: '北单 26114 期(11-13 段) 4 关双选 16 注 96 元(每注 6 元): 022/029/031 让 0 双选 + 026 受让两球客不败; 5 场弃选场全部剔除, 官方 SP 为准。'
};

/* 梦想 7 关(北单让球 SP, 只展示) */
const DREAM = [
  { num: '025', id: '周四004', pick: '黑山 让球主胜(-2)', odds: '1.28', reason: '赢球锁头名, 让 2 球。' },
  { num: '022', id: '周四002', pick: '塞浦路斯 客胜(让0)', odds: '3.01', reason: '资金与基本面同向。' },
  { num: '027', id: '周四005', pick: '英格兰 让球主胜(-2)', odds: '1.24', reason: '赢球锁前二, 温布利。' },
  { num: '029', id: '北单029', pick: '门多萨独立 客胜(让0)', odds: '3.03', reason: '大学生留力解放者杯。' },
  { num: '031', id: '北单031', pick: '库拉索 主胜(让0)', odds: '2.98', reason: '主场小组不败。' },
  { num: '026', id: '北单026', pick: '白俄罗斯 让球客胜(+2)', odds: '1.13', reason: '白俄争头名, 实力差。' }
];
const dreamOdds = DREAM.reduce((n, l) => n * Number(l.odds), 1);
const dream7 = {
  totalOdds: '约' + dreamOdds.toFixed(1) + '倍', result: null,
  legs: DREAM.map(l => ({
    league: byId[l.id].league,
    match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
    pick: l.pick, odds: l.odds, reason: l.reason, result: null, finalScore: null
  })),
  note: 'V4.8 弃选 5 场后只够 6 关(方向层仅 6 场有效), 全部取北单让球 SP; 浮动值以出票为准, 只展示不投注。'
};

/* 三时段: 深夜=欧国联 7 场(01:00-03:45), 早场=巴西乙2+阿超杯+CNL(06:00-08:30), 夜场无赛事 */
const mkAsian = (legs, cost) => {
  const sum = legs.reduce((n, l) => n * Number(l.odds), 1);
  return { legs, cost: cost == null ? 2 : cost, totalOdds: sum.toFixed(1), result: null };
};
const mkBd = (legs, unit) => {
  const dbl = legs.filter(l => String(l.pick).includes('/')).length;
  const u = unit == null ? 2 : unit;
  return { issue: '26114', legs, stakes: 2 ** dbl, unit: u, cost: 2 ** dbl * u, result: null };
};
const lateAsianLegs = [
  { id: '周四001', pick: '土耳其+0.75', odds: '1.80', reason: '受半/一主水 1.80 低, 资金侧。' },
  { id: '周四002', pick: '塞浦路斯+0.25', odds: '1.79', reason: '客水 1.79 低, 争头名动力。' },
  { id: '周四003', pick: '芬兰+0.5', odds: '1.86', reason: '客水 1.86 低, 资金侧。' },
  { id: '周四004', pick: '黑山-1.5', odds: '1.92', reason: '赢球锁头名, 球半平水。' },
  { id: '周四005', pick: '英格兰-1.75', odds: '1.90', reason: '主水 1.90 低, 赢球锁前二。' },
  { id: '周四006', pick: '捷克+2', odds: '1.86', reason: '西班牙让两球且亚马尔缺阵。' },
  { id: '北单026', pick: '白俄罗斯-2', odds: '1.84', reason: '客水 1.84 低, 实力差。' }
];
const earlyAsianLegs = [
  { id: '北单028', pick: '庞特普雷塔+1', odds: '1.79', reason: '受一球主水低, 资金侧。' },
  { id: '北单029', pick: '门多萨独立+0.25', odds: '1.82', reason: '大学生留力解放者杯, 客水低。' },
  { id: '北单030', pick: '巴西竞技+0.5', odds: '1.82', reason: '客水低(资金站客), 受让半球。' },
  { id: '北单031', pick: '库拉索+0.25', odds: '1.77', reason: '主水 1.77 低, 资金站主队。' }
];
const lateBdLegs = [
  { num: '022', id: '周四002', pick: '1/0' },
  { num: '026', id: '北单026', pick: '0/1' },
  { num: '027', id: '周四005', pick: '3/1' }
];
const earlyBdLegs = [
  { num: '029', id: '北单029', pick: '1/0' },
  { num: '031', id: '北单031', pick: '3/1' }
];
const toAsian = legs => legs.map(l => ({
  id: l.id, match: l.id + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away, league: byId[l.id].league,
  pick: l.pick, play: /^[大小]/.test(l.pick) ? '大小球' : '亚盘', odds: l.odds, reason: l.reason, result: null
}));
const toBd = legs => legs.map(l => ({
  bdNum: l.num, match: l.num + ' ' + byId[l.id].home + ' vs ' + byId[l.id].away,
  pick: l.pick, handicap: bdHcp(l.num), sp3: bdSp(l.num), note: '与方向同向', result: null
}));
const slot8 = {
  early: { asian: mkAsian(toAsian(earlyAsianLegs), 32), beidan: mkBd(toBd(earlyBdLegs), 6), review: '早场(06:00-17:59)=巴西乙末轮 2 场 + 阿根廷超级杯 + CNL 八强首回合(06:00-08:30), 亚盘 4 腿 32 元 + 北单 2 关 4 注 24 元。' },
  night: { asian: mkAsian([]), beidan: mkBd([]), review: '夜场(18:00-23:59)本日无赛事: 欧国联与南美场次全部在次日凌晨/上午。' },
  late: { asian: mkAsian(toAsian(lateAsianLegs), 40), beidan: mkBd(toBd(lateBdLegs), 6), review: '深夜(次日00:00-05:59)=欧国联第 5 轮 7 场(01:00-03:45), 亚盘 7 腿 40 元(场次只够 7 腿, 不足 8 拖不硬凑) + 北单 3 关 8 注 48 元。' }
};

const plan = [
  { market: 'jc', name: '🎯 胜平负', pct: '0胆1单选+5场弃选', result: null,
    text: '零胆: 丙戌日泽火革=冷门预警日, 池内深热场(黑山1.20/英格兰1.15)都带主场平局史或大面积伤停, 无一场满足 V4.7 胆区间且无平局风险。单选 1 场: 004 黑山 主胜 1.20★1(赢球锁头名+对手1分无欲, 但主场对拉脱维亚最近两次均平, 投 100 元)。**V4.8 新增弃选 5 场**: 001 土耳其/006 捷克/003 阿尔巴尼亚/028 庞特普雷塔/030 圣贝尔纳多——方向原本与基本面同向, 但澳彩资金站在反侧, 按新规一律不出方向(亚盘腿照留)。' },
  { market: 'jc', name: '🔵 双选方向', pct: '6场有效+5场弃选', result: null,
    text: '有效方向 6 场: 002 塞浦路斯客不败(改跟资金)/004 黑山主不败/005 英格兰主不败/026 白俄罗斯客不败/029 门多萨独立客不败/031 库拉索主不败, 主侧 3 客侧 3 = 50%。弃选 5 场只留亚盘腿, 不进北单、不进梦想7关。' },
  { market: 'jc', name: '🌏 亚洲让球', pct: '4关约' + ahOdds.toFixed(1) + '倍', result: null,
    text: 'asian7 4 关约 ' + ahOdds.toFixed(1) + ' 倍: 黑山-1.5(1.92) / 捷克+2(1.86) / 门多萨独立+0.25(1.82) / 库拉索+0.25(1.77)。四腿全部站在澳彩水位低的一侧(资金侧); 捷克+2 那场方向已弃选, 亚盘系统独立保留。' },
  { market: 'jc', name: '🟣 大小盘', pct: '2串约' + ouOdds.toFixed(1) + '倍', result: null,
    text: '大小 2 串约 ' + ouOdds.toFixed(1) + ' 倍: 006 捷克场大 3.25 @1.88 + 031 库拉索场小 2.25 @1.82。前者西班牙火力, 后者两回合淘汰赛首回合先求不失。' },
  { market: 'jc', name: '🏅 比分', pct: '3场×3', result: null,
    text: '比分只展示: 005 英格兰 2:0(6.25)/2:1(7.75)/3:0(7.75); 004 黑山 2:0(5.05)/3:0(7.50)/1:0(6.50); 002 亚美尼亚 0:1(9.25)/1:1(5.50)/1:0(7.50)。' },
  { market: 'bd', name: '🀄 北单310', pct: '4关16注96元', result: null,
    text: '北单 26114 期(11-13 段) 4 关双选 16 注 96 元(每注 6 元): 022 塞浦路斯客不败(1/0) + 026 白俄受让两球客不败(0/1) + 029 门多萨独立客不败(1/0) + 031 库拉索主不败(3/1)。原 024 阿尔巴尼亚、030 圣贝尔纳多因方向弃选被剔除。' },
  { market: 'jc', name: '🌍 胜负彩', pct: '无新期', result: null,
    text: '周四无胜负彩期次(足彩周五/六/日开售), 欧国联这批归周五期次, 本期不挂。' },
  { market: 'jc', name: '💰 投注建议', pct: '方案400元', result: null,
    text: '💰400 元(日预算 300-500)=单选 100(黑山 1.20)+ asian7 40 + 大小 2 串 20 + 主北单 96(16注×6)+ 深夜 88(亚盘 40 + 北单 48)+ 早场 56(亚盘 32 + 北单 24)。零胆 + 5 场弃选, 主力仓位放在唯一单选; 比分与梦想 6 关只展示。' }
];

const dayNote = '★11-12 周四池=欧国联 2026-27 第 5 轮 7 场(11-13 01:00-03:45)+ 巴西乙末轮 2 场 + 阿根廷超级杯决赛 1 场 + CONCACAF Nations League 八强首回合 1 场, 共 11 场(国际比赛周)。五式: **丙戌日**, 丙火坐戌土=**干生支, 主队得利(温和)**; 丙干四化=天同化禄·天机化权·文昌化科·**廉贞化忌**(主冲突、判罚争议、红牌, 防意外); 六爻**泽火革→泽山咸**(变革/换血, 冷门预警, 与 09-09 同丙戌日同卦); 六壬干生支同向。**结论=变革日 + 冷门预警, 不重仓**: **零胆**(黑山1.20/英格兰1.15 深热均带主场平局史或大面积伤停, 无区间内无险胆), **单选 1 场黑山 1.20★1 投 100 元**。**★V4.8 新规首次执行**: 方向与澳彩资金侧相反的场一律跟资金或弃选, 今日弃选 5 场(001 土耳其/006 捷克/003 阿尔巴尼亚/028 庞特普雷塔/030 圣贝尔纳多), 弃选场只留亚盘腿、不进北单与梦想7关; 002 亚美尼亚由主胜改跟资金做塞浦路斯客不败。核心变量=战意分层: 必须赢的比利时/西班牙/英格兰/阿尔巴尼亚/白俄罗斯/黑山 六队动机明确, 而土耳其/捷克/拉脱维亚/圣马力诺已无欲。⚠️仅供娱乐参考, 不构成投注建议。';

const dailyPost = {
  title: '国际比赛日 11 场：欧国联第 5 轮，方向与资金打架的 5 场直接弃选',
  content: '今晚到明晨有 11 场可投：欧国联第 5 轮 7 场（01:00-03:45），加上巴西乙末轮两场、阿根廷超级杯决赛和 CONCACAF 国家联赛八强首回合。竞彩在售 6 场，北单补足其余 5 场。\n\n**这轮的分水岭是战意，不是实力。** 小组赛只剩两轮：比利时 6 分第三，输球就可能退出前二；西班牙 12 分但还没锁头名，必须赢捷克；英格兰 9 分，赢球锁定前二；阿尔巴尼亚 9 分、白俄罗斯 7 分、黑山 10 分，都是赢球即达成升级或头名目标。另一头，土耳其 4 战全败、捷克 0 分、拉脱维亚 1 分、圣马力诺 0 分，只剩体面。\n\n**今天第一次执行新规：方向不许逆着资金。** 昨天谢周三那场已经说明问题——我一边写"资金站主队"，一边推客胜，等于自己打自己。所以今天把 11 场里方向与澳彩资金相反的 5 场直接弃选：土耳其/比利时（资金在受让的土耳其）、捷克/西班牙（资金在受让两球的捷克）、阿尔巴尼亚/芬兰（资金在客队芬兰）、庞特普雷塔、圣贝尔纳多。这 5 场只留亚盘腿，不进方向、不进北单、不进梦想关。002 亚美尼亚那场则改跟资金，做塞浦路斯客不败。\n\n**别被超深赔骗了。** 英格兰 1.15、黑山 1.20 是全天最低两档，但英格兰伤了一串（帕尔默未入选，格伊、孔萨、Lewis-Skelly、Reece James、Saka、Rashford 都缺），克罗地亚明确说保 A 级；黑山主场对拉脱维亚最近两次都是平局。所以两场都只做双选，黑山给一个 ★1 单选、投 100 元，不升胆。\n\n**方案 400 元**（日预算 300-500）：单选 100（黑山）+ asian7 40 + 大小 2 串 20 + 北单 4 关 96 + 深夜 88 + 早场 56。零胆、5 场弃选，主力仓位给唯一单选；比分和梦想关（今天只够 6 关）只展示。\n\n仅供娱乐参考，不构成投注建议。'
};

/* 💰 方案分配表(2026-11-12 用户拍板「方案66元用直观的表格显示」): 页面上直接出表, 不再用一段话 */
const lateAhOdds = lateAsianLegs.reduce((n, l) => n * Number(l.odds), 1);
const earlyAhOdds = earlyAsianLegs.reduce((n, l) => n * Number(l.odds), 1);
const betPlan = {
  total: 400,
  note: '北单为浮动 SP，全中回报以官方开奖为准；比分与梦想 6 关只展示不计投入。',
  rows: [
    { tier: '稳定', name: '单选', detail: '黑山 主胜 1.20★1', stake: 100, odds: '1.20', payout: '120.0' },
    { tier: '增强', name: 'asian7 4 关', detail: '黑山-1.5 / 捷克+2 / 门多萨独立+0.25 / 库拉索+0.25', stake: 40, odds: ahOdds.toFixed(1), payout: (40 * ahOdds).toFixed(1) },
    { tier: '增强', name: '大小 2 串', detail: '006 大 3.25 / 031 小 2.25', stake: 20, odds: ouOdds.toFixed(1), payout: (20 * ouOdds).toFixed(1) },
    { tier: '北单', name: '4 关 16 注', detail: '022 1/0 · 026 0/1 · 029 1/0 · 031 3/1（每注 6 元）', stake: 96, odds: '浮动 SP', payout: '以官方为准' },
    { tier: '深夜', name: '亚盘 7 腿', detail: '土耳其+0.75 / 塞浦路斯+0.25 / 芬兰+0.5 / 黑山-1.5 / 英格兰-1.75 / 捷克+2 / 白俄罗斯-2', stake: 40, odds: lateAhOdds.toFixed(1), payout: (40 * lateAhOdds).toFixed(1) },
    { tier: '深夜', name: '北单 3 关', detail: '022 1/0 · 026 0/1 · 027 3/1（8 注×6 元）', stake: 48, odds: '浮动 SP', payout: '以官方为准' },
    { tier: '早场', name: '亚盘 4 腿', detail: '庞特普雷塔+1 / 门多萨独立+0.25 / 巴西竞技+0.5 / 库拉索+0.25', stake: 32, odds: earlyAhOdds.toFixed(1), payout: (32 * earlyAhOdds).toFixed(1) },
    { tier: '早场', name: '北单 2 关', detail: '029 1/0 · 031 3/1（4 注×6 元）', stake: 24, odds: '浮动 SP', payout: '以官方为准' }
  ]
};

const day = {
  date: DATE,
  dayPillar: '丙午年·己亥月·丙戌日',
  dayNote,
  matches,
  dailyPost,
  plan,
  betPlan,
  slot8,
  dream7,
  asian7,
  ou2,
  score3,
  beidan310,
  zucai310: null,
  bank: { stake: 400, ret: null, net: null }, // 赛前只有投入; 回收/盈亏由复盘回填
  review: ''
};

days.unshift(day);
const header = '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\n';
fs.writeFileSync(file, header + 'const PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写入 ' + DATE + ' 池, ' + matches.length + ' 场: ' + matches.map(m => m.id).join(','));
console.log('asian7 约' + ahOdds.toFixed(1) + '倍 / 大小 约' + ouOdds.toFixed(1) + '倍 / 梦想7 约' + dreamOdds.toFixed(1) + '倍');
console.log('早场 亚盘 ' + earlyAsianLegs.length + ' 腿 + 北单 ' + earlyBdLegs.length + ' 关; 深夜 同构; 夜场空');
