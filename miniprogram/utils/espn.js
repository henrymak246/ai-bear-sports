/* espn.js — 小程序 ESPN 实时比分模块(手写, 非生成)。
   LEAGUE_MAP 为静态联赛码注册表; TEAM_MAP/MATCH_LEAGUES 来自 espn_matches.js
   (由 tools/gen_mini_espn.js 从最新 tools/_live<MMDD>.js 每日生成)。
   死链联赛(如 kor.1)在 LEAGUE_MAP 中显式为 null, 调用方据此回退人工回填比分。

   ★真机取不到 ESPN 比分, 而且是**两条路都堵**(2026-09-15 实测):
     ① wx.request 直连: 受「request 合法域名」限制, site.api.espn.com 属境外域名、无法 ICP 备案,
        配不进白名单 → request:fail url not in domain list;
     ② 云函数出网(bear_api 的 espn_scoreboard): 腾讯云到 site.api.espn.com 被 ESPN 自家 CDN 拒
        —— 403 + Akamai「Access Denied」页(换浏览器请求头无效, 属 IP 段封锁)。
   所以真机上**不做无谓请求**: 直接判"ESPN 不可达", 让调用方(结算)回退 prediction_days 的
   finalScore —— 该值由本机流水线(tools/_live<MMDD>.js)用 ESPN 回填后 sync 进 Supabase,
   这条才是真机唯一可用的比分来源(见 docs/云函数通道.md「比分从哪来」)。
   取数通道优先级:
     ① 注入 fetcher(node 冒烟 / 页面透传) → 直连, 行为与改造前一致;
     ② config.ESPN_CLOUD === true 且云可用 → 云函数代理(★仅在将来接了境外中转时才开);
     ③ 开发者工具(platform === 'devtools', 勾了「不校验合法域名」) → wx.request 直连, 供联调;
     ④ 其余(真机) → 立即失败, 不产生任何请求。 */
const generated = require("./espn_matches.js");

const LEAGUE_MAP = {
  "英超": "eng.1", "意甲": "ita.1", "德甲": "ger.1", "西甲": "esp.1", "法甲": "fra.1",
  "日职": "jpn.1", "韩职": null, "沙职": "ksa.1", "挪超": "nor.1", "葡超": "por.1",
  "荷甲": "ned.1", "德乙": "ger.2", "法乙": "fra.2", "英冠": "eng.2", "瑞超": "swe.1",
  "巴甲": "bra.1", "芬超": "fin.1", "荷乙": "ned.2",
};

const TEAM_MAP = generated.TEAM;
const MATCH_LEAGUES = generated.LEAGUES;

/* 北京时间今日+次日的 'YYYYMMDD'(用 UTC+8 偏移换算, 不受运行时区影响) */
function DATES() {
  const fmt = (d) => {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return "" + y + m + day;
  };
  const bjNow = Date.now() + 8 * 3600 * 1000;
  return [fmt(new Date(bjNow)), fmt(new Date(bjNow + 24 * 3600 * 1000))];
}

/* 云通道可用性: 小程序内 + wx.cloud.callFunction 存在 + config 未显式关掉云通道
   (config.js 可能缺失/缺字段 → 默认开; 与 api.js 同一口径) */
function cloudReady() {
  if (typeof wx === "undefined" || !wx.cloud || typeof wx.cloud.callFunction !== "function") return false;
  let cfg = null;
  try { cfg = require("./config.js"); } catch (e) { cfg = null; }
  return !cfg || cfg.USE_CLOUD !== false;
}

function cloudFnName() {
  try {
    const c = require("./config.js");
    return (c && c.CLOUD_FN) || "bear_api";
  } catch (e) { return "bear_api"; }
}

/* ESPN 云代理开关 —— 默认**关**: 腾讯云出网到 ESPN 已被实测证伪(403 Akamai),
   接上境外中转(见 docs/云函数通道.md)后把它设 true 即可复用同一条链路。 */
function espnCloudEnabled() {
  try {
    const c = require("./config.js");
    return !!(c && c.ESPN_CLOUD);
  } catch (e) { return false; }
}

/* 能否直连 ESPN: node(冒烟/生成器)/开发者工具 = 能; 真机 = 不能(白名单 + CDN 双重封锁) */
function espnDirect() {
  if (typeof wx === "undefined") return true;
  if (typeof wx.getSystemInfoSync !== "function") return true;
  try { return wx.getSystemInfoSync().platform === "devtools"; } catch (e) { return false; }
}

/* 真机通道: 不发请求, 直接失败 —— 让结算立刻回退当日 finalScore, 而不是干等超时/刷错误日志 */
function unreachableFetcher() {
  return Promise.reject(new Error("ESPN 真机不可达(改用当日 finalScore)"));
}

/* 通道选择收在一处: 页面只拿 makeBoardFetcher, 不允许自己包 fetcher(会绕过这里的判断) */
function pickChannel() {
  if (espnCloudEnabled() && cloudReady()) return cloudFetcher;
  return espnDirect() ? defaultFetcher : unreachableFetcher;
}

