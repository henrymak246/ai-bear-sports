const J = require('../miniprogram/utils/judge.js');
const assert = require('assert');
// parseScore
assert.deepStrictEqual(J.parseScore('2-1'), {home:2, away:1});
assert.strictEqual(J.parseScore(''), null);
// direction
assert.strictEqual(J.judgeDirection('主胜','2-1'), 1);
assert.strictEqual(J.judgeDirection('主胜','1-2'), 0);
assert.strictEqual(J.judgeDirection('客胜','1-1'), 0);
assert.strictEqual(J.judgeDirection('平','0-0'), 1);
assert.strictEqual(J.judgeDirection('主胜',null), null);
// overUnder 线位表达(与站点 stats.js 同口径, 含半档/走水)
assert.strictEqual(J.judgeOverUnder('大2.5','2-1'), 1);
assert.strictEqual(J.judgeOverUnder('大2.5','1-1'), 0);
// score
assert.strictEqual(J.judgeScore(['2-1','1-0'],'2-1'), 1);
assert.strictEqual(J.judgeScore(['2-1'],'0-0'), 0);
// 北单让球310: judgeBd310(pick, handicap, finalScore, manualResult)
assert.strictEqual(J.judgeBd310('3','0','2-1'), 'hit');        // 让0 主胜
assert.strictEqual(J.judgeBd310('3','-1','1-0'), 'miss');       // 让-1 后 0-0=平, 单3黑
assert.strictEqual(J.judgeBd310('3/1','-1','1-0'), 'hit');      // 让-1 平=让球平红
assert.strictEqual(J.judgeBd310('0/1','+1','0-1'), 'hit');      // 让+1: 客赢1球→让后平=1红
assert.strictEqual(J.judgeBd310('3','0',null), null);
assert.strictEqual(J.judgeBd310('3','0','2-1','push'), 'push'); // 人工 push 优先
// 亚盘: judgeAh(pick, finalScore), pick 形态 "美因茨-0.5"/"巴拉纳竞技-0.25"/"富勒姆+1.25"
assert.strictEqual(J.judgeAh('美因茨-0.5','2-1'), 'win');
assert.strictEqual(J.judgeAh('美因茨-0.5','1-1'), 'lose');
assert.strictEqual(J.judgeAh('巴竞技-0.25','3-3'), 'loseHalf'); // 让0/0.5 平局输半
assert.strictEqual(J.judgeAh('富勒姆+1.25','1-0','away'), 'winHalf');  // 受让1/1.5 输1球=赢半
assert.strictEqual(J.judgeAh('桑德兰+1','0-1'), 'push');
assert.strictEqual(J.judgeAh('波尔图-1.5','0-2','away'), 'win');
assert.strictEqual(J.judgeAh('美因茨-0.5',null), null);
assert.strictEqual(J.ahFactor('win'), 1);
assert.strictEqual(J.ahFactor('loseHalf'), -0.5);
console.log('mini_judge 全部通过 ✓');
