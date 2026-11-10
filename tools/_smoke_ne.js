/* 首页精简与三时段8拖冒烟：真实 index.html 函数 + 内存 fixture，不改 predictions.js。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function grabFn(name) {
  const i = html.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('函数未找到: ' + name);
  let depth = 0;
  const j = html.indexOf('{', i);
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.slice(i, k + 1); }
  }
  throw new Error('函数截取失败: ' + name);
}

// 五个取消栏目：容器与主动渲染调用都消失；底层函数保留给历史统计/兼容。
['combo7Blocks', 'max7Blocks', 'neBody', 'xinshuiBody', 'beidanBody'].forEach(id => {
  assert(!html.includes('id="' + id + '"'), '已取消栏目不应保留容器 #' + id);
});
['renderCombo7', 'renderMax7', 'renderNightExpress', 'renderXinshui', 'renderBeidan'].forEach(fn => {
  assert(!html.includes(fn + '(days);'), '不应再主动调用 ' + fn);
  assert(html.includes('function ' + fn + '('), '历史兼容函数应保留: ' + fn);
});

const todayHtml = html.match(/<section id="sec-today">([\s\S]*?)<\/section>/)[1];
const dailyPos = todayHtml.indexOf('id="dailyPostBox"');
const investPos = todayHtml.indexOf('id="investPanel"');
const listPos = todayHtml.indexOf('id="dailyList"');
assert(dailyPos >= 0 && investPos > dailyPos && listPos > investPos,
  '今日区顺序必须为每日发布→投资策略→每日预测');
const columnsHtml = html.match(/<section id="sec-columns">([\s\S]*?)<\/section>/)[1];
assert(columnsHtml.includes('id="eplPanel"') && columnsHtml.includes('id="jkPanel"'),
  '专栏区必须同时包含英超和日韩');
assert(!columnsHtml.includes('id="investPanel"'), '投资策略不得继续留在专栏区');
assert(html.includes('renderJK(days);'), '日韩专栏应恢复主动渲染');
assert(html.includes('id="slot8Blocks"'), '应新增三时段8拖容器');
assert(html.includes('renderSlot8(days);'), '当日详情应渲染三时段8拖');

const asianLeg = (id, play, odds, result) => ({
  id, match: id + ' 主队 vs 客队', pick: play === '亚盘' ? '主队 -0.25' : '大2.5',
  play, odds, reason: '内存fixture理由', result: result || null
});
const beidanLeg = (num, result) => ({
  bdNum: num, match: '北单' + num + ' 主队 vs 客队', pick: '3/1', handicap: 0,
  sp3: '2.35', note: '北单内存fixture', result: result || null
});
const fixture = {
  date: '2026-11-08',
  slot8: {
    early: {
      asian: { legs: [asianLeg('周六001', '亚盘', '1.86', 'hit'), asianLeg('周六002', '大小球', null)], totalOdds: '待补', cost: 2, result: null },
      beidan: { issue: '26113', legs: [beidanLeg('101')], stakes: 32, cost: 64, result: null }
    },
    night: {
      asian: { legs: [asianLeg('周六003', '大小球', '1.95')], totalOdds: '8.20倍', cost: 2, result: 'miss' },
      beidan: { issue: '26113', legs: [beidanLeg('102', 'hit')], stakes: 16, cost: 32, result: 'hit' }
    },
    late: {
      asian: { legs: [asianLeg('周日001', '亚盘', '待补')], totalOdds: null, cost: 2, result: null },
      beidan: { issue: '26114', legs: [beidanLeg('103')], stakes: 8, cost: 16, result: null }
    }
  },
  score3: {
    totalOdds: '约1000倍', result: null,
    legs: [
      { match: '001 甲 vs 乙', pick: ['1:0', '2:0', '2:1'], odds: ['6.5', '7.5', '8.0'], reason: '第一场', result: null },
      { match: '002 丙 vs 丁', pick: ['0:1', '0:2', '1:2'], odds: ['7.0', '8.0', '9.0'], reason: '第二场', result: 'hit' },
      { match: '003 戊 vs 己', pick: ['1:1', '2:2', '3:3'], odds: ['6.0', '11', '30'], reason: '第三场', result: 'miss' }
    ]
  },
  plan: [{ name: '💰 投注建议', pct: '方案125元', result: 'hit', text: '稳定9元+增强4元+彩票112元' }]
};

const harness = [
  'var calState = { sel: "2026-11-08" };',
  'var byDate = {}; var days = [];',
  'function pickDay(pred) { var sel = byDate[calState.sel]; return (sel && pred(sel)) ? sel : days.find(pred); }',
  grabFn('esc'), grabFn('renderSlot8'), grabFn('renderScore3'), grabFn('renderDailyPost'), grabFn('renderInvest')
];
const boxes = {};
const sandbox = {
  console,
  document: { getElementById: id => boxes[id] || (boxes[id] = { innerHTML: '' }) }
};
vm.createContext(sandbox);
vm.runInContext(harness.join('\n'), sandbox);
sandbox.days = [fixture];
sandbox.byDate[fixture.date] = fixture;

vm.runInContext('renderSlot8(days)', sandbox);
const slotHtml = boxes.slot8Blocks.innerHTML;
['早场', '06:00–17:59', '夜场', '18:00–23:59', '深夜', '次日00:00–05:59',
  '亚盘让球+大小球混编2串', '北单8拖', '26113', '26114', '32注', '64元', '待补',
  '亚盘', '大小球', '2.35', '红', '黑', '内存fixture理由'].forEach(text => {
  assert(slotHtml.includes(text), '三时段8拖应显示「' + text + '」');
});
assert.strictEqual((slotHtml.match(/class="slot8-card/g) || []).length, 3, '应恰好渲染早/夜/深夜三档');
assert.strictEqual((slotHtml.match(/class="slot8-ticket/g) || []).length, 6, '每档应上下排亚盘与北单两张票');
assert(html.includes('.slot8-grid { display:block; }'), '三时段应取消左右grid, 改为纵向表格');
const firstSlot = slotHtml.split('class="slot8-card')[1];
assert(firstSlot.indexOf('亚盘让球+大小球混编2串') < firstSlot.indexOf('北单8拖'), '每档亚盘表必须在北单表上方');

vm.runInContext('renderScore3(days)', sandbox);
const scoreHtml = boxes.score3Blocks.innerHTML;
assert.strictEqual((scoreHtml.match(/<tr>/g) || []).length, 4, '幸福比分应为表头+恰好3场');
['1:0 / 2:0 / 2:1', '6.5 / 7.5 / 8.0', '0:1 / 0:2 / 1:2', '1:1 / 2:2 / 3:3'].forEach(text => {
  assert(scoreHtml.includes(text), '每场应显示3个比分及对应SP: ' + text);
});

// 旧数据 pick/odds 单值仍可直接展示，不拆字符、不出现 undefined。
const old = { date: '2026-11-07', score3: { legs: [{ match: '旧场', pick: '2:1', odds: '7.5', result: null }] } };
sandbox.days = [old]; sandbox.byDate = { '2026-11-07': old }; sandbox.calState.sel = old.date;
vm.runInContext('renderScore3(days)', sandbox);
assert(boxes.score3Blocks.innerHTML.includes('2:1') && boxes.score3Blocks.innerHTML.includes('7.5'), '旧单值比分历史应兼容');
assert(!boxes.score3Blocks.innerHTML.includes('undefined'), '旧单值比分不得渲染 undefined');

sandbox.days = [{ date: '2026-11-08', dailyPost: '完整复盘正文' }];
sandbox.byDate = { '2026-11-08': sandbox.days[0] };
sandbox.calState.sel = '2026-11-08';
vm.runInContext('renderDailyPost(days)', sandbox);
assert(boxes.dailyPostBox.innerHTML.includes('完整复盘正文'), '字符串dailyPost必须直接渲染');

const investDays = Array.from({ length: 8 }, (_, i) => ({
  date: '2026-11-' + String(8 - i).padStart(2, '0'),
  plan: [{ name: '💰 投注建议', pct: '方案' + (100 + i) + '元', result: i % 2 ? 'miss' : 'hit', text: '第' + (i + 1) + '天方案明细' }]
}));
sandbox.days = investDays;
vm.runInContext('renderInvest(days)', sandbox);
const investHtml = boxes.investBody.innerHTML;
assert.strictEqual((investHtml.match(/<table/g) || []).length, 2, '投资策略应为三层策略表+每日方案表');
['层级', '稳定层', '增强层', '彩票层', '日期', '方案金额', '结果', '方案明细', '第7天方案明细'].forEach(text => {
  assert(investHtml.includes(text), '投资策略表格应包含「' + text + '」');
});
['入场条件', '仓位依据', '风险控制', '复盘口径', '何时不做'].forEach(text => {
  assert(investHtml.includes(text), '投资策略必须详述「' + text + '」');
});
assert(!investHtml.includes('第8天方案明细'), '每日方案只展示近7日');
assert(!investHtml.includes('已证伪砍掉') && !investHtml.includes('比分已砍'), '应删除过期砍板块文案');

console.log('SMOKE OK — 五栏目取消、slot8三档六票、score3 3×3及旧单值、投资双表格全过');
