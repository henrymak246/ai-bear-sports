/* core.js — 云函数核心逻辑。纯 Node(不依赖 wx-server-sdk), 便于 node 冒烟直测。
   云函数运行在腾讯云国内机房, 出网访问 supabase.co 不受小程序「request 合法域名」白名单限制
   (真机校验的是小程序侧的域名白名单, 云函数出网属于服务器出网, 无此限制)。

   ★出网必须自带兜底: 微信云函数运行时是 **Node 16.13**(没有全局 fetch, Node 18 才有),
     本地 node 冒烟却能直接用 fetch —— 所以这里用「有 fetch 用 fetch, 没有就 https.request」,
     两条路返回同一形态 { ok, status, text }, 保证本地测过的逻辑就是云上跑的逻辑。 */
'use strict';
const https = require('https');

/* 允许小程序调用的 Supabase RPC 白名单: 防止云函数被当成任意代理使用 */
const ALLOWED_FNS = [
  'mini_get_today_payload',
  'mini_get_payload_by_date',
  'mini_save_bet',
  'mini_list_bets',
  'mini_update_bet',
  'mini_edit_bet',
  'mini_delete_bet',
];

function assertFn(fn) {
  if (!fn || ALLOWED_FNS.indexOf(fn) < 0) throw new Error('云函数不允许的调用: ' + fn);
  return fn;
}

function assertCfg(cfg) {
  const miss = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'MINI_TOKEN'].filter(function (k) {
    return !cfg || !cfg[k];
  });
  if (miss.length) throw new Error('云函数配置缺失: ' + miss.join(', '));
  return cfg;
}

/* https.request 版请求(Node 16 兜底), 返回 { ok, status, text } */
function httpsRequest(url, options) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      function (res) {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', function (c) { data += c; });
        res.on('end', function () {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data });
        });
      }
    );
    req.setTimeout(20000, function () { req.destroy(new Error('出网请求超时(20s)')); });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/* 统一出网: opts.fetch 注入(node 冒烟) > 全局 fetch(本地 Node18+) > https.request(云上 Node16) */
async function rawRequest(url, options, opts) {
  const injected = (opts && opts.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
  if (injected) {
    const res = await injected(url, options);
    return { ok: res.ok, status: res.status, text: await res.text() };
  }
  return await httpsRequest(url, options);
}

/* 调 Supabase RPC, 返回原始 JSON(与小程序直连时 request() 的返回一致) */
async function callSupabaseRpc(fn, args, cfg, opts) {
  assertFn(fn);
  assertCfg(cfg);
  const body = Object.assign({ p_token: cfg.MINI_TOKEN }, args || {});
  const res = await rawRequest(
    cfg.SUPABASE_URL + '/rest/v1/rpc/' + fn,
    {
      method: 'POST',
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
    opts
  );
  if (!res.ok) {
    throw new Error('Supabase ' + fn + ' HTTP ' + res.status + ': ' + String(res.text || '').slice(0, 200));
  }
  return res.text ? JSON.parse(res.text) : null;
}

/* ===== ESPN 比分代理(2026-09-15) =====
   真机上小程序 wx.request 只能直连「request 合法域名」白名单内的域名, 而 site.api.espn.com
   是境外域名、拿不到 ICP 备案 → 配不进白名单, 真机必然 request:fail url not in domain list。
   云函数出网属服务器出网, 不受该白名单约束 → 比分统一由云函数代取, 再把归一化后的
   [{home,away,hs,as,st}] 返回小程序(小程序侧不再重复解析 ESPN 结构)。
   ★联赛码用**形状校验**而非显式白名单: 每日场次会引入新码(9-15 就新增了 eng.league_cup/
     afc.champions/conmebol.libertadores), 写死清单意味着每加一个联赛都要重新部署云函数,
     漏部署的表现正是"真机比分永远空"。形状校验把可访问面收敛到「ESPN 足球 scoreboard」
     这一个只读公开接口(路径不可任意拼装, 域名固定), 已被当代理的风险可接受。 */
const ESPN_LEAGUE_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;

function assertEspnArgs(league, date) {
  const lg = String(league == null ? '' : league);
  const dt = String(date == null ? '' : date);
  if (!ESPN_LEAGUE_RE.test(lg) || lg.length > 32) throw new Error('ESPN 联赛码非法: ' + lg);
  if (!/^\d{8}$/.test(dt)) throw new Error('ESPN 日期非法(须 YYYYMMDD): ' + dt);
  return { league: lg, date: dt };
}

/* ESPN scoreboard → [{home, away, hs, as, st}](与小程序 espn.js 的字段一一对应) */
async function callEspnScoreboard(league, date, opts) {
  const a = assertEspnArgs(league, date);
  const res = await rawRequest(
    'https://site.api.espn.com/apis/site/v2/sports/soccer/' + a.league + '/scoreboard?dates=' + a.date,
    { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' } },
    opts
  );
  if (!res.ok) throw new Error('ESPN ' + a.league + '@' + a.date + ' HTTP ' + res.status);
  let j = {};
  try { j = JSON.parse(res.text || '{}'); } catch (e) { return []; }
  return (j.events || []).map(function (e) {
    const comp = (e.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const h = cs.filter(function (x) { return x.homeAway === 'home'; })[0] || {};
    const w = cs.filter(function (x) { return x.homeAway === 'away'; })[0] || {};
    return {
      home: ((h.team || {}).displayName || ''),
      away: ((w.team || {}).displayName || ''),
      hs: h.score,
      as: w.score,
      st: (e.status && e.status.type && e.status.type.name) || '',
    };
  });
}

module.exports = { ALLOWED_FNS, assertFn, assertCfg, httpsRequest, rawRequest, callSupabaseRpc,
  ESPN_LEAGUE_RE, assertEspnArgs, callEspnScoreboard };
