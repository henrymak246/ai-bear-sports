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

  /* 10) 小程序侧: 云可用时 fetchBoard 走云函数、不发 HTTP(真机唯一可用路径)
     —— 这正是修「真机比分永远空」的核心断言: 若哪天有人把 defaultFetcher 塞回来, 这里必红。 */
  const espnCalls = [];
  let espnHttpHits = 0;
  const realFetch2 = global.fetch;
  global.fetch = function () { espnHttpHits++; return Promise.reject(new Error('云通道下不应直连 ESPN')); };
  global.wx = {
    cloud: {
      callFunction(o) {
        espnCalls.push(o);
        return Promise.resolve({ result: { ok: true, data: [{ home: 'Middlesbrough', away: 'Millwall', hs: '2', as: '1', st: 'STATUS_FULL_TIME' }] } });
      },
      init() {},
    },
  };
  assert.strictEqual(espn.cloudReady(), true, '有 wx.cloud 时 espn.cloudReady 应为 true');
  const rows = await espn.fetchBoard('eng.2', '20260915');
  assert.strictEqual(rows[0].home, 'Middlesbrough', '应解包云函数归一化行');
  assert.strictEqual(espnCalls.length, 1, '应调用一次云函数');
  assert.deepStrictEqual(espnCalls[0].data, { fn: 'espn_scoreboard', args: { league: 'eng.2', date: '20260915' } }, '入参形态: {fn, args:{league,date}}');
  assert.strictEqual(espnHttpHits, 0, '云通道生效时不得直连 ESPN');
  const dedup = espn.makeBoardFetcher({});
  const u = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20260915';
  await dedup(u); await dedup(u);
  await espn.fetchBoard('esp.1', '20260915', dedup);
  assert.strictEqual(espnCalls.length, 2, '同 URL 去重后应只多一次云调用(共 2 次), 实际 ' + espnCalls.length);
  console.log('⑩ 小程序侧走云函数 ✓  (解包/入参/不去直连/URL 去重)');

  /* 11) 云通道失败 → 抛出带原因的错误(结算侧 try/catch 吞掉后回退 finalScore, 不炸页面) */
  global.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: false, error: 'ESPN esp.1@20260915 HTTP 500' } });
  let espnMsg = '';
  await espn.fetchBoard('esp.1', '20260915').catch((e) => { espnMsg = String(e.message); });
  assert(/云函数 espn_scoreboard 失败/.test(espnMsg) && /HTTP 500/.test(espnMsg), '失败原因应透传, 实际: ' + espnMsg);
  console.log('⑪ 云通道失败透传 ✓  (' + espnMsg.slice(0, 46) + '…)');

  global.fetch = realFetch2;
  delete global.wx;
  console.log('云函数通道冒烟全绿 ✓');
})().catch((e) => { console.error('云函数通道冒烟失败: ' + ((e && e.stack) || e)); process.exit(1); });
