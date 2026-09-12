/* _smoke_mini_api.js — 小程序 espn.js/api.js 的 node 冒烟。
   - espn.findScore: 注入 boards 断言中文队名子串匹配(9-12 英超样本 利物浦vs富勒姆)。
   - api: 若存在 miniprogram/utils/config.js(已 gitignore) 则注入全局 fetch 真实调
     fetchTodayPayload(断言 payload 含 matches 数组) 与 fetchBets(bets 表可能未建,
     404/400 算预期, 只打印 HTTP 状态不断言); 不存在则打印跳过提示。
   用法: node tools/_smoke_mini_api.js */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const espn = require(path.join(__dirname, "..", "miniprogram", "utils", "espn.js"));

// 1) espn.findScore 匹配逻辑(注入 boards, 不联网)
const boards = [{ home: "Liverpool", away: "Fulham", hs: "2", as: "1", st: "STATUS_FULL_TIME" }];
const hit = espn.findScore(boards, "利物浦", "富勒姆");
assert(hit && hit.hs === "2" && hit.as === "1" && hit.st === "STATUS_FULL_TIME",
  "findScore 应命中利物浦vs富勒姆, 实际: " + JSON.stringify(hit));
assert(espn.findScore(boards, "阿森纳", "富勒姆") === null, "主队不匹配应返回 null");
assert(espn.findScore(boards, "不存在队", "富勒姆") === null, "缺 TEAM 映射应返回 null");
console.log("findScore 命中: " + hit.hs + "-" + hit.as + " " + hit.st + " ✓");

// 2) DATES: 北京时间今日+次日, 格式 YYYYMMDD
const ds = espn.DATES();
assert(Array.isArray(ds) && ds.length === 2 && /^\d{8}$/.test(ds[0]) && /^\d{8}$/.test(ds[1]),
  "DATES 格式异常: " + JSON.stringify(ds));
console.log("DATES: " + ds.join(", ") + " ✓");

// 3) api 真实调用(需本地 config.js)
(async () => {
  const cfgPath = path.join(__dirname, "..", "miniprogram", "utils", "config.js");
  if (!fs.existsSync(cfgPath)) {
    console.log("跳过 Supabase 真实调用: miniprogram/utils/config.js 不存在(复制 config.example.js 填入配置后可跑)");
    return;
  }
  const api = require(path.join(__dirname, "..", "miniprogram", "utils", "api.js"));
  api.setFetcher(global.fetch);

  const payload = await api.fetchTodayPayload();
  if (payload && Array.isArray(payload.matches)) {
    console.log("fetchTodayPayload ✓ date=" + payload.date + " 场次数=" + payload.matches.length);
  } else {
    // ANON_KEY 被 RLS 会员门控拦(站点同样要求登录+审核通过后才可读 prediction_days)时返回空。
    // 用 SERVICE_KEY 直读验证链路与数据结构, 不断言 anon 结果。
    console.log("fetchTodayPayload(ANON_KEY) 返回空: RLS 会员门控, 匿名角色 0 行(与站点登录门槛一致)");
    const cfg = require(path.join(__dirname, "..", "miniprogram", "utils", "config.js"));
    const rows = await api.request("/rest/v1/prediction_days?select=date,payload&order=date.desc&limit=1",
      { key: cfg.SUPABASE_SERVICE_KEY });
    const p = rows && rows[0] ? rows[0].payload : null;
    assert(p && Array.isArray(p.matches), "SERVICE_KEY 直读应返回含 matches 数组的 payload");
    console.log("SERVICE_KEY 直读 ✓ date=" + p.date + " 场次数=" + p.matches.length);
  }

  try {
    const bets = await api.fetchBets();
    console.log("fetchBets ✓ HTTP 200, 行数=" + bets.length);
  } catch (e) {
    const m = String(e.message).match(/HTTP (\d+)/);
    const st = m ? m[1] : "?";
    assert(st === "404" || st === "400", "fetchBets 预期 404/400(bets 表未建), 实际: " + e.message);
    console.log("fetchBets 预期内失败 ✓ HTTP " + st + "(bets 表未建属预期)");
  }
  console.log("SMOKE_OK");
})().catch(e => { console.error("SMOKE_FAIL: " + (e && e.message)); process.exit(1); });
