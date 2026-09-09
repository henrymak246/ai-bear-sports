const assert = require('assert');
const S = require('../stats.js');

// judgeDirection
assert.strictEqual(S.judgeDirection('主胜', '3-1'), 1);
assert.strictEqual(S.judgeDirection('主胜', '1-3'), 0);
assert.strictEqual(S.judgeDirection('平', '2-2'), 1);
assert.strictEqual(S.judgeDirection('客胜', '0-2'), 1);
assert.strictEqual(S.judgeDirection('放弃', '3-1'), null);
assert.strictEqual(S.judgeDirection('主胜', null), null);

// judgeOverUnder（含 .25/.75 双段结算）
assert.strictEqual(S.judgeOverUnder('大2.5', '2-1'), 1);    // 3球 > 2.5 全中
assert.strictEqual(S.judgeOverUnder('小2.5', '2-1'), 0);
assert.strictEqual(S.judgeOverUnder('大3', '2-1'), null);   // 整盘走水，不计入
assert.strictEqual(S.judgeOverUnder('大3.25', '2-1'), 0.5); // 大3走水+大3.5输 = 输一半计0.5
assert.strictEqual(S.judgeOverUnder('大3.25', '3-1'), 1);   // 全中
assert.strictEqual(S.judgeOverUnder('小2.75', '2-1'), 0.5); // 小2.5输+小3走 = 输一半计0.5
assert.strictEqual(S.judgeOverUnder('大2.75', '2-1'), 0.5); // 大2.5赢+大3走 = 赢一半
assert.strictEqual(S.judgeOverUnder('放弃', '2-1'), null);

// judgeScore
assert.strictEqual(S.judgeScore(['3-0', '3-1'], '3-1'), 1);
assert.strictEqual(S.judgeScore(['3-0', '3-1'], '2-0'), 0);
assert.strictEqual(S.judgeScore([], '3-1'), null);

// computeDayStats：1场全中 + 1场待回填 + 1场方向错大小球中
const day = {
  date: '2026-07-26',
  matches: [
    { id: 'A', league: '瑞典超', direction: '主胜', overUnder: '大2.5', score: ['3-0'], finalScore: '3-0' },
    { id: 'B', league: '韩K联', direction: '客胜', overUnder: '放弃', score: ['0-1'], finalScore: null },
    { id: 'C', league: '韩K联', direction: '主胜', overUnder: '小2.5', score: ['1-0'], finalScore: '0-1' },
  ],
};
const ds = S.computeDayStats(day);
assert.deepStrictEqual(ds.direction, { score: 1, total: 2 });
assert.deepStrictEqual(ds.overUnder, { score: 2, total: 2 });
assert.deepStrictEqual(ds.score, { score: 1, total: 2 });
assert.strictEqual(ds.pending, 1);
assert.strictEqual(ds.matches, 3);

// computeOverall + byLeague
const days = [day, {
  date: '2026-07-25',
  matches: [{ id: 'D', league: '瑞典超', direction: '主胜', overUnder: '小2.5', score: ['2-0'], finalScore: '2-0' }],
}];
const ov = S.computeOverall(days);
assert.strictEqual(ov.direction.total, 3);
assert.strictEqual(ov.direction.score, 2);
assert.ok(Math.abs(ov.direction.rate - 2 / 3) < 1e-9);
assert.strictEqual(ov.days, 2);
assert.strictEqual(ov.matches, 4);
assert.strictEqual(ov.pending, 1);
const swe = ov.byLeague.find(l => l.league === '瑞典超');
assert.strictEqual(swe.total, 2);
assert.strictEqual(swe.rate, 1);

// computeTrend：日期升序、仅含有判定场次的日、近n日截断
const trend = S.computeTrend(days, 14);
assert.strictEqual(trend.length, 2);
assert.strictEqual(trend[0].date, '2026-07-25');
assert.strictEqual(trend[1].date, '2026-07-26');
assert.strictEqual(trend[0].rate, 1);
assert.strictEqual(trend[1].rate, 0.5);

