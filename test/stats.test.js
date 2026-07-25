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

console.log('stats.test.js 全部通过 ✓');
