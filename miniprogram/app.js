/* app.js — 小程序入口。云开发初始化(云函数通道)在此完成, 页面状态全在各页面内。
   真机必须走云函数: 真机校验 request 合法域名, supabase.co 是境外域名无法备案、配不进白名单。 */
let cfg = null;
try {
  cfg = require('./utils/config.js');
} catch (e) {
  cfg = null; // 缺配置(如未复制的机器)时跳过云初始化, 不阻塞启动
}

App({
  onLaunch() {
    if (!cfg || !cfg.CLOUD_ENV) return; // 未填环境ID: 保持直连(开发者工具内可用)
    if (typeof wx === 'undefined' || !wx.cloud) return;
    try {
      wx.cloud.init({ env: cfg.CLOUD_ENV, traceUser: true });
    } catch (e) {
      console.error('[app] wx.cloud.init 失败:', (e && e.message) || e);
    }
  },
  globalData: {},
});