// ---- planTypeOf：方案块归 6 类 ----
assert.strictEqual(S.planTypeOf('std', '🔵 亚洲让球'), '亚洲让球');
assert.strictEqual(S.planTypeOf('std', '🟣 大小盘'), '大小盘');
assert.strictEqual(S.planTypeOf('jc', '🎯 胜平负'), '胜平负');
assert.strictEqual(S.planTypeOf('jc', '🟢 让球+胜平负 · 底仓'), '胜平负');
assert.strictEqual(S.planTypeOf(undefined, '🎯 胜平负'), '胜平负'); // market 缺省按 jc
assert.strictEqual(S.planTypeOf('jc', '⚽ 进球数'), '进球数');
assert.strictEqual(S.planTypeOf('jc', '🏅 比分'), '比分');
assert.strictEqual(S.planTypeOf('jc', '🎯 过关专栏'), '过关串关');
assert.strictEqual(S.planTypeOf('jc', '6串1 娱乐'), '过关串关');

// ---- planStats：半红0.5 / 走水不计 / 未回填不计 / 固定6类顺序 ----
const planDays = [
  { date: '2026-07-27', plan: [
    { market: 'jc', name: '🎯 胜平负', result: 'hit' },
    { market: 'std', name: '🟣 大小盘', result: 'push' },
    { market: 'jc', name: '⚽ 进球数' }, // 未回填 result，不计入
  ]},
  { date: '2026-07-26', plan: [
    { market: 'jc', name: '🟢 让球+胜平负 · 底仓', result: 'half' },
    { market: 'jc', name: '🟡 让球+单关 · 增益', result: 'miss' },
    { market: 'jc', name: '🔴 比分 · 梦想', result: 'miss' },
    { market: 'std', name: '🔵 亚洲让球', result: 'hit' },
  ]},
];
const ps = S.planStats(planDays);
assert.deepStrictEqual(ps.map(function (s) { return s.type; }),
  ['胜平负', '进球数', '比分', '过关串关', '亚洲让球', '大小盘']);
const spf = ps[0]; // 胜平负：hit1 + half1 + miss1
assert.strictEqual(spf.hit, 1);
assert.strictEqual(spf.half, 1);
assert.strictEqual(spf.miss, 1);
assert.strictEqual(spf.push, 0);
assert.strictEqual(spf.total, 3);
assert.ok(Math.abs(spf.rate - 1.5 / 3) < 1e-9);
assert.deepStrictEqual(spf.last14.map(function (p) { return p.date; }),
  ['2026-07-26', '2026-07-26', '2026-07-27']); // 日期升序
assert.deepStrictEqual(spf.last14.map(function (p) { return p.result; }),
  ['half', 'miss', 'hit']);
const daxiao = ps.find(function (s) { return s.type === '大小盘'; });
assert.strictEqual(daxiao.push, 1);
assert.strictEqual(daxiao.total, 0);   // 走水不计入分母
assert.strictEqual(daxiao.rate, null);
assert.strictEqual(ps.find(function (s) { return s.type === '进球数'; }).total, 0); // 未回填不计
assert.strictEqual(ps.find(function (s) { return s.type === '亚洲让球'; }).rate, 1);
assert.doesNotThrow(function () { S.planStats([{ date: '2026-07-25' }]); }); // 无 plan 字段不报错
assert.doesNotThrow(function () { S.planStats([]); });

