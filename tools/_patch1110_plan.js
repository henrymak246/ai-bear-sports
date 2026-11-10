/* tools/_patch1110_plan.js — 11-10 池 plan/asian7/score3 与真实数据对齐(幂等)
   1) asian7 四腿赔率已补, 总赔率算实值; 2) score3 改用竞彩两场真实比分赔率(北单场无比分盘, 不虚构);
   3) plan 文案同步。用法: node tools/_patch1110_plan.js [--dry-run] */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const day = days.find(d => d.date === '2026-11-10');
if (!day) throw new Error('无 2026-11-10 数据');

const legs = day.asian7.legs;
const odds = legs.map(l => Number(l.odds));
if (odds.some(o => !isFinite(o) || o <= 0)) throw new Error('asian7 赔率未补全: ' + JSON.stringify(legs.map(l => l.odds)));
const total = odds.reduce((a, b) => a * b, 1);
const totalTxt = '约' + (Math.round(total * 10) / 10) + '倍';

day.asian7.totalOdds = totalTxt;
day.asian7.note = 'asian7 4关: 澳彩初盘水位 ' + legs.map(l => l.pick + '@' + l.odds).join(' / ') + ', 名义约' + (Math.round(total * 10) / 10) + '倍; 2元按半赢口径结算, 赛前三小时复核水位。';
const pa = day.plan.find(p => p.name === '🌏 亚洲让球');
pa.pct = '4关' + totalTxt;
pa.text = 'asian7 4关' + totalTxt + ': ' + legs.map(l => l.pick + '(' + l.odds + ')').join(' / ') + '; 澳彩初盘09:08, 赛前三小时复核水位。';

// 比分: 只有竞彩两场有官方比分赔率; 第三场用北单强主场, 赔率标 — 不虚构
const m1 = day.matches.find(m => m.id === '周二001');
const m2 = day.matches.find(m => m.id === '周二002');
day.score3.legs = [
  { match: '周二001 伯顿 vs 诺茨郡', pick: ['1:1', '0:1', '2:1'], odds: [String(m1.scoreSp[0]), String(m1.scoreSp[1]), '7.5'], result: null, finalScore: null },
  { match: '周二002 布罗姆利 vs 米尔顿凯恩斯', pick: ['0:2', '0:1', '1:2'], odds: [String(m2.scoreSp[0]), String(m2.scoreSp[1]), '6.5'], result: null, finalScore: null },
  { match: '北单008 牛津联 vs 切尔滕汉姆', pick: ['2:0', '3:0', '1:0'], odds: ['—', '—', '—'], result: null, finalScore: null }
];
day.score3.note = '比分只展示不串关; 前两场为竞彩官方比分赔率, 第三场北单无比分盘故赔率留空。';
const ps = day.plan.find(p => p.name === '🏅 比分');
ps.pct = '3场×3';
ps.text = '比分只展示: 周二001 1:1(6.5)/0:1(11.5)/2:1(7.5); 周二002 0:2(10.0)/0:1(10.5)/1:2(6.5); 北单008 牛津联 2:0/3:0/1:0(无比分盘)。';

// 三时段结构: 今日 12 场全部在北京 11-11 凌晨(深夜档), 早场/夜场无赛事, 保留空结构并注明
const { makeAsian, makeBeidan } = require('./_slot8.js');
function legOf(id, play, pick, odds) {
  const m = day.matches.find(x => x.id === id);
  return { id, match: id.slice(-3) + ' ' + m.home + ' vs ' + m.away, league: m.league, pick, play, odds, reason: m.synthesis.slice(0, 40), result: null };
}
function bdLegOf(id, pick) {
  const m = day.matches.find(x => x.id === id);
  const b = day.beidan310.legs.find(l => l.match.indexOf(m.home) >= 0);
  return { bdNum: b ? b.bdNum : id.slice(-3), match: id.slice(-3) + ' ' + m.home + ' vs ' + m.away, pick, handicap: m.spHandicap, note: m.direction + '·双选', result: null };
}
day.slot8 = {
  early: {
    asian: makeAsian([]),
    beidan: makeBeidan('26114', []),
    review: '早场(06:00-17:59)本日无赛事: 国际比赛周, 竞彩/北单全日仅英锦标赛凌晨档。'
  },
  night: {
    asian: makeAsian([]),
    beidan: makeBeidan('26114', []),
    review: '夜场(18:00-23:59)本日无赛事, 同因国际比赛周。'
  },
  late: {
    asian: makeAsian([
      legOf('北单001', '亚盘', '巴尼特0', day.matches.find(m => m.id === '北单001').ah.home),
      legOf('北单002', '亚盘', '雷丁-0.5', day.matches.find(m => m.id === '北单002').ah.away),
      legOf('北单004', '亚盘', '克鲁-0.25', day.matches.find(m => m.id === '北单004').ah.home),
      legOf('北单006', '亚盘', '切斯特菲尔德+0.25', day.matches.find(m => m.id === '北单006').ah.away),
      legOf('北单007', '亚盘', '吉林汉姆+0.5', day.matches.find(m => m.id === '北单007').ah.away),
      legOf('周二002', '亚盘', '米尔顿凯恩斯-0.5', day.matches.find(m => m.id === '周二002').ah.away),
      legOf('北单005', '大小球', '大2.5', '—'),
      legOf('北单011', '大小球', '小2.5', '—')
    ]),
    beidan: makeBeidan('26114', [
      bdLegOf('北单001', '3/1'), bdLegOf('北单002', '1/0'), bdLegOf('北单004', '3/1'),
      bdLegOf('北单006', '1/0'), bdLegOf('北单007', '1/0'), bdLegOf('北单010', '3/1'),
      bdLegOf('北单011', '3/1'), bdLegOf('周二002', '1/0')
    ]),
    review: '深夜档(00:00-05:59)本日唯一有赛事的时段: 12 场英锦标赛全部 02:50-03:30 开球。亚盘 8 腿混编(6 亚盘+2 大小球), 北单 8 关全双选=256 注 512 元, 远超预算, 页面只展示不投入。'
  }
};

const po = day.plan.find(p => p.name === '🟣 大小盘');
po.text = '大小 2 串: 005 莱斯特场大2.5 + 011 布拉德福德场小2.5; 出奇快照未提供大小球水位, 赔率标注待补, 赛前若能拿到再补, 否则只作方向不核算回收。';

const pj = day.plan.find(p => p.name === '🎯 胜平负');
pj.text = '12 场全双选, 零胆零单选: 主侧 8 场(001/003/004/005/008/009/010/011) / 客侧 4 场(002/006/007/012)。杯赛末轮轮换不可测, 深热让球盘 005(1.28)与008(1.21)只作方向不投注。';
const pd = day.plan.find(p => p.name === '🔵 双选方向');
pd.text = '主侧 8 / 客侧 4; 战意主线=需要分数的 002 雷丁/004 克鲁/006 切斯特菲尔德/007 吉林汉姆/008 牛津联/009 普利茅斯; 轮换主线=已出线强队(诺茨郡/维冈/斯托克波特/布拉德福德/米尔顿)的对手方。';

console.log('asian7 ' + totalTxt + ', score3 已换竞彩真实赔率');
if (process.argv.includes('--dry-run')) { console.log('DRY 不写盘'); process.exit(0); }
fs.writeFileSync(file, '/* data/predictions.js — 每日预测数据（唯一每日变更的文件）\n   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */\nconst PREDICTION_DAYS = ' + JSON.stringify(days, null, 1) + ';\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n', 'utf8');
console.log('✓ 已写回 data/predictions.js');
