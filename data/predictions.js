/* data/predictions.js — 每日预测数据（唯一每日变更的文件）
   规则：新一天的对象插到数组最前（倒序）；赛后只需回填每场 finalScore 与当日 review，命中判定与统计由页面自动完成。 */
const PREDICTION_DAYS = [
  {
    date: '2026-07-26',
    dayPillar: '丙午年·乙未月·辛丑日',
    dayNote: '丑未冲+韩K联无妄/三刑，爆冷基因重，韩K联整体降仓',
    matches: [
      { id: '周日206', league: '瑞典超', time: '20:00', home: '天狼星', away: 'IFK哥德堡',
        direction: '主胜', overUnder: '大3.25', score: ['3-0', '3-1'], confidence: 4,
        finalScore: null, note: '五式3/3一致；六壬金局助主+末传六合；哥德堡客场场均失2.86+双赛' },
      { id: '周日211', league: '瑞典超', time: '22:30', home: '盖斯', away: '哈尔姆斯塔德',
        direction: '主胜', overUnder: '小3', score: ['2-0', '2-1'], confidence: 4,
        finalScore: null, note: '盖斯主场7场仅失2球；客队连续2轮0球→破荒因子，小球降谨慎' },
      { id: '周日217', league: '巴西甲', time: '05:30+1', home: '弗拉门戈', away: '圣保罗',
        direction: '主胜', overUnder: '大2.5', score: ['2-0', '3-0'], confidence: 4,
        finalScore: null, note: '旅→大有卦；圣保罗客场场均仅0.9球；H2H均势防冷让-1谨慎' },
      { id: '周日201', league: '韩K联', time: '18:30', home: '首尔FC', away: '蔚山现代',
        direction: '主胜', overUnder: '放弃', score: ['2-1', '1-0'], confidence: 2,
        finalScore: null, note: '无妄卦+丑戌未三刑，冷门量化≥2预警，方向降一档' },
      { id: '周日205', league: '瑞典超', time: '20:00', home: '布洛马波卡纳', away: '哈马比',
        direction: '客胜', overUnder: '放弃', score: ['0-1', '1-2'], confidence: 3,
        finalScore: null, note: '哈马比客场场均仅1.0球+周中双赛，穿盘存疑' },
      { id: '周日215', league: '挪超', time: '23:00', home: '桑纳菲尤尔', away: '博德闪耀',
        direction: '客胜', overUnder: '放弃', score: ['0-2', '1-2'], confidence: 3,
        finalScore: null, note: '革卦冷门预警；主队主场场均失0.83，让+1.5谨慎' },
    ],
    plan: [
      { name: '🟢 方向底仓', pct: '40%', text: '天狼星胜 × 盖斯胜 2串1（25份）；弗拉门戈胜 单关（15份）' },
      { name: '🟡 价值增益', pct: '25%', text: '布洛马波卡纳 受让+1（15份）；马尔默胜 单关（10份）' },
      { name: '🔵 大小球专项', pct: '25%', text: '206 大3/3.25（15份）；204 江原场 小2.5（10份）' },
      { name: '🔴 比分梦想', pct: '10%', text: '天狼星 3-0 / 盖斯 2-0 / 弗拉门戈 2-0（各3~4份娱乐）' },
    ],
    planNote: '回避：208均势、218平手盘、214莫尔德浅盘、210让-1；丑未冲日+无妄/三刑，韩K联18:30四场整体降仓。',
    review: null,
  },
];
if (typeof module !== 'undefined' && module.exports) module.exports = PREDICTION_DAYS;