// ---- computeBeidan：北单（id 以「北单」开头）单独累计 + 竞彩对照 + 北单方案块 ----
const bdDays = [
  { date: '2026-07-29', matches: [
    { id: '周三005', league: '巴甲', direction: '主胜', overUnder: '小2.5', score: ['1-0'], finalScore: '0-0' },
    { id: '北单·红星', league: '欧冠资格赛', direction: '主胜', overUnder: '放弃', score: ['3-0'], finalScore: '5-0' },
  ], plan: [
    { market: 'jc', name: '🀄 北单 · 胜平负', result: 'hit' },
    { market: 'jc', name: '🎯 胜平负', result: 'miss' },   // 非北单块不计入
  ]},
  { date: '2026-07-27', matches: [
    { id: '北单159', league: '罗甲', direction: '主胜', overUnder: '放弃', score: ['2-1'], finalScore: '5-0' },
    { id: '北单168', league: '冰岛超', direction: '主胜', overUnder: '大2.5', score: [], finalScore: '1-0' },
    { id: '北单171', league: '巴西乙', direction: '主胜', overUnder: '放弃', score: ['2-1'], finalScore: null }, // 待回填
  ]},
];
const bd = S.computeBeidan(bdDays);
assert.strictEqual(bd.direction.score, 3);            // 红星✓ 159✓ 168✓
assert.strictEqual(bd.direction.total, 3);            // 171 待回填不计
assert.strictEqual(bd.direction.rate, 1);
assert.strictEqual(bd.overUnder.total, 1);            // 仅 168 大2.5（1球）= 黑
assert.strictEqual(bd.overUnder.score, 0);
assert.strictEqual(bd.score.total, 2);                // 红星3-0✗、159 2-1✗；168 无比分项不计
assert.strictEqual(bd.score.score, 0);
assert.strictEqual(bd.jcDirection.score, 0);          // 周三005 主胜 0-0 = 黑（对照组）
assert.strictEqual(bd.jcDirection.total, 1);
assert.deepStrictEqual(bd.plan, { hit: 1, half: 0, miss: 0, push: 0 });
assert.strictEqual(bd.matches.length, 4);             // 含待回填 171
assert.strictEqual(bd.matches[0].id, '北单·红星');    // 日期倒序
assert.strictEqual(bd.matches[3].id, '北单171');
assert.strictEqual(S.isBeidan({ id: '北单165' }), true);
assert.strictEqual(S.isBeidan({ id: '周三001' }), false);
assert.doesNotThrow(function () { S.computeBeidan([]); });
assert.doesNotThrow(function () { S.computeBeidan([{ date: '2026-07-25' }]); });

// ---- computeBeidan：beidan310 顶层块 legs 明细（2026-09-08 起，pick 3/1/0 复用竞彩场判定） ----
const bd310Days = [
  { date: '2026-09-08', matches: [
    { id: '周二002', league: '欧冠', home: '雅典AEK', away: 'LASK', direction: '主胜', overUnder: '小3', score: [], finalScore: '2-0' },
    { id: '周二011', league: '欧冠', home: '波尔图', away: '曼城', direction: '客胜', overUnder: '大2.5', score: [], finalScore: '1-2' },
    { id: '周二003', league: '欧冠', home: '布鲁日', away: '维拉', direction: '主胜', overUnder: '小2.5', score: [], finalScore: null }, // 待赛
  ], plan: [], beidan310: { legs: [
    { play: '北单310', match: '002 雅典AEK vs LASK', pick: '3', odds: '1.59', result: null },
    { play: '北单310', match: '011 波尔图 vs 曼城', pick: '0', odds: '1.48', result: 'miss' }, // 人工回填优先(覆盖自动判定的 hit)
    { play: '北单310', match: '003 布鲁日 vs 维拉', pick: '3', odds: '2.41', result: null },   // 待赛不计
  ], result: 'half' } },
];
const bd310 = S.computeBeidan(bd310Days);
assert.strictEqual(bd310.direction.score, 1);          // 002 pick3 主胜✓；011 人工 miss
assert.strictEqual(bd310.direction.total, 2);
assert.strictEqual(bd310.plan.half, 1);                // beidan310.result 计入方案块
assert.strictEqual(bd310.matches.length, 3);           // 三腿全进明细(含待赛)
assert.strictEqual(bd310.matches[0].d, 1);             // 002 自动判定红
assert.strictEqual(bd310.matches[1].d, 0);             // 011 人工 miss 优先
assert.strictEqual(bd310.matches[2].d, null);          // 003 待赛
assert.strictEqual(bd310.matches[0].direction, '3'); // pick 3 → 310记法(不显示SP)
assert(!bd310.matches[0].direction.includes('SP'), '明细不显示 SP(2026-09-09 起)');
assert.strictEqual(bd310.jcDirection.total, 2);        // 竞彩场方向仍入对照(002✓/011✓)

