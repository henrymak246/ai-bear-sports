/* 竞彩篮球 官方四池 SP 抓取(2026-09-23 新增, 篮球板块数据层第一步)
   动因: 篮球板块要独立于足球的取数链路。官方 webapi 的篮球接口与足球同构, 换 /football/ → /basketball/ 即可,
         但**四玩法必须各调一次** —— 单次调用只填自己那一段, 其余段返回 {} (实测)。
   实测(2026-09-23): mnl/hdc/hilo/wnm 四池全部 HTTP 200。
   池覆盖是**稀疏且活的**: 同日实测 hdc/hilo/wnm 各 5 场而 mnl 仅 2 场; 隔一次调用 hilo 从 5 场变 4 场。
         ⇒ 逐池独立记录, 绝不假设四池齐全; 每场「开没开这个池」必须显式表达。
   ⚠️ 三态语义(下游 _lq_pool.js 依赖, 不可混):
         pools[p] === null  → 未知(该池抓取失败), 下游所有场次该池记 null
         pools[p] === []    → 确认当日无场次
         pools[p][i]        → 正常数据
   ⚠️ 逐池字段映射**互不相同**, 不写通用映射器(实测形状):
         mnl : { h, a }              主胜/客胜; goalLine 为空串(不让分)
         hdc : { h, a, goalLine }    h=主队(让分后)/a=客队; goalLine **有符号, 负=主队让分**
         hilo: { h, l, goalLine }     ⚠️ h=**大分** / l=**小分** —— 不是主客队! 且**没有 a**
         wnm : { w1..w6, l1..l6 }     w=主胜分差6档 / l=**客胜**分差6档
     同一个字母 l 在三个池里三种含义(hilo.l=小分 / wnm.l=客胜 / 出奇 odds.ah.lost=客队水位),
     这是本模块最容易写错的地方 ⇒ 归一成 over/under、home/away 等**无歧义名**再落盘。
   胜分差档位(拟合结论, 非源字段): w1..w6 = 主胜 1-5 / 6-10 / 11-15 / 16-20 / 21-25 / 26+;
         l1..l6 = 客胜同一套。证据: 某 -6.5 让分场 w=[5.30,3.30,4.80,8.00,10.00,11.00] 单峰且峰值
         落在 w2(=6-10, 与 -6.5 线一致); l=[6.35,6.60,14.00,22.00,34.00,44.00] 对弱客队单调递减。
   产出: tools/lq_<MMDD>.json
         { fetchedAt, source, businessDates:[...], errors:[],
           pools:{ hdc:[...]|null, hilo:[...]|null, mnl:[...]|null, wnm:[...]|null },
           poolList:{ "<matchNum>": { "<POOL>": {...原始 poolList 条目...} } } }
         场次行: { businessDate, matchNum, matchNumStr, matchDate, matchTime, matchId,
                   matchStatus, home, away, homeAll, awayAll, league, leagueCode,
                   homeRank, awayRank, updateDate, updateTime, ...池专属字段 }
   用法: node tools/_lq_fetch.js            抓最新在售(缺省 MMDD = 今日北京)
         node tools/_lq_fetch.js 0922       指定快照命名口径
   注意: 官方接口, 但仍应低频拉取 + 落盘缓存。 */
const fs = require("fs");
const path = require("path");

const API = "https://webapi.sporttery.cn/gateway/jc/basketball/getMatchCalculatorV1.qry";
const REFERER = "https://www.sporttery.cn/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const POOLS = ["hdc", "hilo", "mnl", "wnm"];   // 固定顺序, 保证产出可复现

const mmdd = process.argv[2] || (() => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
})();
const OUT = path.join(__dirname, "lq_" + mmdd + ".json");

