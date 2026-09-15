/* core.js — 云函数核心逻辑。纯 Node(不依赖 wx-server-sdk), 便于 node 冒烟直测。
   云函数运行在腾讯云国内机房, 出网访问 supabase.co 不受小程序「request 合法域名」白名单限制
   (真机校验的是小程序侧的域名白名单, 云函数出网属于服务器出网, 无此限制)。

   ★出网必须自带兜底: 微信云函数运行时是 **Node 16.13**(没有全局 fetch, Node 18 才有),
     本地 node 冒烟却能直接用 fetch —— 所以这里用「有 fetch 用 fetch, 没有就 https.request」,
     两条路返回同一形态 { ok, status, text }, 保证本地测过的逻辑就是云上跑的逻辑。 */
'use strict';
const https = require('https');
const http = require('http');

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

/* ★keepAlive 连接池(Node 16 的全局 agent 默认 keepAlive=false)。
   云函数超时的大头**不是包大小, 是跨境 TCP 建连**: 腾讯云→东京单次握手 0.6~2s 且抖动很大
   (实测同一函数连续 4 次: 1701/1725/2077/2395ms, 偶发 >3s 直接 -504003 —— 把 40KB 缩到 255B
   后仍然如此, 说明瓶颈在建连不在字节)。热容器内复用连接就能把那一段整个省掉。 */
const HTTP_AGENT = new http.Agent({ keepAlive: true, maxSockets: 4, keepAliveMsecs: 30000 });

/* 原生 http/https 版请求(Node 16 兜底), 返回 { ok, status, text }
   ★必须按 URL 协议选模块: ESPN 直连是 https, 而中转(东京节点)是**明文 http** —— 早期版本一律用
     https.request, 打中转时报 "self signed certificate"(TLS 去连一个 HTTP 端口), 云上(无 fetch)
     必踩, 本地有 fetch 却看不出来。 */
function httpsRequest(url, options) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    const perf = options.perf || null; // 诊断: 传对象则回填各阶段耗时(见 index.js 的 args.perf)
    const t0 = Date.now();
    const reqOpts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'http:' ? 80 : 443),
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    if (u.protocol === 'http:') reqOpts.agent = HTTP_AGENT; // 见 HTTP_AGENT 注释
    const req = mod.request(reqOpts, function (res) {
      if (perf) perf.ttfbMs = Date.now() - t0;
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        if (perf) perf.totalMs = Date.now() - t0;
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data });
      });
    });
    req.on('socket', function (s) {
      if (!perf) return;
      if (s.connecting) s.once('connect', function () { perf.connectMs = Date.now() - t0; });
      else perf.connectMs = 0; // 复用了 keepAlive 连接, 没花时间在建连上
    });
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
    const t0 = Date.now();
    const res = await injected(url, options);
    const text = await res.text();
    if (options && options.perf) { options.perf.via = 'fetch'; options.perf.totalMs = Date.now() - t0; }
    return { ok: res.ok, status: res.status, text: text };
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

/* ★ESPN scoreboard 主机名: 必须用 site.web.api.espn.com, 不能用 site.api.espn.com。
   2026-09-15 实测: site.api.espn.com 被 ESPN 自家 Akamai WAF 按**来源 IP 段**直接 403
   (东京 Vultr 节点、腾讯云云函数都吃 447 字节的 "Access Denied" 页; 本机国内 IP 反而正常),
   而**同一台机器**从 site.web.api.espn.com 取同一份数据是 200 —— 差别只在主机名的 WAF 规则,
   不是 IP 封锁。故换主机即可, 无需自建境外中转。返回体结构两主机完全一致
   (顶层 {leagues,events,provider}, events[].competitions[0].competitors[] 归一化同口径)。 */
const ESPN_SCOREBOARD_HOST = 'https://site.web.api.espn.com';

/* ★ESPN 中转(2026-09-15 上线): 直连虽然通, 但腾讯云跨境单程 3~5 秒, **顶着云函数默认 3 秒超时**
   (实测三次里挂一两次 —— 真机上就是"比分时有时无")。中转把跨境那一段换掉:
   腾讯云→东京 Vultr(~0.1s) + 东京→ESPN(~0.6s), 稳进超时预算。
   中转 = 用户自建东京节点上的 systemd 服务 espn-relay(只转发 soccer/<league>/scoreboard 一条路径,
   须带 x-bear-token 头; 实现见 okx-proxy/espn-relay/relay.py)。
   ★中转地址/令牌来自**云函数的 config.js**(已 gitignore), 不硬编码在仓库里;
     未配 ESPN_RELAY 时自动退回直连 site.web.api.espn.com(功能不变, 只是慢)。 */