// ---- beidan310 复式多选（2026-09-08 晚起）：pick '3/1' 命中其一即红 ----
const bdMulti = S.computeBeidan([
  { date: '2026-09-08', matches: [
    { id: '周二004', league: '荷甲', home: '奈梅亨', away: '精英', direction: '主胜', finalScore: '1-1' },
    { id: '周二005', league: '沙职', home: '胡巴卡德', away: '国民', direction: '主胜', finalScore: '2-1' },
    { id: '周二006', league: '英冠', home: '南安普敦', away: '斯旺西', direction: '主胜', finalScore: null }, // 待赛
  ], plan: [], beidan310: { legs: [
    { play: '北单310', match: '004 奈梅亨 vs 精英', pick: '3/1', odds: '1.48/4.30', result: null },  // 平→防平红
    { play: '北单310', match: '005 胡巴卡德 vs 国民', pick: '3/1', odds: '1.75/3.80', result: null }, // 主胜→红
    { play: '北单310', match: '006 南安普敦 vs 斯旺西', pick: '0/1', odds: '1.48/4.05', result: 'miss' }, // 人工回填优先
  ], result: null } },
]);
assert.strictEqual(bdMulti.direction.score, 2);        // 防平✓ + 主胜✓；006 人工 miss
assert.strictEqual(bdMulti.direction.total, 3);
assert.strictEqual(bdMulti.matches[0].d, 1);
assert.strictEqual(bdMulti.matches[0].direction, '3/1'); // 多选 310 记法(不显示SP)
assert(!bdMulti.matches[0].direction.includes('SP'), '多选明细不显示 SP');
assert.strictEqual(bdMulti.matches[2].d, 0);           // 人工 miss 优先于多选判定

// ---- beidan310 让球判定（2026-09-09 更正）：leg.handicap 负数=主让, 主队比分+让球数后定3/1/0; result='push' 腿无效不计入 ----
const bdHc = S.computeBeidan([
  { date: '2026-09-09', matches: [
    { id: '周三002', league: '欧冠', home: '雅典AEK', away: 'LASK', direction: '主胜', finalScore: '1-0' },
    { id: '周三004', league: '荷甲', home: '奈梅亨', away: '精英', direction: '主胜', finalScore: '2-2' },
    { id: '周三009', league: '欧冠', home: '多特', away: '黄潜', direction: '主胜', finalScore: '3-2' },
    { id: '周三011', league: '欧冠', home: '波尔图', away: '曼城', direction: '客胜', finalScore: '0-2' },
    { id: '周三005', league: '沙职', home: '胡巴卡德', away: '国民', direction: '主胜', finalScore: '3-2' },
  ], plan: [], beidan310: { legs: [
    { play: '北单310', match: '002 雅典AEK vs LASK', pick: '3', odds: '1.74', handicap: '-1', result: null },      // 1-0让-1→平, 单选3黑
    { play: '北单310', match: '004 奈梅亨 vs 精英', pick: '3/1', odds: '1.90/3.74', handicap: '-1', result: null }, // 2-2让-1→客胜, 黑
    { play: '北单310', match: '009 多特 vs 黄潜', pick: '3/1', odds: '1.72/4.06', handicap: '-1', result: null },   // 3-2让-1→平, 防平红
    { play: '北单310', match: '011 波尔图 vs 曼城', pick: '0/1', odds: '1.64/4.01', handicap: '+1', result: null }, // 0-2让+1→客胜, 红
    { play: '北单310', match: '005 胡巴卡德 vs 国民', pick: '3/1', odds: '1.75/3.80', handicap: null, result: 'push' }, // 北单未开售腿无效
  ], result: 'miss' } },
]);
assert.strictEqual(bdHc.direction.score, 2);           // 009✓ + 011✓
assert.strictEqual(bdHc.direction.total, 4);           // push 腿不计入
assert.strictEqual(bdHc.matches[0].d, 0);              // 让球后 1-0 主胜变黑(关键反直觉用例)
assert.strictEqual(bdHc.matches[2].d, 1);              // 让-1 下主胜1球=让球平, 3/1 红
assert(bdHc.matches[0].direction.includes('[让-1]'), '明细应显示让球数');
assert.strictEqual(bdHc.plan.miss, 1);

