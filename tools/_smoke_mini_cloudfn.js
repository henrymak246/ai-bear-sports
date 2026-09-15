/* _smoke_mini_cloudfn.js — 云函数通道冒烟(2026-09-14 新增, 真机域名白名单根治方案)。
   覆盖三件事:
     1) 云函数核心 core.js: 白名单拦截 + 配置校验 + 真实调 Supabase(用云函数自己的 config.js);
     2) 小程序 api.js 的云通道分支: 造 wx.cloud.callFunction 桩, 断言走云、不走 HTTP、正确解包;
     3) 失败形态: 云函数返回 {ok:false} 时, api 必须抛出带原因的错误(页面才能显示到横幅);
     4) ESPN 比分通道(⑦–⑬): 参数校验 + 真实出网 + 入口分发 + 三种通道状态(config 桩注入)
        + 主机名闸门(全链路必须 site.web.api.espn.com, site.api 被 ESPN 的 Akamai 403)。
   ESPN 主机名/开关的任何改动都要连跑: 本文件 + 重新部署云函数 + tools/_diag_espn.js(模拟器直调云上函数)。
   用法: node tools/_smoke_mini_cloudfn.js */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const core = require(path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'core.js'));
const FnCfgPath = path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'config.js');
const api = require(path.join(ROOT, 'miniprogram', 'utils', 'api.js'));
const espn = require(path.join(ROOT, 'miniprogram', 'utils', 'espn.js'));
const jc = require(path.join(ROOT, 'miniprogram', 'utils', 'jc.js'));

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

  /* 10) ★通道选择(2026-09-15 二次改口径): 用 require.cache 注入 config 桩, **不动真实 config.js**,
     一次跑遍三种状态 —— 桩对象是活的, 改 ESPN_CLOUD 即换行为(espn.js 调用时才读 config)。
     背景: 真机 wx.request 直连 ESPN 配不进域名白名单(无法 ICP 备案); 云函数出网到
     site.api.espn.com 也曾被 Akamai 403 —— 但 2026-09-15 查明那是**主机名级**封锁,
     换成 site.web.api.espn.com 后腾讯云实测 200, 故现在真机比分改回走云通道。 */
  const cfgPath = require.resolve(path.join(ROOT, 'miniprogram', 'utils', 'config.js'));
  const cfgStub = { id: cfgPath, filename: cfgPath, loaded: true, exports: { USE_CLOUD: true, ESPN_CLOUD: false } };
  require.cache[cfgPath] = cfgStub;

  const espnCalls = [];
  let espnHttpHits = 0;
  let wxHits = 0;
  const realFetch2 = global.fetch;
  global.fetch = function () { espnHttpHits++; return Promise.reject(new Error('不应发 node fetch')); };
  global.wx = {
    cloud: {
      callFunction(o) {
        espnCalls.push(o);
        return Promise.resolve({ result: { ok: true, data: [{ home: 'Elche', away: 'Real Madrid', hs: '1', as: '2', st: 'STATUS_FULL_TIME' }] } });
      },
      init() {},
    },
    getSystemInfoSync: () => ({ platform: 'android' }), // 真机形态
    request: (o) => { wxHits++; o.fail({ errMsg: 'request:fail url not in domain list' }); },
  };

  /* 10a) 开关关 + 真机 → 零请求(没接中转时别白烧云调用, 直接失败让结算回退当日 finalScore) */
  assert.strictEqual(espn.espnCloudEnabled(), false, 'config 桩 ESPN_CLOUD=false 时开关应为 false');
  assert.strictEqual(espn.cloudReady(), true, '有 wx.cloud 时 espn.cloudReady 应为 true(Supabase 侧仍走云)');
  assert.strictEqual(espn.espnDirect(), false, '真机(platform=android)应判定不可直连 ESPN');
  let devMsg = '';
  await espn.fetchBoard('eng.2', '20260915').catch((e) => { devMsg = String(e.message); });
  assert(/ESPN 真机不可达/.test(devMsg), '真机+开关关 应立刻失败并说明原因, 实际: ' + devMsg);
  assert.strictEqual(espnHttpHits + wxHits, 0, '真机不得发 HTTP 请求');
  assert.strictEqual(espnCalls.length, 0, '开关关时不得调云函数取比分');
  const dedup = espn.makeBoardFetcher({});
  const u = espn.boardUrl('esp.1', '20260915');
  await dedup(u).catch(() => {}); await dedup(u).catch(() => {});
  assert.strictEqual(espnHttpHits + wxHits + espnCalls.length, 0, '取板器在"开关关+真机"下同样零请求');
  console.log('⑩ 开关关 + 真机: 零请求(回退 finalScore) ✓  (判定/不直连/不调云/取板器同口径)');

  /* 10b) 开关关 + 开发者工具 → wx.request 直连(工具里须勾「不校验合法域名」), 供本地联调 */
  global.wx.getSystemInfoSync = () => ({ platform: 'devtools' });
  global.wx.request = (o) => {
    wxHits++;
    o.success({
      statusCode: 200,
      data: { events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Elche' }, score: '1' }, { homeAway: 'away', team: { displayName: 'Real Madrid' }, score: '2' }] }], status: { type: { name: 'STATUS_FULL_TIME' } } }] },
    });
  };
  assert.strictEqual(espn.espnDirect(), true, '开发者工具应允许直连 ESPN');
  const rowsDev = await espn.fetchBoard('esp.1', '20260915');
  assert.strictEqual(wxHits, 1, '开发者工具应经 wx.request 直连 ESPN');
  assert.strictEqual(espnHttpHits, 0, '不应绕过 wx.request 走 node fetch');
  assert.strictEqual(rowsDev[0].home, 'Elche', '直连通道应返回归一化行');
  assert.strictEqual(espnCalls.length, 0, '开发者工具直连时不应调云函数');
  console.log('⑪ 开关关 + 开发者工具: wx.request 直连 ✓  (取板/归一化/不入云)');

  /* 10c) ★开关开 + 真机 = **当前生产口径**: 比分走云函数(云出网取 site.web.api 实测 200),
     真机因此恢复进行中/完场比分。前提两条: 云函数已 redeploy + config.js 置 ESPN_CLOUD。 */
  cfgStub.exports.ESPN_CLOUD = true;
  global.wx.getSystemInfoSync = () => ({ platform: 'android' });
  assert.strictEqual(espn.espnCloudEnabled(), true, 'config 桩 ESPN_CLOUD=true 时开关应为 true');
  const wxBefore = wxHits;
  const rowsCloud = await espn.fetchBoard('esp.1', '20260915');
  assert.strictEqual(espnCalls.length, 1, '★真机+开关开 应走云函数取比分(生产口径)');
  assert.deepStrictEqual(espnCalls[0].data, { fn: 'espn_scoreboard', args: { league: 'esp.1', date: '20260915' } }, '入参形态: {fn, args:{league,date}}');
  assert.strictEqual(rowsCloud[0].home, 'Elche', '云通道应解包归一化行');
  assert.strictEqual(wxHits, wxBefore, '走云通道时不得再发 wx.request(域名白名单必拒)');
  const dedup2 = espn.makeBoardFetcher({});
  await dedup2(u); await dedup2(u);
  assert.strictEqual(espnCalls.length, 2, '取板器应 URL 级去重: 同联赛两腿只拉一次');
  /* 10c-2) ★超时重试(2026-09-15): 云函数 3 秒超时是硬墙(只有控制台能改), 而腾讯云↔东京那段
     偶发抖动实测能到 1.8s, 会把它顶爆 → 真机上表现为"比分时有时无"。只读取数失败重试一次。
     两个用例把行为钉死: ① 抖动一次后成功 → 必须真的拿到比分; ② 一直失败 → 透传原因并标明重试过。 */
  let flaky = 0;
  global.wx.cloud.callFunction = (o) => {
    espnCalls.push(o);
    flaky++;
    if (flaky === 1) return Promise.reject(new Error('cloud.callFunction:fail errCode: -504003 Invoking task timed out after 3 seconds'));
    return Promise.resolve({ result: { ok: true, data: [{ home: 'Elche', away: 'Real Madrid', hs: '3', as: '1', st: 'STATUS_FULL_TIME' }] } });
  };
  const rowsRetry = await espn.fetchBoard('esp.1', '20260915');
  assert.strictEqual(flaky, 2, '首次超时应恰好重试一次(实际调用 ' + flaky + ' 次)');
  assert.strictEqual(rowsRetry[0].hs, '3', '重试成功后应返回比分');
  global.wx.cloud.callFunction = (o) => {
    espnCalls.push(o);
    return Promise.resolve({ result: { ok: false, error: 'ESPN esp.1@20260915 HTTP 403: Access Denied' } });
  };
  let espnMsg = '';
  await espn.fetchBoard('esp.1', '20260915').catch((e) => { espnMsg = String(e.message); });
  assert(/云函数 espn_scoreboard 失败/.test(espnMsg) && /403/.test(espnMsg), '失败原因应透传, 实际: ' + espnMsg);
  assert(/已重试 1 次/.test(espnMsg), '最终失败应标明重试过, 实际: ' + espnMsg);
  console.log('⑫ 开关开 + 真机: 走云函数(生产口径) ✓  (云取板/去重/透传/超时重试 ' + espnMsg.slice(0, 30) + '…)');

  /* 10d) 主机名闸门: site.api.espn.com 被 ESPN 的 Akamai **按主机名** 403(东京 Vultr 节点、腾讯云
     都吃 447 字节 Access Denied 页, 本机国内 IP 反而正常), 只有 site.web.api 通 —— 谁改回去,
     真机比分就又是"永远空"。这条断言 = 防回退(改主机名必须两处同步: 云函数 + 小程序)。 */
  assert.strictEqual(core.ESPN_SCOREBOARD_HOST, 'https://site.web.api.espn.com', '云函数须用 site.web.api 主机(site.api 被 403)');
  assert(espn.boardUrl('esp.1', '20260915').indexOf('https://site.web.api.espn.com/') === 0, '小程序侧 boardUrl 主机须与云函数一致');
  let diskCfg = '';
  try { diskCfg = fs.readFileSync(path.join(ROOT, 'miniprogram', 'utils', 'config.js'), 'utf8'); } catch (e) {}
  console.log('⑬ 主机名闸门 ✓  (全链路统一 site.web.api; 本机 config.js '
    + (/ESPN_CLOUD\s*:\s*true/.test(diskCfg) ? '已开 ESPN_CLOUD' : '★未开 ESPN_CLOUD —— 真机将回退 finalScore') + ')');

  delete require.cache[cfgPath];
  global.fetch = realFetch2;
  delete global.wx;

  /* 14) ★ESPN 中转模式(2026-09-15 上线): 直连时腾讯云→ESPN 单程 3~5s, 顶着云函数默认 3s 超时
     (实测三次挂一两次) → 生产改走用户东京节点上的 espn-relay(只转发 scoreboard 一条路径)。
     这里用**注入 fetch**断言行形态(不发真请求); 真出网由 tools/_diag_espn.js 打部署后的云函数验。 */
  const tDirect = core.espnTarget({});
  assert.strictEqual(tDirect.base, 'https://site.web.api.espn.com', '未配中转应直连 web.api 主机');
  assert.strictEqual(tDirect.via, 'direct', '未配中转时 via 应为 direct');
  assert(!('x-bear-token' in tDirect.headers), '直连不得带中转令牌头');
  const tRelay = core.espnTarget({ ESPN_RELAY: 'http://relay.test:8899/', ESPN_RELAY_TOKEN: 'tok123' });
  assert.strictEqual(tRelay.base, 'http://relay.test:8899', '中转 base 应去掉尾部斜杠');
  assert.strictEqual(tRelay.headers['x-bear-token'], 'tok123', '中转须带 x-bear-token 头');
  assert(/Chrome/.test(tRelay.headers['User-Agent']), '中转仍要浏览器形态 UA(上游是 Akamai)');
  let saw = null;
  const rowsRelay = await core.callEspnScoreboard('esp.1', '20260915', {
    cfg: { ESPN_RELAY: 'http://relay.test:8899', ESPN_RELAY_TOKEN: 'tok123' },
    fetch: (url, options) => {
      saw = { url: url, headers: options.headers };
      return Promise.resolve({
        ok: true, status: 200,
        // rawRequest 期待的是 fetch 的 Response 形态: body 走 text() 而不是 text 字段
        text: async () => JSON.stringify({ events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Elche' }, score: '2' }, { homeAway: 'away', team: { displayName: 'Real Madrid' }, score: '1' }] }], status: { type: { name: 'STATUS_FULL_TIME' } } }] }),
      });
    },
  });
  assert(saw && saw.url === 'http://relay.test:8899/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20260915',
    '中转只换 base、路径与 ESPN 完全一致, 实际: ' + (saw && saw.url));
  assert.strictEqual(saw.headers['x-bear-token'], 'tok123', '中转请求须带令牌头');
  assert.strictEqual(rowsRelay[0].home, 'Elche', '中转返回体解析口径应与直连一致');
  assert.strictEqual(rowsRelay[0].hs, '2', '中转归一化须带比分');
  let diskFn = {};
  try { diskFn = require(path.join(ROOT, 'miniprogram', 'cloudfunctions', 'bear_api', 'config.js')) || {}; } catch (e) { diskFn = {}; }
  console.log('⑭ ESPN 中转模式 ✓  (未配=直连 / 配了=换 base + 带令牌; 本机云函数 config.js '
    + (diskFn.ESPN_RELAY ? '配了 ' + diskFn.ESPN_RELAY + ' 令牌' + (diskFn.ESPN_RELAY_TOKEN ? '在' : '★缺!') : '未配 → 走直连') + ')');

  /* 14b) ★中转是**明文 http**, 而云上无 fetch → 只能走 httpsRequest 兜底。这里起一个本地 HTTP 服务
     冒充中转, 临时摘掉全局 fetch 逼核心出网走原生模块 —— 即云上的真实路径。
     (踩过的坑: httpsRequest 一律用 https.request, 打 http 端口报 "self signed certificate";
      本地有 fetch 时永远看不出, 只有上云才炸。)
     两种返回形态都要认: 中转回 {rows}(已归一, 约 0.4KB), 直连回 {events}(40KB 原始结构)。 */
  const ESPN_FIXTURE = JSON.stringify({ events: [{ competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Elche' }, score: '3' }, { homeAway: 'away', team: { displayName: 'Real Madrid' }, score: '1' }] }], status: { type: { name: 'STATUS_FULL_TIME' } } }] });
  let serveRows = false;
  const httpSrv = require('http').createServer(function (req, res) {
    if (req.headers['x-bear-token'] !== 'tok123') {
      res.writeHead(403, { 'Content-Type': 'application/json' }); return res.end('{"error":"bad token"}');
    }
    if (req.url !== '/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20260915') {
      res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"bad path"}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // serveRows=true 模仿**真实中转**(relay.py 归一后回 {rows}); false 模仿直连 ESPN 的原始 events
    res.end(serveRows
      ? JSON.stringify({ rows: [{ home: 'Elche', away: 'Real Madrid', hs: '3', as: '1', st: 'STATUS_FULL_TIME' }] })
      : ESPN_FIXTURE);
  });
  await new Promise(function (r) { httpSrv.listen(0, '127.0.0.1', r); });
  const relayPort = httpSrv.address().port;
  const savedFetch3 = globalThis.fetch;
  delete globalThis.fetch;
  try {
    assert(typeof fetch === 'undefined', '全局 fetch 应已摘除(否则本用例无效)');
    const rowsHttp = await core.callEspnScoreboard('esp.1', '20260915',
      { cfg: { ESPN_RELAY: 'http://127.0.0.1:' + relayPort, ESPN_RELAY_TOKEN: 'tok123' } });
    assert.strictEqual(rowsHttp[0].home, 'Elche', '无 fetch 时中转(明文 http)应能取到数据');
    assert.strictEqual(rowsHttp[0].hs, '3', '无 fetch 时中转应解析比分');
    serveRows = true; // 换成真实中转的返回形态: {rows:[...]} 已归一化
    const rowsViaRelay = await core.callEspnScoreboard('esp.1', '20260915',
      { cfg: { ESPN_RELAY: 'http://127.0.0.1:' + relayPort, ESPN_RELAY_TOKEN: 'tok123' } });
    assert.deepStrictEqual(rowsViaRelay, rowsHttp,
      '★口径漂移闸门: 中转 {rows}(relay.py 归一) 必须与本地归一化结果逐字段一致');
    serveRows = false;
    let badMsg = '';
    await core.callEspnScoreboard('esp.1', '20260915',
      { cfg: { ESPN_RELAY: 'http://127.0.0.1:' + relayPort, ESPN_RELAY_TOKEN: 'wrong' } })
      .catch(function (e) { badMsg = String(e.message); });
    assert(/HTTP 403/.test(badMsg) && /\[relay\]/.test(badMsg), '中转 403 应带 [relay] 标记, 实际: ' + badMsg);
    console.log('⑮ 中转真实链路(无 fetch / 明文 http) ✓  (令牌校验/URL 形态/归一化/失败标记)');
  } finally {
    globalThis.fetch = savedFetch3;
    if (httpSrv.closeAllConnections) httpSrv.closeAllConnections();
    httpSrv.close();
  }

  /* ⑯ 竞彩实时赔率(jc_live): 页面上的 sp/hhad 是构建时快照, 会跟官方脱节 —— 见 core.js 的 JC 段。
     ★要害是**官方接口一次只回一个彩池**(poolCode=had 时返回体里 hhad 是空的), 所以 had/hhad 必须
       各打一次再按场次号合并; 想省一次请求会静默丢掉整个让球盘, 这里就用"只出现在 hhad 里的场次"
       把这条钉死(真实现: 周二009/013 只开让球不开胜平负)。
     照 ⑮ 的办法: 本地起 fixture 服务冒充 webapi.sporttery.cn, 并摘掉全局 fetch 逼走原生模块
       —— 云上 Node16 就是这么跑的, 本地有 fetch 时永远走不到那一支。 */
  const jcFixture = function (pool) {
    const m = (num, home, away, extra) => Object.assign({
      matchNumStr: num, businessDate: '2026-09-15', leagueAbbName: '亚冠精英', homeTeamAbbName: home,
      awayTeamAbbName: away, matchTime: '20:15:00', matchStatus: 'Selling', had: {}, hhad: {},
    }, extra);
    // 与官方同形: had 响应里只有开胜平负的场(004/010), hhad 响应里多一个只开让球的 009
    const subs = pool === 'had'
      ? [m('周二004', '柔佛', '布里兰', { had: { h: '1.35', d: '4.45', a: '6.10', updateTime: '19:01:17' } }),
         m('周二010', '米堡', '米尔沃尔', { had: { h: '1.33', d: '4.60', a: '6.25', updateTime: '19:12:00' } })]
      : [m('周二004', '柔佛', '布里兰', { hhad: { h: '2.22', d: '3.25', a: '2.70', goalLine: '-1', updateTime: '19:01:23' } }),
         m('周二009', '阿贾克斯', '威廉二世', { hhad: { h: '1.68', d: '4.50', a: '3.22', goalLine: '-2', updateTime: '17:10:40' } }),
         m('周二010', '米堡', '米尔沃尔', { hhad: { h: '2.12', d: '3.60', a: '2.63', goalLine: '-1', updateTime: '19:12:00' } })];
    return JSON.stringify({ value: { matchInfoList: [{ businessDate: '2026-09-15', weekday: '周二', subMatchList: subs }] } });
  };
  const jcHits = [];
  const jcSrv = require('http').createServer(function (req, res) {
    const pool = (/[?&]poolCode=([a-z]+)/.exec(req.url) || [])[1];
    jcHits.push(req.url);
    if (req.url.indexOf('/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=' + pool + '&channel=c') !== 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"bad path"}');
    }
    res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' });
    res.end(jcFixture(pool));
  });
  await new Promise(function (r) { jcSrv.listen(0, '127.0.0.1', r); });
  const jcBase = 'http://127.0.0.1:' + jcSrv.address().port;
  const savedFetch4 = globalThis.fetch;
  delete globalThis.fetch;
  try {
    assert(typeof fetch === 'undefined', '全局 fetch 应已摘除(否则测不到云上的 Node16 路径)');
    const live = await core.callJcLive(['had', 'hhad'], { base: jcBase });
    assert.strictEqual(jcHits.length, 2, '须打两次上游(一彩池一次), 实际 ' + jcHits.length + ' 次');
    const r4 = live.rows['周二004'], r9 = live.rows['周二009'];
    assert.deepStrictEqual(r4.sp, [1.35, 4.45, 6.1], '004 的胜平负应来自 had 那一次请求');
    assert.deepStrictEqual(r4.hhad, [2.22, 3.25, 2.7], '★004 的让球应来自 hhad 那一次请求(跨两次请求合并)');
    assert.strictEqual(r4.goalLine, -1, '让球盘口应从 hhad.goalLine 取, 而不是丢弃');
    assert.strictEqual(r4.st, 'Selling', '在售状态应透出');
    assert.strictEqual(r4.upd, '19:01:23', '官方更新时间应透出(页面显示"官方更新于 HH:MM:SS")');
    assert.strictEqual(r9.sp, null, '★009 只开让球: sp 必须是 null 而不是空数组([] 会让 fmtSp 显示成空白行)');
    assert.deepStrictEqual(r9.hhad, [1.68, 4.5, 3.22], '009 的让球应取到');
    assert(!live.rows['周二001'], '已过销售截止被官方下架的场次不该出现在实时池里(页面据此标"已停售")');
    assert(JSON.stringify(live).length < 1200, '回传必须已归一(官方原包 30KB+, 这里应 <1.2KB)');
    let poolMsg = '';
    await core.callJcLive(['ttg'], { base: jcBase }).catch(function (e) { poolMsg = String(e.message); });
    assert(/彩池非法/.test(poolMsg), '白名单外的彩池必须拒绝(否则云函数就成了万能代理), 实际: ' + poolMsg);

    /* 16b) overlay: 纯函数、不改入参、只覆盖不下毒 */
    const frozen = [
      { id: '周二004', home: '柔佛', away: '布里兰', sp: [1.41, 4.25, 5.4], hhad: [2.42, 3.25, 2.45], spHandicap: -1 },
      { id: '周二001', home: '叻武里', away: '上海海港', sp: [2.6, 3.35, 2.24], hhad: [1.48, 4.15, 4.7], spHandicap: 1 },
    ];
    const merged = jc.overlay(frozen, live, '2026-09-15');
    assert.deepStrictEqual(merged[0].sp, [1.35, 4.45, 6.1], 'overlay 应用实时值顶替构建时快照');
    assert.deepStrictEqual(merged[0].hhad, [2.22, 3.25, 2.7], 'overlay 应同时顶替让球');
    assert.strictEqual(merged[0].spHandicap, -1, 'overlay 应带上实时盘口');
    assert.strictEqual(merged[0].oddsLive, true, '叠加过的场次应标记 oddsLive');
    assert.strictEqual(merged[0].oddsClosed, false, '在售场次不该被标停售');
    assert.strictEqual(merged[1].oddsClosed, true, '★不在实时池里的场次应标 oddsClosed(页面据此禁投)');
    assert.deepStrictEqual(merged[1].sp, [2.6, 3.35, 2.24], '停售场次保留构建值供回看, 只是不可投注');
    assert.strictEqual(frozen[0].oddsLive, undefined, '★overlay 绝不能改入参(页面缓存/结算都读原对象)');
    assert.strictEqual(jc.overlay(frozen, live, '2026-09-14')[0].oddsLive, undefined,
      '★日期闸: 回看历史某天时官方池里当然没有那些场次, 无条件叠加会把整页历史误标成"已停售"');
    assert.strictEqual(jc.overlay(frozen, null, '2026-09-15')[0].oddsLive, undefined,
      '取数失败(live=null)时须原样返回 —— 网络问题绝不能让页面变白');
    console.log('⑯ 竞彩实时赔率 ✓  (两彩池合并/仅让球场次/下架缺场/白名单/归一化 ' +
      JSON.stringify(live).length + 'B/overlay 纯函数+日期闸+失败兜底)');
  } finally {
    globalThis.fetch = savedFetch4;
    if (jcSrv.closeAllConnections) jcSrv.closeAllConnections();
    jcSrv.close();
  }

  console.log('云函数通道冒烟全绿 ✓');
})().catch((e) => { console.error('云函数通道冒烟失败: ' + ((e && e.stack) || e)); process.exit(1); });