function espnTarget(cfg) {
  const relay = String((cfg && cfg.ESPN_RELAY) || '').trim().replace(/\/+$/, '');
  if (!relay) return { base: ESPN_SCOREBOARD_HOST, via: 'direct', headers: ESPN_HEADERS };
  return {
    base: relay,
    via: 'relay',
    headers: Object.assign({}, ESPN_HEADERS, { 'x-bear-token': String((cfg && cfg.ESPN_RELAY_TOKEN) || '') }),
  };
}

/* 出网请求头: 用浏览器形态。ESPN 走 Akamai, 光秃秃的 UA(甚至只是 "Mozilla/5.0")很容易被判成
   机器人直接 403 —— 而 403 在小程序侧的表现与"域名配不进白名单"一样(比分永远空), 极难分辨。 */
const ESPN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.espn.com/',
};

function assertEspnArgs(league, date) {
  const lg = String(league == null ? '' : league);
  const dt = String(date == null ? '' : date);
  if (!ESPN_LEAGUE_RE.test(lg) || lg.length > 32) throw new Error('ESPN 联赛码非法: ' + lg);
  if (!/^\d{8}$/.test(dt)) throw new Error('ESPN 日期非法(须 YYYYMMDD): ' + dt);
  return { league: lg, date: dt };
}

/* ESPN scoreboard → [{home, away, hs, as, st}](与小程序 espn.js 的字段一一对应)
   opts.cfg 里若配了 ESPN_RELAY 则走中转(见 espnTarget), 否则直连。
   中转与 ESPN 的**路径形状完全一致**(都是 /apis/site/v2/sports/soccer/<league>/scoreboard?dates=),
   所以这里只换 base, 解析逻辑一行不用动。 */
