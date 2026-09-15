/* _smoke_mini_api.js — 小程序 espn.js/api.js 的 node 冒烟。
   - espn.findScore: 动态取当日 TEAM 映射造样本断言子串匹配(TEAM 为日抛生成数据, 不写死队名)。
   - api: 若存在 miniprogram/utils/config.js(已 gitignore) 则注入全局 fetch 真实调
     fetchTodayPayload(断言 payload 含 matches 数组) 与 fetchBets(bets 表可能未建,
     404/400 算预期, 只打印 HTTP 状态不断言); 不存在则打印跳过提示。
   用法: node tools/_smoke_mini_api.js */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const espn = require(path.join(__dirname, "..", "miniprogram", "utils", "espn.js"));

// 1) espn.findScore 匹配逻辑(注入 boards, 不联网)。
//    TEAM 映射是日抛数据(gen_mini_espn 每日从最新 _live<MMDD>.js 重生成), 不写死队名:
//    动态取当日映射首两条造样本赛事。
const TEAM = espn.TEAM_MAP;
const cnNames = Object.keys(TEAM);
assert(cnNames.length >= 2, "TEAM 映射应至少有 2 条(当日生成产物), 实际: " + cnNames.length);
const homeCn = cnNames[0], awayCn = cnNames[1];
const boards = [{ home: "Test " + TEAM[homeCn] + " Utd", away: TEAM[awayCn] + " FC", hs: "2", as: "1", st: "STATUS_FULL_TIME" }];
const hit = espn.findScore(boards, homeCn, awayCn);
assert(hit && hit.hs === "2" && hit.as === "1" && hit.st === "STATUS_FULL_TIME",
  "findScore 应命中 " + homeCn + "vs" + awayCn + ", 实际: " + JSON.stringify(hit));
assert(espn.findScore(boards, cnNames[2] || "不存在队", cnNames[3] || "也不存在队") === null,
  "映射外对阵应返回 null");
assert(espn.findScore(boards, "不存在队", awayCn) === null, "缺 TEAM 映射应返回 null");
console.log("findScore 命中: " + homeCn + "vs" + awayCn + " 2-1 STATUS_FULL_TIME ✓");

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

  // 2026-09-13 起数据通道=publishable key+MINI_TOKEN 走 RPC(supabase/mini_rpc.sql)。
  // 用户未在 SQL 编辑器执行 mini_rpc.sql 前, RPC 会 404(PGRST202), 打印提示不算失败。
  const payload = await api.fetchTodayPayload().catch((e) => ({ __err: String(e.message) }));
  if (payload && Array.isArray(payload.matches)) {
    console.log("fetchTodayPayload ✓ date=" + payload.date + " 场次数=" + payload.matches.length);
  } else if (payload && payload.__err && /PGRST202|404/.test(payload.__err)) {
    console.log("fetchTodayPayload 预期内失败: RPC 未部署(请在 Supabase SQL 编辑器执行 supabase/mini_rpc.sql)");
  } else {
    throw new Error("fetchTodayPayload 异常: " + (payload && payload.__err));
  }

  let rpcLive = false;
  try {
    const bets = await api.fetchBets();
    rpcLive = true;
    console.log("fetchBets ✓ 行数=" + bets.length);
  } catch (e) {
    if (/PGRST202|404/.test(String(e.message))) {
      console.log("fetchBets 预期内失败: RPC 未部署(mini_rpc.sql 未执行)");
    } else {
      throw e;
    }
  }

  /* 4) 编辑/删除函数探活 —— 幂等零副作用: nil uuid 匹配 0 行, 库里什么都不动,
        只证明"函数存在 + 参数名对 + 令牌通"。这是唯一能在 Node 侧压到 SQL 那一半的检查。
     只在 rpcLive 时严格断言: 整套 RPC 都没部署时上面已打印提示, 这里跟随跳过(不制造第二处红);
     而"RPC 在跑、新函数却没建"正是要抓的失败模式 —— 用户重跑 SQL 时漏了尾巴, 或粘贴截断。
     ★0 行命中时返回的不是 SQL null, 而是**全 null 字段的对象** {"id":null,...}:
       plpgsql 的 `returning * into r` 在 0 行时是逐字段置 null, composite datum 本身仍非空,
       故 to_json 照常渲染。这是 2026-09-15 实测的, 别照"应该返回 null"去写断言。
       判据因此是 r.id === null(主键永不为 null → 只有"没匹配到行"才会是 null);
       这仍能抓住真错: 若函数写错 p_id 条件误删/误改了别的行, 返回的 id 就不是 null。 */
  if (rpcLive) {
    const NIL = "00000000-0000-0000-0000-000000000000";
    const noRow = (r) => r === null || r === undefined || r.id === null;
    const del = await api.deleteBet(NIL);
    assert(noRow(del), "deleteBet(nil) 应返回 0 行(全 null 对象), 实际: " + JSON.stringify(del));
    // p_legs 传合法空数组而非 null: 0 行命中时列约束本不求值, 但没必要去赌求值顺序
    const ed = await api.editBet(NIL, { legs: [], stakes: 1, amount: 2, expect_payout: 3 });
    assert(noRow(ed), "editBet(nil) 应返回 0 行(全 null 对象), 实际: " + JSON.stringify(ed));
    console.log("mini_edit_bet / mini_delete_bet 探活 ✓  (nil uuid, 0 行受影响)");
  }
  console.log("SMOKE_OK");
})().catch(e => { console.error("SMOKE_FAIL: " + (e && e.message)); process.exit(1); });
