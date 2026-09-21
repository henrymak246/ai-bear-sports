/* matchTable 冒烟: 抽 matchTable+helper 链, 全量真实数据跑一遍,
   断言 9-8 胆场(雅典AEK)竞彩行显 ★★★★★, 003 亚盘行显 ★★★★ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const days = require('../data/predictions.js');

function grabFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('函数未找到: ' + name);
  let depth = 0, j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); }
  }
  throw new Error('函数截取失败: ' + name);
}

const harness = ['var EPL_INSIGHT_HTML = "";'];
['esc', 'pct', 'frac', 'mark', 'scoreMark', 'dtagHtml', 'offDir', 'matchTable'].forEach(n => harness.push(grabFn(n)));
const sandbox = { console, StatsLib: require('../stats.js') };
vm.createContext(sandbox);
vm.runInContext(harness.join('\n'), sandbox);

const assert = require('assert');
let dan5 = 0, checked = 0;
for (const day of days) {
  const out = vm.runInContext('matchTable(day)', Object.assign(sandbox, { day }));
  assert(out && out.includes('<table>'), day.date + ' 应渲染出表格');
  checked++;
  if (day.date === '2026-09-08') {
    assert(out.includes('★★★★★'), '9-8 胆场应显 5 星');
    assert(out.includes('雅典AEK-0.75 <span class="stars">★★★</span>'), '002 亚盘应显 3 星');
    assert(out.includes('布鲁日-0 <span class="stars">★★★★</span>'), '003 亚盘应显 4 星');
    assert(out.includes('信心★为1-5星'), '图例应为 1-5 口径');
  }
}
// 历史天: 每天胆(key 腿)所在场应显 5 星(统计验证)
// ★胆块: 合并后(9-21 起)是 combo7, 之前是 max7 —— 按"当天实际有什么"取, 两种日子都跑得起来
for (const day of days) {
  const blk = day.combo7 || day.max7;
  const keys = (blk && blk.legs || []).filter(l => l.key);
  if (!keys.length) continue;
  const out = vm.runInContext('matchTable(day)', Object.assign(sandbox, { day }));
  const num = keys[0].match.slice(0, 3);
  const m = day.matches.find(x => x.id && x.id.endsWith(num));
  if (m && m.confidence === 5) dan5++;
}
console.log('matchTable 冒烟全绿 ✓', checked, '天全量渲染通过; 9-8 胆 5 星断言过; 历史胆 5 星天数:', dan5);