async function callEspnScoreboard(league, date, opts) {
  const a = assertEspnArgs(league, date);
  const t = espnTarget(opts && opts.cfg);
  const perf = (opts && opts.perf) || null;
  if (perf) perf.upstream = t.via; // relay / direct —— 诊断用, 不影响主流程
  const res = await rawRequest(
    t.base + '/apis/site/v2/sports/soccer/' + a.league + '/scoreboard?dates=' + a.date,
    { method: 'GET', headers: t.headers, perf: perf },
    opts
  );
  if (!res.ok) {
    // 把响应体片段带进错误里: 403/451 时正文会写明是谁拦的(Akamai 参考号 / 区域限制), 否则只剩一个数字
    throw new Error('ESPN ' + a.league + '@' + a.date + ' HTTP ' + res.status
      + '[' + t.via + ']: ' + String(res.text || '').replace(/\s+/g, ' ').slice(0, 160));
  }
  let j = {};
  try { j = JSON.parse(res.text || '{}'); } catch (e) { return []; }
  /* 两种返回形态:
     · 中转(espn-relay)回传 {rows:[...]} —— 它已按同一口径归一化(见 relay.py normalize),
       且只有约 0.4KB(ESPN 原始包 40KB, 跨境回传要 1~2.5s, 是云函数超时的主因);
     · 直连 site.web.api.espn.com 回传 {events:[...]} 原始结构 —— 这里自己归一化。
     两边字段口径必须一致(home/away/hs/as/st), 冒烟 ⑮ 用同一份 fixture 交叉核对。 */
  if (Array.isArray(j.rows)) return j.rows;
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

/* ===== 竞彩官方实时赔率代理(2026-09-15) =====
   为什么需要: 站点每场竞彩的 sp/hhad 是**每天构建那一刻**从体彩官方抓的快照(见 tools/_fetch_jc.js
   → tools/_build<MMDD>.js), 之后官方继续浮动, 页面却永远停在构建值 —— 实测当日 11 场在售里有 9 场
   已经跟官方对不上(如 005 北京国安主胜 1.64→1.42), 且已过销售截止的场次(001/002/003)仍挂在页面上
   可投注。用户拿它跟官方 App 一比就是"数据不对"。这里提供**读时实时**口径。
   ★与 ESPN 那条通道的关键差别: webapi.sporttery.cn 是**国内域名**, 云函数在腾讯云国内机房,
     直连是"国内→国内", 不存在跨境建连/抖动, 那条 3 秒超时的坑这边没有(实测 53~354ms)。
     所以**刻意不加结果缓存** —— 缓存会把刚修掉的"陈旧赔率"问题以另一种形式带回来。
   ★只读公开接口 + 固定路径 + 彩池白名单, 不是通用代理; 返回前先归一化, 不把官方 30KB 原包回传。 */
const JC_HOST = 'https://webapi.sporttery.cn';
const JC_POOLS = ['had', 'hhad'];
const JC_HEADERS = {
  'User-Agent': ESPN_HEADERS['User-Agent'],
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  'Referer': 'https://www.sporttery.cn/',
};

function assertJcPools(pools) {
  const list = (Array.isArray(pools) && pools.length) ? pools : JC_POOLS;
  list.forEach(function (p) {
    if (JC_POOLS.indexOf(p) < 0) throw new Error('竞彩彩池非法: ' + p);
  });
  return list;
}

const jcNum = function (o, k) {
  const v = o && o[k];
  return (v === undefined || v === null || v === '') ? null : Number(v);
};

/* 竞彩实时赔率 → { pools, fetchedAt, rows: { 场次号: {...} } }
   ★官方接口一次只回**一个彩池**: poolCode=had 时返回体的 hhad 字段是空的(反之亦然),
     故 had/hhad 必须各打一次再按 matchNumStr 合并 —— 想省一次请求会静默丢掉整个让球盘。
   行结构(与 data/predictions.js 的场次字段同口径, 便于小程序侧直接顶替):
     { num, date, weekday, league, home, away, time, st, goalLine, sp, hhad, upd }
   sp/hhad 为 [主,平,客] 或 null(该场未开此彩池 —— 如 009/013 只开让球不开胜平负);
   st 为官方 matchStatus("Selling"=在售); upd 为该彩池的官方更新时间(HH:MM:SS)。 */
async function callJcLive(pools, opts) {
  const list = assertJcPools(pools);
  /* opts.base 是**测试缝**(与 opts.fetch 同性质): 冒烟用它把上游指到本地 fixture 服务,
     好把「无 fetch 的 Node16 路径」也真跑一遍。生产调用(jc_live 分支)永不传它。 */
  const host = (opts && opts.base) || JC_HOST;
  const rows = {};
  for (const pool of JC_POOLS) {
    if (list.indexOf(pool) < 0) continue;
    const res = await rawRequest(
      host + '/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=' + pool + '&channel=c',
      { method: 'GET', headers: JC_HEADERS, perf: (opts && opts.perf) || null },
      opts
    );
    if (!res.ok) {
      throw new Error('竞彩 ' + pool + ' HTTP ' + res.status + ': '
        + String(res.text || '').replace(/\s+/g, ' ').slice(0, 160));
    }
    let j = {};
    try { j = JSON.parse(res.text || '{}'); } catch (e) { throw new Error('竞彩 ' + pool + ' 返回非 JSON'); }
    ((j.value || {}).matchInfoList || []).forEach(function (g) {
      (g.subMatchList || []).forEach(function (m) {
        const num = m.matchNumStr;
        if (!num) return;
        const r = rows[num] || (rows[num] = {
          num: num,
          date: m.businessDate || g.businessDate || '',
          weekday: g.weekday || '',
          league: m.leagueAbbName || '',
          home: m.homeTeamAbbName || '',
          away: m.awayTeamAbbName || '',
          time: m.matchTime || '',
          st: m.matchStatus || '',
          goalLine: null,
          sp: null,
          hhad: null,
          upd: '',
        });
        const o = m[pool] || {};
        if (pool === 'had') {
          if (jcNum(o, 'h') != null) r.sp = [jcNum(o, 'h'), jcNum(o, 'd'), jcNum(o, 'a')];
        } else {
          if (jcNum(o, 'h') != null) r.hhad = [jcNum(o, 'h'), jcNum(o, 'd'), jcNum(o, 'a')];
          const gl = o.goalLine;
          if (gl !== undefined && gl !== null && gl !== '') r.goalLine = Number(gl);
        }
        r.upd = o.updateTime || r.upd;
      });
    });
  }
  return { pools: list, fetchedAt: new Date().toISOString(), rows: rows };
}

module.exports = { ALLOWED_FNS, assertFn, assertCfg, httpsRequest, rawRequest, callSupabaseRpc,
  ESPN_LEAGUE_RE, ESPN_SCOREBOARD_HOST, espnTarget, assertEspnArgs, callEspnScoreboard,
  JC_POOLS, assertJcPools, callJcLive };
