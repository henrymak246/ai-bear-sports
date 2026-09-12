/* config.example.js — Supabase 配置模板。
   用法: 复制本文件为同目录 config.js 并填入真实值(值从 tools/.env 复制)。
   config.js 已在 .gitignore 忽略, 绝不入库、绝不外发。
   注意: SERVICE_KEY 可绕 RLS 写 bets 表, 仅限自用开发版小程序, 勿分发。 */
module.exports = {
  SUPABASE_URL: "",        // tools/.env 的 SUPABASE_URL
  SUPABASE_ANON_KEY: "",   // Supabase anon/publishable key(tools/.env 暂无此键, 见 index.html 公开值)
  SUPABASE_SERVICE_KEY: "",// tools/.env 的 SUPABASE_SERVICE_KEY
};
