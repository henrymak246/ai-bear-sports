/* api.js — 小程序 Supabase REST 封装(手写)。
   URL/密钥从同目录 config.js 读(由 config.example.js 复制填入, 已 gitignore 不入库)。
   请求通道默认: 小程序 wx.request; node 冒烟经 setFetcher(全局 fetch) 注入。 */
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

/* 最新一天推荐 payload(SERVICE_KEY; 2026-09-12 实测: RLS 会员门控, ANON_KEY 返回 0 行) */
async function fetchTodayPayload(opts) {
  const cfg = loadConfig();
  const rows = await request("/rest/v1/prediction_days?select=date,payload&order=date.desc&limit=1",
    { key: cfg.SUPABASE_SERVICE_KEY, fetcher: opts && opts.fetcher });
  return rows && rows[0] ? rows[0].payload : null;
}

/* 指定日期(YYYY-MM-DD)推荐 payload(SERVICE_KEY, 同上原因) */
async function fetchPayloadByDate(date, opts) {
  const cfg = loadConfig();
  const rows = await request("/rest/v1/prediction_days?select=date,payload&date=eq." + encodeURIComponent(date) +
    "&order=date.desc&limit=1",
    { key: cfg.SUPABASE_SERVICE_KEY, fetcher: opts && opts.fetcher });
  return rows && rows[0] ? rows[0].payload : null;
}

/* 投注登记插入(SERVICE_KEY) → 插入行 */
async function saveBet(bet, opts) {
  const cfg = loadConfig();
  const rows = await request("/rest/v1/bets", {
    method: "POST", body: bet, key: cfg.SUPABASE_SERVICE_KEY,
    extraHeaders: { Prefer: "return=representation" },
    fetcher: opts && opts.fetcher,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

/* 投注登记列表(SERVICE_KEY) → 数组 */
async function fetchBets(opts) {
  const cfg = loadConfig();
  const rows = await request("/rest/v1/bets?order=created_at.desc&limit=200",
    { key: cfg.SUPABASE_SERVICE_KEY, fetcher: opts && opts.fetcher });
  return rows || [];
}

/* 投注登记更新(SERVICE_KEY) → 更新行 */
async function updateBet(id, patch, opts) {
  const cfg = loadConfig();
  const rows = await request("/rest/v1/bets?id=eq." + encodeURIComponent(id), {
    method: "PATCH", body: patch, key: cfg.SUPABASE_SERVICE_KEY,
    extraHeaders: { Prefer: "return=representation" },
    fetcher: opts && opts.fetcher,
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { request, fetchTodayPayload, fetchPayloadByDate, saveBet, fetchBets, updateBet, setFetcher };
}
