/* _diag_cloud.js — 云通道诊断: 连模拟器, 读首页 errMsg/payload.date, 并直接打一次云函数看原始返回。
   用法: node tools/_diag_cloud.js   (需先 cli auto --project miniprogram --auto-port 9420) */
const automator = require('miniprogram-automator');

(async () => {
  const mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  const page = await mini.currentPage();
  const d = await page.data();
  console.log('页面路径:', page.path);
  console.log('errMsg:', JSON.stringify(d.errMsg || ''));
  console.log('payload.date:', (d.payload && d.payload.date) || null);
  console.log('loading:', d.loading);
  console.log('jc/bd/ah 组数:', JSON.stringify({
    jc: (d.groups && d.groups.jc || []).length,
    bd: (d.groups && d.groups.bd || []).length,
    ah: (d.groups && d.groups.ah || []).length,
  }));
  console.log('config.CLOUD_ENV:', await mini.evaluate(() => {
    try { return require('./utils/config.js').CLOUD_ENV || '(空)'; } catch (e) { return 'ERR ' + e.message; }
  }));
  console.log('wx.cloud 存在:', await mini.evaluate(() => !!(typeof wx !== 'undefined' && wx.cloud)));

  const r = await mini.evaluate(async () => {
    try {
      const res = await wx.cloud.callFunction({
        name: 'bear_api',
        data: { fn: 'mini_get_today_payload', args: {} },
      });
      const result = res && res.result;
      return { path: 'cloud-ok', result: JSON.stringify(result).slice(0, 400) };
    } catch (e) {
      return { path: 'cloud-throw', err: String((e && (e.errMsg || e.message)) || e) };
    }
  });
  console.log('--- 直调云函数 ---');
  console.log(JSON.stringify(r, null, 1));
  await mini.disconnect();
})().catch((e) => { console.error('诊断失败:', (e && e.stack) || e); process.exit(1); });
