/* api.js — 小程序 Supabase REST 封装(手写)。
   URL/密钥从同目录 config.js 读(由 config.example.js 复制填入, 已 gitignore 不入库)。
   请求通道优先级(2026-09-14 起):
     ① 注入 fetcher(node 冒烟 setFetcher / opts.fetcher) → 直连 HTTP, 行为与改造前一致;
     ② 小程序内且 config.USE_CLOUD !== false → 云函数 bear_api(腾讯云内直连 Supabase);
     ③ 其余 → wx.request 直连(仅开发者工具内可用)。
   为什么要走云函数: 真机会校验 request 合法域名, 而 supabase.co 属境外域名、无法 ICP 备案,
   配不进白名单 → 真机必然 request:fail url not in domain list。云函数出网不受该限制。 */
let _config = null;
function loadConfig() {
  if (_config) return _config;
  try {
    _config = require("./config.js");
  } catch (e) {
    throw new Error("缺少 miniprogram/utils/config.js: 请复制 config.example.js 为 config.js 并填入 Supabase 配置");
  }
  if (!_config.SUPABASE_URL) throw new Error("config.js 缺少 SUPABASE_URL");
  return _config;
}

let _fetcher = null;
function setFetcher(f) { _fetcher = f; }

function httpRequest(url, { method, headers, body, fetcher }) {
  const data = body === undefined ? undefined : JSON.stringify(body);
  const f = fetcher || _fetcher;
  if (f) return f(url, { method, headers, body: data });
  if (typeof wx !== "undefined" && wx.request) {
    return new Promise((resolve, reject) => {
      wx.request({
        url, method, header: headers, data: body,
        success: (res) => resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: async () => res.data,
          text: async () => (typeof res.data === "string" ? res.data : JSON.stringify(res.data)),
        }),
        fail: (err) => reject(new Error((err && err.errMsg) || "wx.request 失败")),
      });
    });
  }
  if (typeof fetch !== "undefined") return fetch(url, { method, headers, body: data });
  return Promise.reject(new Error("无可用请求通道(小程序需 wx.request, node 需注入 fetcher)"));
}

/* 统一请求: header 固定 apikey + Authorization: Bearer + Content-Type: application/json */
async function request(path, { method = "GET", body, key, fetcher, extraHeaders } = {}) {
  const cfg = loadConfig();
  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const res = await httpRequest(cfg.SUPABASE_URL + path, { method, headers, body, fetcher });
  const text = await res.text();
  if (!res.ok) {
    throw new Error("Supabase " + method + " " + path + " HTTP " + res.status + ": " + (text || "").slice(0, 200));
  }
  return text ? JSON.parse(text) : null;
}

/* RPC 通道(2026-09-13 起): publishable key + 私有令牌调 security-definer 函数(supabase/mini_rpc.sql)。
   弃用 SERVICE_KEY 直连的原因: 新版 sb_secret_ key 被 Supabase 按浏览器 UA 拦截
   (模拟器/真机微信 UA 均以 Mozilla 开头, 必然 401), 小程序端任何 secret key 都不可用。 */
/* 云函数通道(2026-09-14): 小程序 → wx.cloud.callFunction → 云函数内直连 Supabase。
   云函数返回 { ok, data } / { ok, error }, 这里解包成与直连一致的返回值。 */
function cloudReady() {
  return typeof wx !== "undefined" && wx.cloud && typeof wx.cloud.callFunction === "function";
}

async function callCloud(fn, args, cfg) {
  const res = await wx.cloud.callFunction({
    name: cfg.CLOUD_FN || "bear_api",
    data: { fn: fn, args: args || {} },
  });
  const r = res && res.result;
  if (!r || r.ok !== true) {
    throw new Error("云函数 " + fn + " 失败: " + ((r && r.error) || "无返回(检查云函数 bear_api 是否已部署)"));
  }
  return r.data;
}

async function rpc(fn, args, opts) {
  const cfg = loadConfig();
  if (!cfg.MINI_TOKEN) throw new Error("config.js 缺少 MINI_TOKEN(见 config.example.js)");
  const injected = (opts && opts.fetcher) || _fetcher;
  if (!injected && cfg.USE_CLOUD !== false && cloudReady()) {
    return await callCloud(fn, args, cfg);
  }
  return request("/rest/v1/rpc/" + fn, {
    method: "POST",
    body: Object.assign({ p_token: cfg.MINI_TOKEN }, args || {}),
    key: cfg.SUPABASE_ANON_KEY,
    fetcher: opts && opts.fetcher,
  });
}

/* 最新一天推荐 payload(RLS 会员门控, 经 RPC security definer 读取) */
async function fetchTodayPayload(opts) {
  return await rpc("mini_get_today_payload", null, opts);
}

/* 指定日期(YYYY-MM-DD)推荐 payload */
async function fetchPayloadByDate(date, opts) {
  return await rpc("mini_get_payload_by_date", { p_date: date }, opts);
}

/* 投注登记插入 → 插入行 */
async function saveBet(bet, opts) {
  return await rpc("mini_save_bet", { p_bet: bet }, opts);
}

/* 投注登记列表 → 数组 */
async function fetchBets(opts) {
  const rows = await rpc("mini_list_bets", null, opts);
  return rows || [];
}

/* 投注登记更新(结算回写, 列白名单: status/actual_payout/profit/settled_at/legs) → 更新行 */
async function updateBet(id, patch, opts) {
  const p = patch || {};
  return await rpc("mini_update_bet", {
    p_id: id,
    p_status: p.status,
    p_actual_payout: p.actual_payout,
    p_profit: p.profit,
    p_settled_at: p.settled_at,
    p_legs: p.legs === undefined ? null : p.legs,
  }, opts);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { request, fetchTodayPayload, fetchPayloadByDate, saveBet, fetchBets, updateBet, setFetcher, cloudReady, callCloud };
}
