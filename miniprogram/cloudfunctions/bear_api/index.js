/* index.js — 云函数入口。
   小程序: wx.cloud.callFunction({ name: 'bear_api', data: { fn: 'mini_get_today_payload', args: {} } })
   → 腾讯云内直连 Supabase RPC → { ok: true, data } / { ok: false, error }。
   配置来源(优先级): 云函数环境变量 SUPABASE_URL/SUPABASE_ANON_KEY/MINI_TOKEN > 同目录 config.js
   (config.js 已 gitignore, 但随函数包上传到微信云, 不入公开仓库)。 */
'use strict';
const { callSupabaseRpc } = require('./core.js');

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
    const data = await callSupabaseRpc(e.fn, e.args, loadConfig());
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
};
