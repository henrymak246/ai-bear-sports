/* index.js — 云函数入口。
   小程序: wx.cloud.callFunction({ name: 'bear_api', data: { fn: 'mini_get_today_payload', args: {} } })
   → 腾讯云内直连 Supabase RPC → { ok: true, data } / { ok: false, error }。
   另有 fn='espn_scoreboard'({ league, date }) → ESPN 比分代理(真机 request 白名单配不进境外域名)。
   配置来源(优先级): 云函数环境变量 SUPABASE_URL/SUPABASE_ANON_KEY/MINI_TOKEN > 同目录 config.js
   (config.js 已 gitignore, 但随函数包上传到微信云, 不入公开仓库)。 */
'use strict';
const { callSupabaseRpc, callEspnScoreboard } = require('./core.js');

/* wx-server-sdk 只用于 cloud.init(本函数不读写云数据库); 缺包/版本差异都不影响主流程 */
let cloud = null;
try { cloud = require('wx-server-sdk'); } catch (e) { cloud = null; }
if (cloud && typeof cloud.init === 'function') {
  try { cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); } catch (e) { /* 忽略: 不影响纯出网代理 */ }
}

let _cfg = null;
function loadConfig() {
  if (_cfg) return _cfg;
  let file = {};
  try { file = require('./config.js'); } catch (e) { file = {}; }
  _cfg = {
    SUPABASE_URL: process.env.SUPABASE_URL || file.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || file.SUPABASE_ANON_KEY,
    MINI_TOKEN: process.env.MINI_TOKEN || file.MINI_TOKEN,
  };
  return _cfg;
}

exports.main = async function (event) {
  const e = event || {};
  try {
    // ESPN 比分代理: 与 Supabase 无关(不需要 SUPABASE_*/MINI_TOKEN), 故先于配置校验分发
    if (e.fn === 'espn_scoreboard') {
      const a = e.args || {};
      return { ok: true, data: await callEspnScoreboard(a.league, a.date) };
    }
    const data = await callSupabaseRpc(e.fn, e.args, loadConfig());
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
};
