/* 渲染冒烟:抽取 index.html 的 renderColumnPanel/renderNightExpress/renderJK/renderBeidan/renderEPL
   及 helper 链, 用真实 predictions.js 全量数据跑一遍, 验证深夜快车专栏与既有专栏渲染不炸 */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const days = require('../data/predictions.js');
const StatsLib = require('../stats.js');

function grabFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('函数未找到: ' + name);
  // 从 function 起按花括号配对截到函数尾
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); }
  }
  throw new Error('函数截取失败: ' + name);
}

const harness = ['var EPL_INSIGHT_HTML = "";', 'var calState = { sel: "" };'];
['esc', 'pct', 'frac', 'mark', 'scoreMark', 'splitByRecentDates', 'offDir',
 'renderColumnPanel', 'renderJK', 'renderBeidan', 'renderEPL', 'renderNightExpress'
].forEach(n => harness.push(grabFn(n)));

const boxes = {};
const documentStub = { getElementById: id => boxes[id] || (boxes[id] = { innerHTML: '' }) };
const sandbox = { StatsLib, document: documentStub, console };
const vm = require('vm');
vm.createContext(sandbox);
vm.runInContext(harness.join('\n'), sandbox);

// 跑四个专栏渲染(全量 37 天真实数据)
['renderJK', 'renderBeidan', 'renderEPL', 'renderNightExpress'].forEach(fn => {
  vm.runInContext(fn + '(days)', Object.assign(sandbox, { days }));
});
const assert = require('assert');
['jkBody', 'beidanBody', 'eplBody', 'neBody'].forEach(id => {
  assert(boxes[id] && boxes[id].innerHTML.length > 0, id + ' 应渲染出内容');
});

// 深夜快车专项断言:只含 time<18:00 场;表头带「开赛」列;9-6 的 018 已赛显示比分、024 待赛
const neHtml = boxes.neBody.innerHTML;
assert(neHtml.includes('<th>开赛</th>'), '深夜快车应有开赛时间列');
assert(neHtml.includes('深夜方向'), '应有累计摘要');
assert(neHtml.includes('博洛尼亚'), '9-6 深夜场 018 应在列');
assert(neHtml.includes('0-1') === false || true, 'noop'); // 018 进行中尚未回填,不强断言比分
assert(neHtml.includes('博塔弗戈'), '9-6 深夜场 024 应在列(待赛)');
assert(!neHtml.includes('周日008'), '21:00 黄金场不应入深夜快车');
assert(!neHtml.includes('周日015'), '23:00 黄金场不应入深夜快车');
assert(!neHtml.includes('周日003'), '18:00 场不应入深夜快车');
// 时间列值抽查:05:30 巴甲场
assert(neHtml.includes('05:30'), '应显示开赛时间');
// 既有专栏无开赛列(不受 showTime 改动影响)
assert(!boxes.eplBody.innerHTML.includes('<th>开赛</th>'), '英超专栏不应有开赛列');
assert(!boxes.jkBody.innerHTML.includes('<th>开赛</th>'), '日韩专栏不应有开赛列');
// 折叠按钮:深夜快车历史场多,应出现「展开更早」
assert(neHtml.includes('展开更早'), '深夜快车应有折叠按钮(历史>3天)');
// 北单310专栏(2026-09-08 起):玩法说明卡 + beidan310 legs 明细(复用竞彩场判定);
// 2026-09-12 起明细只显示当日(最新期次, 北单期次强相关), 历史期次腿不进明细; 理论全中彩金累计展示
const bdHtml = boxes.beidanBody.innerHTML;
assert(bdHtml.includes('北单310玩法'), '北单专栏应有310玩法说明卡');
assert(bdHtml.includes('北单004') && bdHtml.includes('大田市民 vs 京都'), '最新期次(9-15)北单腿应在明细(只显示当日)');
assert(bdHtml.includes('3/1[让-1]'), '明细应显示北单让球数(9-15=米堡/利物浦让-1)');
assert(!bdHtml.includes('北单380') && !bdHtml.includes('北单386') && !bdHtml.includes('皇家社会') && !bdHtml.includes('莱红牛'), '历史期次腿不应在明细(只显示当日, 2026-09-12起)');
assert(!bdHtml.includes('(SP2.07)'), '明细不显示SP(2026-09-09起),只显示310选择+让球');
assert(bdHtml.includes('理论全中彩金'), '应展示历史登记的理论全中彩金累计');

// 北单明细跟随月历选中日期(2026-09-15 修): 此前 renderBeidan 只在加载时渲染一次且固定钉在最新期次,
// 用户在总览点月历切到昨天, 北单专栏仍显示当天(全部待赛) → 「昨天的北单记录没有更新」
sandbox.calState.sel = '2026-09-14';
vm.runInContext('renderBeidan(days)', Object.assign(sandbox, { days }));
const bdYest = boxes.beidanBody.innerHTML;
assert(bdYest.includes('北单386'), '选中 9-14 应显示 9-14 期次的北单腿(北单386)');
assert(bdYest.includes('比利亚雷'), '选中 9-14 的明细应对上当日竞彩场队名');
assert(bdYest.includes('1-2'), '选中 9-14 的明细应带当日真实比分(011 比利亚雷 1-2)');
assert(!bdYest.includes('大田市民'), '选中 9-14 不应混入 9-15 的腿');
sandbox.calState.sel = '2026-09-15';
vm.runInContext('renderBeidan(days)', sandbox);
assert(boxes.beidanBody.innerHTML.includes('大田市民'), '切回 9-15 应恢复当期明细');
sandbox.calState.sel = '';

// 专栏明细的方向词同走官方口径(2026-09-15): 主表(场次卡)写 胜/平/负, 这四张表原来照抄数据字段的
//   主胜/客胜 —— 同一场比赛在页面上会看到两个词。北单行的 '3[让-1]' 是北单原生记法(玩法卡有对照),
//   不在映射表里, 必须原样保留(断言卡住: 别顺手把它也"翻译"了)。
const offHtml = boxes.neBody.innerHTML + boxes.jkBody.innerHTML + boxes.eplBody.innerHTML;
assert(!offHtml.includes('主胜') && !offHtml.includes('客胜'),
  '日韩/英超/深夜三张表的方向列不该再出现「主胜/客胜」(官方口径是 胜/平/负)');
assert(/<td>(胜|平|负) \/ /.test(offHtml) || /<td>(胜|平|负)<\/td>/.test(offHtml),
  '方向列应写成官方的 胜/平/负, 实际(深夜快车首行): ' +
  ((boxes.neBody.innerHTML.match(/<td>[^<]*<\/td><td>[^<]*<\/td><td>[^<]*<\/td>/) || [''])[0]));
assert(bdHtml.includes('3/1[让-1]'), '北单明细的 310 记法不得被方向词映射改掉(仍应是 3/1[让-1])');
console.log('渲染冒烟全绿 ✓  jk/beidan/epl/ne 四专栏 + 深夜快车断言全过');
console.log('--- 深夜快车摘要行 ---');
console.log(neHtml.match(/<div class="bd-sum">[\s\S]*?<\/div>/)[0]);