// ---- beidan310 北单期次场(非竞彩场)回退 + 赛果SP判定文本（2026-09-09 起）----
const bdExt = S.computeBeidan([
  { date: '2026-09-09', matches: [
    { id: '周三007', league: '欧冠', home: '那不勒斯', away: '阿森纳', direction: '客胜', finalScore: '0-2' },
  ], plan: [], beidan310: { legs: [
    { play: '北单310', match: '007 那不勒斯 vs 阿森纳', pick: '0/1', handicap: '+1', sp3: ['5.54', '3.83', '1.64'], result: null }, // 0-2让+1→客胜0@1.64, 红
    { play: '北单310', league: '苏超', match: '056 圣约翰斯通 vs 凯尔特人', pick: '0/1', handicap: '+1', sp3: ['5.82', '4.60', '1.45'], finalScore: '1-2', result: null }, // 北单期次场: leg.finalScore 回退, 1-2让+1→让球平1@4.60, 红
    { play: '北单310', league: '苏超', match: '057 流浪者 vs 圣米伦', pick: '3', handicap: '-2', sp3: ['1.31', '5.31', '8.11'], finalScore: null, result: null }, // 待赛无 dTxt
  ], result: null } },
]);
assert.strictEqual(bdExt.direction.score, 2);            // 007✓ + 056✓
assert.strictEqual(bdExt.direction.total, 2);
assert.strictEqual(bdExt.matches.length, 3);             // 非竞彩场也进明细
assert.strictEqual(bdExt.matches[0].dTxt, '赛果0 @1.64'); // 让球后客胜+结果SP
assert.strictEqual(bdExt.matches[1].dTxt, '赛果1 @4.60'); // 非竞彩场让球平+结果SP
assert.strictEqual(bdExt.matches[1].home, '圣约翰斯通'); // 回退主客队名
assert.strictEqual(bdExt.matches[1].league, '苏超');
assert.strictEqual(bdExt.matches[1].d, 1);               // 让+1场0/1=客赢球即红(此处让球平)
assert.strictEqual(bdExt.matches[2].dTxt, null);         // 待赛无赛果文本
assert.strictEqual(bdExt.matches[2].d, null);

// ---- computeJK：日韩（id 以「日职」/「韩K」开头）单独累计 + 竞彩对照 + 日韩方案块 ----
const jkDays = [
  { date: '2026-08-08', matches: [
    { id: '日职1', league: '日职', direction: '主胜', overUnder: '大2.5', score: ['2-1'], finalScore: '2-1' },
    { id: '韩K1', league: '韩职', direction: '主胜', overUnder: '小2.5', score: ['1-0'], finalScore: '0-0' },
    { id: '周六007', league: '英联杯', direction: '主胜', overUnder: '小2.5', score: ['2-0'], finalScore: '2-0' },
    { id: '北单112', league: '苏超', direction: '主胜', overUnder: '大2.5', score: ['2-1'], finalScore: '2-1' },
  ], plan: [
    { market: 'jc', name: '🎌 日韩 · 胜平负', result: 'half' },
    { market: 'jc', name: '🀄 北单 · 胜平负', result: 'hit' }, // 非日韩块不计入
  ]},
  { date: '2026-08-05', matches: [
    { id: '日职2', league: '日职', direction: '主胜', overUnder: '放弃', score: [], finalScore: null }, // 待回填
  ]},
];
const jk = S.computeJK(jkDays);
assert.strictEqual(S.isJK({ id: '日职1' }), true);
assert.strictEqual(S.isJK({ id: '韩K3' }), true);
assert.strictEqual(S.isJK({ id: '北单112' }), false);
assert.strictEqual(S.isJK({ id: '周六001' }), false);
assert.strictEqual(jk.direction.score, 1);            // 日职1✓；韩K1 主胜0-0✗
assert.strictEqual(jk.direction.total, 2);            // 日职2 待回填不计
assert.strictEqual(jk.overUnder.total, 2);            // 日职1 大2.5(2-1)✓、韩K1 小2.5(0-0)✓
assert.strictEqual(jk.overUnder.score, 2);
assert.strictEqual(jk.score.total, 2);                // 日职1 2-1✓、韩K1 1-0✗
assert.strictEqual(jk.score.score, 1);
assert.strictEqual(jk.jcDirection.score, 1);          // 仅竞彩组周六007✓（北单112 不入对照）
assert.strictEqual(jk.jcDirection.total, 1);
assert.deepStrictEqual(jk.plan, { hit: 0, half: 1, miss: 0, push: 0 });
assert.strictEqual(jk.matches.length, 3);             // 含待回填 日职2
assert.strictEqual(jk.matches[0].id, '日职1');        // 日期倒序
assert.strictEqual(jk.matches[2].id, '日职2');
assert.doesNotThrow(function () { S.computeJK([]); });
assert.doesNotThrow(function () { S.computeJK([{ date: '2026-08-08' }]); });