/* 云函数 espn_scoreboard 代理 → [{home,away,hs,as,st}](服务端已归一化, 这里不再解析 ESPN 结构) */
async function cloudScoreboard(leagueCode, yyyymmdd) {
  const res = await wx.cloud.callFunction({
    name: cloudFnName(),
    data: { fn: "espn_scoreboard", args: { league: leagueCode, date: yyyymmdd } },
  });
  const r = res && res.result;
  if (!r || r.ok !== true) {
    throw new Error("云函数 espn_scoreboard 失败: " + ((r && r.error) || "无返回(检查云函数 bear_api 是否已部署)"));
  }
  return r.data || [];
}

function defaultFetcher(url) {
  if (typeof wx !== "undefined" && wx.request) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        header: { "User-Agent": "Mozilla/5.0" },
        success: (res) => resolve({
          ok: res.statusCode === 200,
          status: res.statusCode,
          json: async () => res.data,
        }),
        fail: (err) => reject(new Error((err && err.errMsg) || "wx.request 失败")),
      });
    });
  }
  if (typeof fetch !== "undefined") {
    return fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  }
  return Promise.reject(new Error("无可用请求通道(小程序需 wx.request, node 需注入 fetcher)"));
}

function boardUrl(leagueCode, yyyymmdd) {
  return "https://site.api.espn.com/apis/site/v2/sports/soccer/" + leagueCode +
    "/scoreboard?dates=" + yyyymmdd;
}

/* URL → {ok, status, json()} 的云通道形态: 从 URL 反解(联赛, 日期)后走云函数,
   返回体里的 rows 已是归一化行(服务端归一), 供 fetchBoard 直接透出。 */
function cloudFetcher(url) {
  const m = String(url).match(/\/soccer\/([^/]+)\/scoreboard\?dates=(\d{8})$/);
  if (!m) return Promise.reject(new Error("无法从 URL 解析联赛/日期: " + url));
  return cloudScoreboard(m[1], m[2]).then(function (rows) {
    return { ok: true, status: 200, json: async () => ({ rows: rows }) };
  });
}

/* 结算轮询用: 造一个「URL 级去重 + 自动选通道」的取板器(同一轮同联赛多腿只拉一次)。
   ★通道选择必须留在这里: 调用方(如投注页)自己包 defaultFetcher 注入时, 真机就会绕过
     云通道、走回 wx.request 直连的失败路径。cache 按轮次传入, 轮末即弃(比分要能刷新)。 */
function makeBoardFetcher(cache) {
  const c = cache || {};
  return function (url) {
    if (!(url in c)) c[url] = pickChannel()(url);
    return c[url];
  };
}

/* 原始 ESPN JSON 结构 → 归一化行 */
function normalizeEvents(list) {
  return (list || []).map(e => {
    const comp = (e.competitions || [])[0] || {};
    const cs = comp.competitors || [];
    const h = cs.find(x => x.homeAway === "home") || {};
    const a = cs.find(x => x.homeAway === "away") || {};
    return {
      home: ((h.team || {}).displayName || ""),
      away: ((a.team || {}).displayName || ""),
      hs: h.score,
      as: a.score,
      st: (e.status && e.status.type && e.status.type.name) || "",
    };
  });
}

/* GET ESPN scoreboard → [{home, away, hs, as, st}]
   home/away=team.displayName, hs/as=score, st=status.type.name; 非 200 → reject。
   fetcher 缺省时按 pickChannel() 自动选通道(真机上会立刻失败 → 调用方回退 finalScore)。 */
async function fetchBoard(leagueCode, yyyymmdd, fetcher) {
  const f = fetcher || pickChannel();
  const r = await f(boardUrl(leagueCode, yyyymmdd));
  if (!r.ok) throw new Error("ESPN " + leagueCode + "@" + yyyymmdd + " HTTP " + (r.status || "?"));
  const j = await r.json();
  return Array.isArray(j && j.rows) ? j.rows : normalizeEvents((j && j.events) || []);
}

/* 用 TEAM_MAP 子串(不区分大小写)在 boards 里找 home 含主、away 含客的赛事
   → {hs, as, st} | null(缺映射或未命中均 null) */
function findScore(boards, homeCn, awayCn) {
  const th = TEAM_MAP[homeCn], ta = TEAM_MAP[awayCn];
  if (!th || !ta) return null;
  const ev = (boards || []).find(b =>
    (b.home || "").toLowerCase().includes(th.toLowerCase()) &&
    (b.away || "").toLowerCase().includes(ta.toLowerCase()));
  return ev ? { hs: ev.hs, as: ev.as, st: ev.st } : null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LEAGUE_MAP, TEAM_MAP, MATCH_LEAGUES, DATES, fetchBoard, findScore, defaultFetcher,
    cloudFetcher, makeBoardFetcher, cloudReady, cloudScoreboard, cloudFnName,
    espnCloudEnabled, espnDirect, unreachableFetcher, pickChannel };
}
