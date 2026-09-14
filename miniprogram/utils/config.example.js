/* config.example.js — Supabase 配置模板。
   用法: 复制本文件为同目录 config.js 并填入真实值(值从 tools/.env 复制)。
   config.js 已在 .gitignore 忽略, 绝不入库、绝不外发。
   注意: SERVICE_KEY 可绕 RLS 写 bets 表, 仅限自用开发版小程序, 勿分发。 */
module.exports = {
  SUPABASE_URL: "",        // tools/.env 的 SUPABASE_URL
  SUPABASE_ANON_KEY: "",   // Supabase publishable key(见站点 index.html 公开值)
  MINI_TOKEN: "",          // 小程序 RPC 私有令牌(supabase/mini_rpc.sql 内同一值; 2026-09-13 起取代 SERVICE_KEY 直连)
  CLOUD_ENV: "",           // 云开发环境ID(微信开发者工具→云开发→环境ID)。填了才会启用云函数通道;
                           // 真机必须走云函数(真机校验 request 合法域名, supabase.co 是境外域名无法备案)
  CLOUD_FN: "bear_api",    // 中转云函数名(部署命令见 docs/云函数通道.md)
  USE_CLOUD: true,         // false = 强制直连(仅开发者工具调试用)
};
