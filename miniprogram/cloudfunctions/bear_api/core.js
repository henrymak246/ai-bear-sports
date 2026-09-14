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

module.exports = { ALLOWED_FNS, assertFn, assertCfg, httpsRequest, rawRequest, callSupabaseRpc };