// 北单对照口径：日韩场次不入北单专栏的竞彩对照
const bd2 = S.computeBeidan(jkDays);
assert.strictEqual(bd2.jcDirection.total, 1);         // 仅周六007（日职/韩K 场次排除）

// computeXinshui：心水公布记录累计
const xsDays = [
  { date: '2026-08-10', xinshui: { post: 'p', picks: [{ label: 'a', result: 'hit' }, { label: 'b', result: 'miss' }, { label: 'c' }] } },
  { date: '2026-08-09', xinshui: { post: 'q', picks: [{ label: 'd', result: 'hit' }] } },
  { date: '2026-08-08' }, // 无 xinshui 字段不报错
];
const xs = S.computeXinshui(xsDays);
assert.strictEqual(xs.hit, 2);
assert.strictEqual(xs.miss, 1);
assert.strictEqual(xs.pending, 1);
assert.strictEqual(xs.total, 3);
assert.strictEqual(Math.round(xs.rate * 100), 67);
assert.strictEqual(xs.entries[0].date, '2026-08-10'); // 日期倒序
assert.strictEqual(S.computeXinshui([]).rate, null);
assert.doesNotThrow(function () { S.computeXinshui([{ date: '2026-08-07' }]); });

// ---- judgeOverUnder：竞彩总进球「X球」直接比对（2026-08-24 起数据实际写法为 "2球"/"3球"） ----
assert.strictEqual(S.judgeOverUnder('3球', '2-1'), 1);   // 总进球 3 = 命中
assert.strictEqual(S.judgeOverUnder('3球', '2-0'), 0);
assert.strictEqual(S.judgeOverUnder('2球', '1-1'), 1);
assert.strictEqual(S.judgeOverUnder('2球', '2-1'), 0);
assert.strictEqual(S.judgeOverUnder('3球', null), null);  // 待回填不计入
assert.strictEqual(S.judgeOverUnder(null, '2-1'), null);  // 无预测不计入

// ---- computeEPL：英超（league 含「英超」）单独累计，无方案块 ----
const eplDays = [
  { date: '2026-08-23', matches: [
    { id: '周日009', league: '英超', direction: '主胜', overUnder: '大2.5', score: ['2-1'], finalScore: '2-1' },
    { id: '周日010', league: '英超', direction: '客胜', overUnder: '小2.5', score: ['0-1'], finalScore: '1-0' },
    { id: '周日001', league: '日职', direction: '主胜', overUnder: '大2.5', score: [], finalScore: '2-0' }, // 非英超不计
  ]},
  { date: '2026-08-22', matches: [
    { id: '周六009', league: '英超', direction: '主胜', overUnder: '放弃', score: [], finalScore: null }, // 待回填
  ]},
];
const epl = S.computeEPL(eplDays);
assert.strictEqual(S.isEPL({ league: '英超' }), true);
assert.strictEqual(S.isEPL({ league: '英联赛杯' }), false);
assert.strictEqual(S.isEPL({ league: '英冠' }), false);
assert.strictEqual(epl.direction.score, 1);             // 009✓、010✗
assert.strictEqual(epl.direction.total, 2);             // 待回填不计
assert.strictEqual(epl.direction.rate, 0.5);
assert.strictEqual(epl.overUnder.score, 2);             // 009 大2.5✓、010 小2.5(1-0)✓
assert.strictEqual(epl.overUnder.total, 2);
assert.strictEqual(epl.score.score, 1);                 // 009 2-1✓、010 0-1✗
assert.strictEqual(epl.score.total, 2);
assert.strictEqual(epl.matches.length, 3);              // 含待回填场，非英超不入列
assert.strictEqual(epl.matches[0].id, '周日009');       // 日期倒序
assert.strictEqual(epl.matches[2].id, '周六009');
assert.strictEqual(epl.matches[2].finalScore, null);
assert.doesNotThrow(function () { S.computeEPL([]); });
assert.doesNotThrow(function () { S.computeEPL([{ date: '2026-08-23' }]); });
// 英超场次不混入北单/日韩专栏对照：英超既非北单也非日韩，落入竞彩对照组
const eplBd = S.computeBeidan(eplDays);
assert.strictEqual(eplBd.jcDirection.total, 2);         // 英超2场入竞彩对照（日职场除外，待回填不计）
const eplJk = S.computeJK(eplDays);
assert.strictEqual(eplJk.jcDirection.total, 2);

