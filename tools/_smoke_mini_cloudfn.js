/* _smoke_mini_cloudfn.js — 云函数通道冒烟(2026-09-14 新增, 真机域名白名单根治方案)。
   覆盖三件事:
     1) 云函数核心 core.js: 白名单拦截 + 配置校验 + 真实调 Supabase(用云函数自己的 config.js);
     2) 小程序 api.js 的云通道分支: 造 wx.cloud.callFunction 桩, 断言走云、不走 HTTP、正确解包;
     3) 失败形态: 云函数返回 {ok:false} 时, api 必须抛出带原因的错误(页面才能显示到横幅)。
   用法: node tools/_smoke_mini_cloudfn.js */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const core = require(path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'core.js'));
const FnCfgPath = path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'config.js');
const api = require(path.join(ROOT, 'miniprogram', 'utils', 'api.js'));

/* 1) 白名单 + 配置校验(不联网) */
assert(core.ALLOWED_FNS.length >= 5, '白名单应覆盖 5 个 mini_* 函数');
assert.throws(() => core.assertFn('drop_table'), /不允许/, '非白名单函数应被拒绝');
assert.throws(() => core.assertFn(''), /不允许/, '空函数名应被拒绝');
assert.throws(() => core.assertCfg({ SUPABASE_URL: 'x' }), /配置缺失/, '缺配置应报错');
console.log('① 白名单/配置校验 ✓  (' + core.ALLOWED_FNS.length + ' 个允许函数)');

/* 2) api.js 云通道分支(纯桩, 不联网) */
(async () => {
  const calls = [];
  const realFetch = global.fetch;
  let httpHits = 0;
  global.fetch = function () { httpHits++; return Promise.reject(new Error('云通道下不应走 HTTP')); };
  global.wx = {
    cloud: {
      callFunction(opts) {
        calls.push(opts);
        return Promise.resolve({ result: { ok: true, data: [{ date: '2026-09-14', matches: [] }] } });
      },
      init() {},
    },
  };
  api.setFetcher(null); // 清掉可能注入的 fetcher, 确保走云分支

  assert.strictEqual(api.cloudReady(), true, '有 wx.cloud 时 cloudReady 应为 true');
  const payload = await api.fetchTodayPayload();
  assert.strictEqual(calls.length, 1, '应调用一次云函数');
  assert.strictEqual(calls[0].name, 'bear_api', '云函数名应为 bear_api');
  assert.deepStrictEqual(calls[0].data, { fn: 'mini_get_today_payload', args: {} }, '入参形态: {fn, args}');
  assert.strictEqual(payload[0].date, '2026-09-14', '应解包 result.data');
  assert.strictEqual(httpHits, 0, '云通道生效时不得发起 HTTP 请求');
  console.log('② api.js 云通道: 走云函数/不走HTTP/解包正确 ✓');

  /* 3) 云函数失败形态 → api 抛错(页面横幅可见) */
  global.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: false, error: '云函数配置缺失: MINI_TOKEN' } });
  let msg = '';
  await api.fetchTodayPayload().catch((e) => { msg = String(e.message); });
  assert(msg.indexOf('云函数配置缺失') >= 0, '失败原因应透传到调用方, 实际: ' + msg);
  console.log('③ 失败原因透传 ✓  (' + msg.slice(0, 40) + '…)');

  /* 4) saveBet 也走云通道(组串保存与推荐读取同源 —— 真机故障时两者一起挂/一起好) */
  global.wx.cloud.callFunction = (o) => { calls.push(o); return Promise.resolve({ result: { ok: true, data: { id: 7 } } }); };
  const row = await api.saveBet({ bet_date: '2026-09-14', stake: 2 });
  assert.strictEqual(row.id, 7, 'saveBet 应解包云函数返回');
  const last = calls[calls.length - 1].data;
  assert.strictEqual(last.fn, 'mini_save_bet', 'saveBet 应调 mini_save_bet');
  assert.strictEqual(last.args.p_bet.bet_date, '2026-09-14', 'args 应透传 p_bet');
  console.log('④ saveBet(组串保存)走云通道 ✓');

  global.fetch = realFetch;
  delete global.wx;

  /* 5) 真实调用: 用云函数自己的 config.js 直连 Supabase —— 部署前先确认函数体内的配置与出网逻辑可用 */
  if (!fs.existsSync(FnCfgPath)) {
    console.log('⑤ 跳过真实调用: miniprogram/cloudfunctions/bear_api/config.js 不存在');
    return;
  }
  const cfg = require(FnCfgPath);
  const data = await core.callSupabaseRpc('mini_get_today_payload', null, cfg);
  const day = Array.isArray(data) ? data[0] : data;
  assert(day && day.date, '真实调用应返回带 date 的 payload');
  assert(Array.isArray(day.matches), 'payload.matches 应为数组');
  console.log('⑤ 云函数核心真实调用 ✓  date=' + day.date + ' 场次数=' + day.matches.length
    + ' 北单腿=' + ((day.beidan310 && day.beidan310.legs) || []).length);

  /* 6) ★Node16 兜底: 微信云函数运行时是 Node16.13, 没有全局 fetch(2026-09-14 实际踩到
     "fetch is not defined")。临时摘掉 fetch 强制走 https.request —— 这条才是云上真走的路径。 */
  const savedFetch = globalThis.fetch;
  delete globalThis.fetch;
  try {
    assert(typeof fetch === 'undefined', '全局 fetch 应已摘除(否则本用例无效)');
    const data2 = await core.callSupabaseRpc('mini_get_today_payload', null, cfg);
    const day2 = Array.isArray(data2) ? data2[0] : data2;
    assert(day2 && day2.date === day.date, 'https 兜底应返回同一份 payload');
    console.log('⑥ Node16 兜底(https.request, 无 fetch)真实调用 ✓  date=' + day2.date);
  } finally {
    globalThis.fetch = savedFetch;
  }
  console.log('云函数通道冒烟全绿 ✓');
})().catch((e) => { console.error('云函数通道冒烟失败: ' + ((e && e.stack) || e)); process.exit(1); });
