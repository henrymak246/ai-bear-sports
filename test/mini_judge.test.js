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
// direction 让球口径(与站点 stats.js 同源抽取, 第三参=主队视角让球线)
assert.strictEqual(J.judgeDirection('让球负','7-2',-3), 0);
assert.strictEqual(J.judgeDirection('让球胜','2-0',-1), 1);
assert.strictEqual(J.judgeDirection('让球胜','2-0'), null);
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

// ★亚盘「裸数字」盘口(2026-09-19 复盘实测确认的新形态): '斯托克城0' ≡ '斯托克城-0'(历史一律写作 -0)
//   修前一串坏: judgeAh 的正则 /[+-]\d+(?:\.\d+)?$/ 要求带符号 → 裸 0 返 null; settle.isAhPick 亦判 false
//   → 该腿在小程序结算里**不进亚盘分支**, 掉进竞彩方向分支恒判 miss。
//   实判: 9-19 斯托克城 2-1 谢菲联, 平手盘主队**全赢** —— 恒判 miss 会砸中奖票。
assert.strictEqual(J.judgeAh('斯托克城0', '2-1'), 'win', '裸 0 平手盘: 主队净胜 1 → 全赢(修前 null)');
assert.strictEqual(J.judgeAh('斯托克城0', '1-1'), 'push', '裸 0 平手盘: 打平 → 走水');
assert.strictEqual(J.judgeAh('斯托克城0', '0-1'), 'lose', '裸 0 平手盘: 主队负 → 全输');
assert.strictEqual(J.judgeAh('谢菲联0', '1-2', 'away'), 'win', '裸 0 命名队为客队: 客队净胜 1 → 全赢');
assert.strictEqual(J.judgeAh('斯托克城0', null), null, '裸 0 缺比分仍返 null');
assert.strictEqual(J.judgeAh('斯托克城0.5', '2-1'), 'win', '裸 0.5 按"命名队让球"补负号(-0.5): 净胜 1 → 全赢');
assert.strictEqual(J.judgeAh('斯托克城0.25', '1-1'), 'loseHalf', '裸 0.25 >> -0.25 拆 0/-0.5: 打平 → 输半');
// 正负零等价: -0 / +0 / 裸 0 三种写法同判
assert.strictEqual(J.judgeAh('斯托克城-0', '2-1'), 'win', '-0 口径不变');
assert.strictEqual(J.judgeAh('斯托克城+0', '2-1'), 'win', '+0 口径不变');
// 形态判据(与 settle.isAhPick 同源): 裸数字盘口=0 / 0.25 的整数倍; 队名自带的号不得当盘口
assert.strictEqual(J.ahLineOf('斯托克城0'), 0, '裸 0 = 平手盘 h=0(不返回 -0)');
assert.strictEqual(J.ahLineOf('斯托克城0.5'), -0.5, '裸数字按"命名队让球"补负号(与 _review0920 normAh 同口径)');
assert.strictEqual(J.ahLineOf('美因茨-0.5'), -0.5, '带符号口径不变');
assert.strictEqual(J.ahLineOf('富勒姆+1.25'), 1.25, '带符号口径不变');
assert.strictEqual(J.ahLineOf('米堡平手'), 0, '平手口径不变');
assert.strictEqual(J.ahLineOf('汉诺威96'), null, '★队名自带 96 不得当盘口(超出盘口范围)');
assert.strictEqual(J.ahLineOf('沙尔克04'), null, '★沙尔克04 的前导零不得当盘口');
assert.strictEqual(J.ahLineOf('沙特阿拉伯U23'), null, '★队名自带 23 不得当盘口');
assert.strictEqual(J.ahLineOf('让-1 3'), null, '★310 记法(尾数字前有空格)不得当盘口');
assert.strictEqual(J.ahLineOf('让+1 0'), null, '★310 记法不得当盘口');
assert.strictEqual(J.ahLineOf('3/1'), null, '★复式竞彩码不得当盘口');
assert.strictEqual(J.ahLineOf('让-1 3/0'), null, '★复式让球腿不得当盘口');
assert.strictEqual(J.ahLineOf('斯托克城3.1'), null, '非 0.25 整数倍不得当盘口');
assert.strictEqual(J.ahLineOf('大2.5'), null, '★大小球形态(大2.5)不得当盘口');
assert.strictEqual(J.ahLineOf('小3'), null, '★大小球形态(小3)不得当盘口');
assert.strictEqual(J.ahLineOf('大阪钢巴0'), 0, '队名以"大"开头但次字非数字 → 仍是亚盘(不误伤)');
assert.strictEqual(J.ahTeamOf('斯托克城0'), '斯托克城', '命名队不得带进盘口 0(否则别名容错失效)');
assert.strictEqual(J.ahTeamOf('汉诺威96'), '汉诺威96', '队名自带数字原样保留');
assert.strictEqual(J.ahTeamOf('米堡平手'), '米堡', '平手截除口径不变');
assert.strictEqual(J.ahTeamOf('3'), '3', '非亚盘形态原样返回(不误截)');
console.log('mini_judge 全部通过 ✓');