// ---- computeNightExpress：深夜快车（time < 18:00 下半夜至白天场）单独累计 ----
const neDays = [
  { date: '2026-09-06', matches: [
    { id: '周日018', league: '意甲', time: '00:00', direction: '主胜', overUnder: '2球', score: ['1-0'], finalScore: '1-0' },
    { id: '周日021', league: '意甲', time: '02:45', direction: '客胜', overUnder: '2球', score: ['0-1'], finalScore: '0-1' },
    { id: '周日024', league: '巴甲', time: '05:30', direction: '客胜', overUnder: '大2.5', score: [], finalScore: null }, // 待赛
    { id: '周日013', league: '西甲', time: '22:15', direction: '客胜', overUnder: '3球', score: [], finalScore: '0-5' }, // 黄金场不计
    { id: '周日008', league: '英超', time: '21:00', direction: '客胜', overUnder: '3球', score: [], finalScore: '2-2' },  // 黄金场不计
  ]},
  { date: '2026-09-05', matches: [
    { id: '周六029', league: '巴甲', time: '08:30', direction: '主胜', overUnder: '2球', score: [], finalScore: '2-0' },
    { id: '周六004', league: '英超', time: '19:00', direction: '主胜', overUnder: '2球', score: [], finalScore: '2-2' },  // 黄金场不计
  ]},
];
assert.strictEqual(S.isNightExpress({ time: '00:00' }), true);
assert.strictEqual(S.isNightExpress({ time: '05:30' }), true);
assert.strictEqual(S.isNightExpress({ time: '17:59' }), true);
assert.strictEqual(S.isNightExpress({ time: '18:00' }), false);
assert.strictEqual(S.isNightExpress({ time: '23:30' }), false);
assert.strictEqual(S.isNightExpress({ time: '' }), false);
assert.strictEqual(S.isNightExpress({}), false);
const ne = S.computeNightExpress(neDays);
assert.strictEqual(ne.direction.score, 3);              // 018✓、021✓、029✓（待赛与黄金场不计）
assert.strictEqual(ne.direction.total, 3);
assert.strictEqual(ne.direction.rate, 1);
assert.strictEqual(ne.overUnder.score, 1);              // 018 2球✗(1球)、021 2球✗(1球)、029 2球✓
assert.strictEqual(ne.overUnder.total, 3);
assert.strictEqual(ne.score.score, 2);                  // 018 1-0✓、021 0-1✓
assert.strictEqual(ne.score.total, 2);
assert.strictEqual(ne.matches.length, 4);               // 含待赛场，黄金场不入列
assert.strictEqual(ne.matches[0].id, '周日018');        // 日期倒序，同日保持原顺序（竞彩编号=开赛序）
assert.strictEqual(ne.matches[1].id, '周日021');
assert.strictEqual(ne.matches[2].id, '周日024');
assert.strictEqual(ne.matches[3].id, '周六029');
assert.doesNotThrow(function () { S.computeNightExpress([]); });
assert.doesNotThrow(function () { S.computeNightExpress([{ date: '2026-09-06' }]); });

console.log('stats.test.js 全部通过 ✓');