const bj = ms => {
  const d = new Date(Number(ms) + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
// "空串/未给" 一律 null, 绝不补 0 —— 0 会让「让平手」与「没这一盘」无法区分
const numOrNull = v => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = v => (v === undefined || v === null || String(v).trim() === "") ? null : String(v).trim();

(async () => {
  const pools = {}, poolList = {}, errors = [], seenDates = new Set();

  for (const pool of POOLS) {
    const url = `${API}?poolCode=${pool}&channel=c`;
    let ms;
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Referer: REFERER } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      // 响应形状: { value: { matchInfoList: [ { subMatchList: [ ...场次... ] } ] } }
      const groups = ((j.value || {}).matchInfoList) || [];
      ms = groups.flatMap(g => g.subMatchList || []);
      if (!Array.isArray(ms)) throw new Error("subMatchList 非数组");
    } catch (e) {
      // 单池失败不拖垮其余三池; 记 null = 未知(不是"没有")
      pools[pool] = null;
      errors.push({ pool, msg: String(e.message || e) });
      console.error(`⚠️ ${pool} 抓取失败: ${e.message} —— 记 null(未知)`);
      continue;
    }

    pools[pool] = ms.map(x => {
      const o = x[pool] || {};
      const bd = strOrNull(x.businessDate);
      if (bd) seenDates.add(bd);
      const num = Number(x.matchNum);
      // poolList 原样留档(含单关/过关可用性), 不挑选字段
      if (!poolList[num]) poolList[num] = {};
      const pl = (x.poolList || [])[0];
      if (pl) poolList[num][pool.toUpperCase()] = pl;

      const row = {
        businessDate: bd,
        matchNum: num,
        matchNumStr: strOrNull(x.matchNumStr),
        matchDate: strOrNull(x.matchDate),
        matchTime: strOrNull(x.matchTime),
        matchId: x.matchId === undefined ? null : x.matchId,
        matchStatus: strOrNull(x.matchStatus),
        home: strOrNull(x.homeTeamAbbName),
        away: strOrNull(x.awayTeamAbbName),
        homeAll: strOrNull(x.homeTeamAllName),
        awayAll: strOrNull(x.awayTeamAllName),
        league: strOrNull(x.leagueAbbName),
        leagueCode: strOrNull(x.leagueCode),
        homeRank: strOrNull(x.homeRank),
        awayRank: strOrNull(x.awayRank),
        updateDate: strOrNull(o.updateDate),
        updateTime: strOrNull(o.updateTime),
      };
      // ↓ 逐池显式映射, 无通用分支
      if (pool === "hdc") {          // 让分胜负: h/a = 主/客(让分后); goalLine 有符号(负=主队让分)
        row.lineRaw = strOrNull(o.goalLine);
        row.line = numOrNull(o.goalLine);
        row.lineFrom = "goalLine";
        row.homeOdds = numOrNull(o.h);
        row.awayOdds = numOrNull(o.a);
      } else if (pool === "hilo") {  // 大小分: ⚠️ h=大分 / l=小分 —— 不是主客队, 改名落盘
        row.lineRaw = strOrNull(o.goalLine);
        row.line = numOrNull(o.goalLine);
        row.lineFrom = "goalLine";
        row.overOdds  = numOrNull(o.h);
        row.underOdds = numOrNull(o.l);
      } else if (pool === "mnl") {   // 胜负(不让分): 只有两路, 无平局
        row.lineRaw = null; row.line = null; row.lineFrom = null;
        row.homeOdds = numOrNull(o.h);
        row.awayOdds = numOrNull(o.a);
        row.drawRaw = strOrNull(o.d);   // 篮彩 draw 恒 0; 若源真给了值, 留档而不进下游
      } else if (pool === "wnm") {   // 胜分差: w=主胜6档 / l=客胜6档
        row.lineRaw = null; row.line = null; row.lineFrom = null;
        row.w = [1, 2, 3, 4, 5, 6].map(i => numOrNull(o["w" + i]));
        row.l = [1, 2, 3, 4, 5, 6].map(i => numOrNull(o["l" + i]));
      }
      return row;
    }).sort((a, b) => a.matchNum - b.matchNum);   // 固定排序 ⇒ 产出可复现, 可直接 diff
  }

  const businessDates = [...seenDates].sort();
  // R6 防线: 官方响应理论上可能混多个营业日; 实测只出现 1 个, 多于此值要显式告警
  if (businessDates.length > 1) {
    console.error(`⚠️ 官方响应含 ${businessDates.length} 个 businessDate: ${businessDates.join(", ")}`);
    console.error("   —— 下游 _lq_pool.js 会按日期硬过滤, 这里先告警以免静默混入");
  }

  fs.writeFileSync(OUT, JSON.stringify({
    fetchedAt: bj(Date.now()),
    source: `${API}?poolCode={${POOLS.join("|")}}&channel=c`,
    businessDates, errors, pools, poolList,
  }, null, 1), "utf8");

  console.log(`✓ → ${path.basename(OUT)}   营业日 ${businessDates.join(", ") || "(无)"}`);
  for (const p of POOLS) {
    const a = pools[p];
    console.log("  " + p.padEnd(5) + (a === null ? "✗ 未知(抓取失败)" : ` ${a.length} 场`) +
      (a && a.length ? "   样本 " + a[0].matchNumStr + " " + a[0].home + " vs " + a[0].away : ""));
  }
  if (errors.length) console.log("  错误 " + errors.length + " 条: " + errors.map(e => e.pool).join(", "));
})();
