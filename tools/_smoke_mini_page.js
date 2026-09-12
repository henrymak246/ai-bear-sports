/* tools/_smoke_mini_page.js — 小程序推荐页冒烟(node 伪 Page/wx 环境)
 * 覆盖: ① Page 注册器捕获 index.js 的 data 默认值 ② buildGroups 纯函数分组断言
 *   (真实 data/predictions.js 的 2026-09-12: 竞彩 29 场/北单 8 腿/亚盘 ahPick 非空场数,
 *    北单 126 美因茨场已完场 1-3 判定=miss)
 * ③ onShow 端到端: 注入假 fetcher 验证 成功渲染 / 失败读缓存 / 失败无缓存 三态。 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- 真实数据 ----
const src = fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8');
const days = new Function(src + ';return PREDICTION_DAYS;')();
const payload = days.find((d) => d.date === '2026-09-12');
assert(payload, '未找到 2026-09-12 数据');

// ---- 伪 wx + Page 注册器 ----
const storage = {};
global.wx = {
  setStorageSync: (k, v) => { storage[k] = v; },
  getStorageSync: (k) => storage[k],
  stopPullDownRefresh: () => {},
};
let captured = null;
global.Page = (cfg) => { captured = cfg; };

const api = require('../miniprogram/utils/api.js');
const judge = require('../miniprogram/utils/judge.js');
const pageMod = require('../miniprogram/pages/index/index.js');

assert(captured, 'index.js 未调用 Page()');
const { buildGroups } = pageMod;
assert.strictEqual(typeof buildGroups, 'function', 'index.js 未导出 buildGroups');

// ---- ① data 默认值 ----
assert.strictEqual(captured.data.tab, 'jc');
assert.deepStrictEqual(captured.data.groups, { jc: [], bd: [], ah: [] });
assert.strictEqual(captured.data.loading, true);
console.log('OK 1/4 data 默认值(tab=jc, groups 空, loading)');

// ---- ② buildGroups 分组断言 ----
const groups = buildGroups(payload, judge);
assert.strictEqual(groups.jc.length, 29, '竞彩组应为 29 场, 实际 ' + groups.jc.length);
assert.strictEqual(groups.bd.length, 8, '北单组应为 8 腿, 实际 ' + groups.bd.length);
const ahCount = payload.matches.filter((m) => m.ahPick).length;
assert(ahCount > 0, '2026-09-12 应有 ahPick 非空场');
assert.strictEqual(groups.ah.length, ahCount, '亚盘组=ahPick 非空场数 ' + ahCount);
const leg126 = groups.bd.find((l) => l.bdNum === '126');
assert(leg126, '北单组缺 bdNum=126 腿');
assert.strictEqual(leg126.home, '美因茨', '126 腿主队切分应为 美因茨, 实际 ' + leg126.home);
assert.strictEqual(leg126.judge, 'miss', '126 美因茨场(完场 1-3, 让0 推荐3)应判 miss, 实际 ' + leg126.judge);
console.log('OK 2/4 buildGroups: 竞彩=' + groups.jc.length + ' 北单=' + groups.bd.length +
  ' 亚盘=' + groups.ah.length + ' 北单126判定=miss');

// ---- ③ onShow 端到端三态 ----
function fakeRes(body) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function newPage() {
  const p = Object.create(captured);
  p.data = JSON.parse(JSON.stringify(captured.data));
  p.setData = function (patch) { Object.assign(this.data, patch); };
  return p;
}
const tick = () => new Promise((r) => setTimeout(r, 100));

(async () => {
  // 成功: 注入假 fetcher 返回 payload
  api.setFetcher(async () => fakeRes([{ date: '2026-09-12', payload }]));
  const p1 = newPage();
  p1.onShow();
  await tick();
  assert.strictEqual(p1.data.errMsg, '');
  assert.strictEqual(p1.data.loading, false);
  assert.strictEqual(p1.data.groups.jc.length, 29, 'onShow 成功态竞彩组应为 29');
  assert(p1.data.lastUpdated, 'lastUpdated 应写入');
  assert(p1.data.dailyTitle, 'dailyPost.title 应写入');
  assert.strictEqual(p1.data.planJc.length, payload.plan.filter((x) => x.market === 'jc').length);
  assert.strictEqual(p1.data.bdDisabled, false, '有北单数据时北单 Tab 可用');
  console.log('OK 3/4 onShow 成功态: 渲染+缓存+lastUpdated(' + p1.data.lastUpdated + ')');

  // 失败→有缓存: 渲染缓存 + 错误横幅
  api.setFetcher(async () => { throw new Error('network down'); });
  const p2 = newPage();
  p2.onShow();
  await tick();
  assert.strictEqual(p2.data.errMsg, '推荐数据拉取失败,显示缓存');
  assert.strictEqual(p2.data.groups.jc.length, 29, '缓存态竞彩组应为 29');
  console.log('OK 4/4a onShow 失败→缓存降级渲染+横幅');

  // 失败→无缓存: 仅错误提示
  delete storage.payloadCache;
  const p3 = newPage();
  p3.onShow();
  await tick();
  assert.strictEqual(p3.data.errMsg, '请检查网络后下拉重试');
  assert.strictEqual(p3.data.groups.jc.length, 0);
  console.log('OK 4/4b onShow 失败→无缓存提示重试');

  console.log('\nSMOKE OK — 推荐页全部断言通过');
})().catch((e) => {
  console.error('SMOKE FAIL:', e && e.message ? e.message : e);
  process.exit(1);
});
