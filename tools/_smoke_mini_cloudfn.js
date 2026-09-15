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
const espn = require(path.join(ROOT, 'miniprogram', 'utils', 'espn.js'));

/* 1) 白名单 + 配置校验(不联网)
   ★逐名断言而非只数个数: 真正的失败模式是"SQL 上了、页面上了、忘了重新部署云函数"——
     个数断言涨到 7 也照样过, 而真机上点保存/删除会报「云函数不允许的调用」。
     改这里必须同时重新部署: cli.bat cloud functions deploy --env cloud1-d7gvezd3td3d2467d
       --names bear_api --remote-npm-install --project ...\miniprogram */
['mini_get_today_payload', 'mini_get_payload_by_date', 'mini_save_bet', 'mini_list_bets',
 'mini_update_bet', 'mini_edit_bet', 'mini_delete_bet'].forEach(function (fn) {
  assert(core.ALLOWED_FNS.indexOf(fn) >= 0, '白名单缺 ' + fn + '(云函数未同步 redeploy?)');
});
assert.throws(() => core.assertFn('drop_table'), /不允许/, '非白名单函数应被拒绝');
assert.throws(() => core.assertFn(''), /不允许/, '空函数名应被拒绝');
assert.throws(() => core.assertCfg({ SUPABASE_URL: 'x' }), /配置缺失/, '缺配置应报错');
console.log('① 白名单/配置校验 ✓  (' + core.ALLOWED_FNS.length + ' 个允许函数, 逐名核对)');

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
  /* 7) ESPN 代理 — 参数校验(不联网): 联赛码/日期只放行合法形状, 防云函数被当任意代理 */
  core.assertEspnArgs('esp.1', '20260915');
  core.assertEspnArgs('eng.league_cup', '20260916');
  ['esp.1;drop', '../x', 'ESP.1', '', 'a'.repeat(40), 'esp.1/x'].forEach(function (bad) {
    assert.throws(() => core.assertEspnArgs(bad, '20260915'), /联赛码非法/, '非法联赛码应被拒绝: ' + bad);
  });
  ['2026-09-15', '2026091', '202609150', '', 'abcdefgh'].forEach(function (bad) {
    assert.throws(() => core.assertEspnArgs('esp.1', bad), /日期非法/, '非法日期应被拒绝: ' + bad);
  });
  console.log('⑦ ESPN 代理参数校验 ✓  (非法联赛码/日期逐项拒绝)');

  /* 8) ESPN 代理真实出网(core 层): 9-15 西甲板应为真实赛事(Elche vs Real Madrid 在列) */
  const espnRows = await core.callEspnScoreboard('esp.1', '20260915');
  assert(Array.isArray(espnRows) && espnRows.length > 0, 'ESPN 代理应返回非空赛事数组');
  espnRows.forEach(function (r) {
    assert(typeof r.home === 'string' && typeof r.away === 'string', '归一化行须含 home/away 字符串');
    assert('hs' in r && 'as' in r && 'st' in r, '归一化行须含 hs/as/st');
  });
  const rm = espnRows.filter(function (r) { return /Elche/.test(r.home) && /Real Madrid/.test(r.away); })[0];
  assert(rm, '9-15 西甲板应含 Elche vs Real Madrid(实际: ' + espnRows.map(function (r) { return r.home; }).join('/') + ')');
  console.log('⑧ ESPN 代理真实调用 ✓  ' + espnRows.length + ' 场, 含 Elche vs Real Madrid(st=' + rm.st + ')');

  /* 9) 入口分发: index.js 的 espn_scoreboard 分支不碰 Supabase 配置(Bear_API 部署后真机走这条路) */
  const fnMain = require(path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'index.js')).main;
  const rOk = await fnMain({ fn: 'espn_scoreboard', args: { league: 'esp.1', date: '20260915' } });
  assert(rOk && rOk.ok === true, '入口应返回 ok:true, 实际: ' + JSON.stringify(rOk).slice(0, 200));
  assert(Array.isArray(rOk.data) && rOk.data.length === espnRows.length, '入口 data 应与 core 直调一致');
  const rBad = await fnMain({ fn: 'espn_scoreboard', args: { league: 'bad code', date: '20260915' } });
  assert(rBad && rBad.ok === false && /联赛码非法/.test(rBad.error), '非法入参应返回 ok:false + 原因');
  console.log('⑨ 云函数入口分发 ✓  (espn_scoreboard 免 Supabase 配置, 非法入参回 ok:false)');

  /* 10) ★真机通道(2026-09-15 实测改口径): 真机上 ESPN 两条路都堵 —— wx.request 受白名单限制,
     云函数出网被 ESPN 自家 CDN 403(Akamai Access Denied)。故真机上必须**一个请求都不发**,
     直接失败让结算回退当日 finalScore。这条断言就是"别再往真机加 ESPN 请求"的看门人。 */
  const espnCalls = [];
  let espnHttpHits = 0;
  const realFetch2 = global.fetch;
  global.fetch = function () { espnHttpHits++; return Promise.reject(new Error('真机上不应发任何 ESPN 请求')); };
  global.wx = {
    cloud: {
      callFunction(o) {
        espnCalls.push(o);
        return Promise.resolve({ result: { ok: true, data: [{ home: 'Middlesbrough', away: 'Millwall', hs: '2', as: '1', st: 'STATUS_FULL_TIME' }] } });
      },
      init() {},
    },
    getSystemInfoSync: () => ({ platform: 'android' }), // 真机形态
  };
  assert.strictEqual(espn.cloudReady(), true, '有 wx.cloud 时 espn.cloudReady 应为 true(Supabase 侧仍走云)');
  assert.strictEqual(espn.espnDirect(), false, '真机(platform=android)应判定不可直连 ESPN');
  let devMsg = '';
  await espn.fetchBoard('eng.2', '20260915').catch((e) => { devMsg = String(e.message); });
  assert(/ESPN 真机不可达/.test(devMsg), '真机应立刻失败并说明原因, 实际: ' + devMsg);
  assert.strictEqual(espnHttpHits, 0, '真机不得发 HTTP 请求');
  assert.strictEqual(espnCalls.length, 0, '★真机不得调云函数取比分(云出网已被 ESPN 403, 调了只是白烧配额)');
  const dedup = espn.makeBoardFetcher({});
  const u = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20260915';
  await dedup(u).catch(() => {}); await dedup(u).catch(() => {});
  assert.strictEqual(espnHttpHits + espnCalls.length, 0, '取板器在真机上同样零请求');
  console.log('⑩ 真机零请求(直接回退 finalScore) ✓  (判定/不直连/不调云/取板器同口径)');

  /* 11) 开发者工具: platform=devtools → 走 wx.request 直连(工具里须勾「不校验合法域名」), 供比分联调 */
  global.wx.getSystemInfoSync = () => ({ platform: 'devtools' });
  assert.strictEqual(espn.espnDirect(), true, '开发者工具应允许直连 ESPN');
  let wxHits = 0;
  global.wx.request = (o) => {
    wxHits++;
    o.success({
      statusCode: 200,
      data: { events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Elche' }, score: '1' }, { homeAway: 'away', team: { displayName: 'Real Madrid' }, score: '2' }] }], status: { type: { name: 'STATUS_FULL_TIME' } } }] },
    });
  };
  const rows = await espn.fetchBoard('esp.1', '20260915');
  assert.strictEqual(wxHits, 1, '开发者工具应经 wx.request 直连 ESPN');
  assert.strictEqual(espnHttpHits, 0, '不应绕过 wx.request 走 node fetch');
  assert.strictEqual(rows[0].home, 'Elche', '直连通道应返回归一化行');
  assert.strictEqual(espnCalls.length, 0, '开发者工具直连时不应调云函数');
  console.log('⑪ 开发者工具直连 ✓  (wx.request 取板/归一化/不入云)');

  /* 12) 云代理通道仍可显式启用(给将来接境外中转留的开关): 传 cloudFetcher 或 config.ESPN_CLOUD=true */
  global.wx.getSystemInfoSync = () => ({ platform: 'android' });
  const rowsCloud = await espn.fetchBoard('eng.2', '20260915', espn.cloudFetcher);
  assert.strictEqual(rowsCloud[0].home, 'Middlesbrough', '显式走云时应解包归一化行');
  assert.strictEqual(espnCalls.length, 1, '应调用一次云函数');
  assert.deepStrictEqual(espnCalls[0].data, { fn: 'espn_scoreboard', args: { league: 'eng.2', date: '20260915' } }, '入参形态: {fn, args:{league,date}}');
  global.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: false, error: 'ESPN esp.1@20260915 HTTP 403: Access Denied' } });
  let espnMsg = '';
  await espn.fetchBoard('esp.1', '20260915', espn.cloudFetcher).catch((e) => { espnMsg = String(e.message); });
  assert(/云函数 espn_scoreboard 失败/.test(espnMsg) && /403/.test(espnMsg), '失败原因应透传, 实际: ' + espnMsg);
  console.log('⑫ 云代理开关(中转预留) ✓  (' + espnMsg.slice(0, 46) + '…)');

  global.fetch = realFetch2;
  delete global.wx;
  console.log('云函数通道冒烟全绿 ✓');
})().catch((e) => { console.error('云函数通道冒烟失败: ' + ((e && e.stack) || e)); process.exit(1); });
