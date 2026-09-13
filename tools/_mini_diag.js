/* 微信开发者工具自动化诊断(launch 模式): 拉起工具+打开项目+自动端口, 读推荐页状态 + 直调 api 拿真实报错 */
const automator = require("miniprogram-automator");
(async () => {
  const mini = await automator.connect({ wsEndpoint: "ws://localhost:9420" });
  console.log("connect OK");
  await new Promise(r => setTimeout(r, 12000)); // 编译+首页 onShow
  const page = await mini.currentPage();
  console.log("当前页:", page.path);
  try {
    const data = await page.data();
    console.log("页面 data: errMsg=", JSON.stringify(data.errMsg), "loading=", data.loading, "payload=", !!data.payload,
      "groups.jc=", data.groups && data.groups.jc && data.groups.jc.length,
      "scoreStatus=", data.scoreStatus, "lastUpdated=", data.lastUpdated);
  } catch (e) { console.log("读页面data失败:", e.message); }
  const res = await mini.evaluate(async () => {
    try {
      const api = require("./utils/api.js");
      const p = await api.fetchTodayPayload();
      return { ok: true, date: p && p.date, matches: p && p.matches && p.matches.length };
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  });
  console.log("fetchTodayPayload 直调:", JSON.stringify(res));
  const raw = await mini.evaluate(async () => {
    return await new Promise((resolve) => {
      if (typeof wx === "undefined" || !wx.request) return resolve({ env: "no-wx" });
      wx.request({
        url: "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20260912",
        success: (r) => resolve({ ok: true, status: r.statusCode }),
        fail: (e) => resolve({ ok: false, err: e && e.errMsg }),
      });
    });
  });
  console.log("ESPN wx.request 探测:", JSON.stringify(raw));
  await mini.close();
})().catch(e => { console.error("失败:", e.message); process.exit(1); });
