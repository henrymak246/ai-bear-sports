/* _smoke_mini_slip.js — 投注参考图内容层 slip.js 的 node 冒烟。
   用法: node tools/_smoke_mini_slip.js */
const assert = require('assert');
const slip = require('../miniprogram/utils/slip.js');

// 真实 9-13 腿型(cart.buildLeg 产出形态)
const bdLeg = { kind: 'bd', bdNum: '342', match: '021 皇家社会 vs 马竞', pick: '0', odds: '1.99', sp3: ['3.20', '3.61', '2.15'], handicap: '0' };
const jcLeg = { kind: 'jcHad', id: '周日003', home: '塞尔塔', away: '马拉加', pick: '3', odds: '1.53' };
const hhLeg = { kind: 'jcHhad', id: '周日009', home: '莱红牛', away: '汉堡', pick: '让-1 3', odds: '1.66' };
const ahLeg = { kind: 'ah', id: '周日011', home: '汉坎', away: '莫尔德', pick: '莫尔德-0.75', odds: '1.96' };

// 1) 行格式: 四类腿型
let rows = slip.slipRows([bdLeg, jcLeg, hhLeg, ahLeg]);
assert.strictEqual(rows.length, 4);
assert.strictEqual(rows[0].title, '北单342 皇家社会 VS 马竞');
assert.strictEqual(rows[0].options, '负(2.15)'); // sp3[2], 非 leg.odds=1.99
assert.strictEqual(rows[1].title, '周日003 塞尔塔 VS 马拉加');
assert.strictEqual(rows[1].options, '主胜(1.53)');
assert.strictEqual(rows[2].title, '周日009 莱红牛 VS 汉堡 [-1]');
assert.strictEqual(rows[2].options, '让球胜(1.66)');
assert.strictEqual(rows[3].title, '周日011 汉坎 VS 莫尔德');
assert.strictEqual(rows[3].options, '亚盘: 莫尔德-0.75 @1.96');
console.log('OK 1/5 四类腿型行格式');

// 2) 北单让球非 0 标题带让球数 + home/away 可选覆盖
const bdHc = Object.assign({}, bdLeg, { handicap: '-1' });
assert.strictEqual(slip.slipRows([bdHc])[0].title, '北单342 皇家社会 VS 马竞 [让-1]');
const bdOv = Object.assign({}, bdLeg, { home: '皇家社会B', away: '马竞B' });
assert.strictEqual(slip.slipRows([bdOv])[0].title, '北单342 皇家社会B VS 马竞B');
console.log('OK 2/5 北单让球数入标题 + home/away 覆盖');

// 3) 复式北单腿顿号连排 + 注数/最高奖金(官方口径: 各腿最大赔率连乘×2)
const bdDbl = Object.assign({}, bdLeg, { pick: '3/1' });
rows = slip.slipRows([bdDbl]);
assert.strictEqual(rows[0].options, '胜(3.20)、平(3.61)');
let t = slip.slipTotals([bdDbl, jcLeg], 2);
assert.strictEqual(t.legCount, 2);
assert.strictEqual(t.stakes, 2); // 2 选项 × 1
assert.strictEqual(t.amount, 4);
assert.strictEqual(t.maxPayout, Math.round(3.61 * 1.53 * 2 * 100) / 100); // max(3.20,3.61)×1.53×2=11.05
console.log('OK 3/5 复式腿连排+官方口径金额');

// 4) 单选对账: bd342 单选 0 + 周日003 主胜 → 1注/2元/6.58元
t = slip.slipTotals([bdLeg, jcLeg], 2);
assert.strictEqual(t.stakes, 1);
assert.strictEqual(t.amount, 2);
assert.strictEqual(t.maxPayout, 6.58);
console.log('OK 4/5 单选金额对账(1注/2元/6.58元)');

// 5) 缺赔率容错: 无 sp3 无 odds → 无括号, 最高奖金按 1 计不放大
const bdNo = { kind: 'bd', bdNum: '001', match: '001 甲 vs 乙', pick: '3', handicap: '0' };
rows = slip.slipRows([bdNo]);
assert.strictEqual(rows[0].options, '胜');
t = slip.slipTotals([bdNo, jcLeg], 2);
assert.strictEqual(t.maxPayout, Math.round(1 * 1.53 * 2 * 100) / 100); // 3.06
console.log('OK 5/5 缺赔率容错');

console.log('\nSMOKE OK — slip.js 全部断言通过');
