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

console.log('stats.test.js 全部通过 ✓');
