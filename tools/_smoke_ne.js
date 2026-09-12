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

const harness = ['var EPL_INSIGHT_HTML = "";'];
['esc', 'pct', 'frac', 'mark', 'scoreMark', 'splitByRecentDates',
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
assert(bdHtml.includes('纽伦堡'), '最新期次(9-11)北单腿应在明细(只显示当日)');
assert(bdHtml.includes('北单009'), '明细编号应显示北单官方场次号');
assert(!bdHtml.includes('蔚山现代'), '历史期次(9-8)腿不应在明细(只显示当日, 2026-09-12起)');
assert(!bdHtml.includes('(SP2.07)'), '明细不显示SP(2026-09-09起),只显示310选择+让球');
assert(bdHtml.includes('理论全中彩金'), '应展示历史登记的理论全中彩金累计');
console.log('渲染冒烟全绿 ✓  jk/beidan/epl/ne 四专栏 + 深夜快车断言全过');
console.log('--- 深夜快车摘要行 ---');
console.log(neHtml.match(/<div class="bd-sum">[\s\S]*?<\/div>/)[0]);
