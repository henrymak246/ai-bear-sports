/* espn.js — 小程序 ESPN 实时比分模块(手写, 非生成)。
   LEAGUE_MAP 为静态联赛码注册表; TEAM_MAP/MATCH_LEAGUES 来自 espn_matches.js
   (由 tools/gen_mini_espn.js 从最新 tools/_live<MMDD>.js 每日生成)。
   死链联赛(如 kor.1)在 LEAGUE_MAP 中显式为 null, 调用方据此回退人工回填比分。 */
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

/* GET ESPN scoreboard → [{home, away, hs, as, st}]
   home/away=team.displayName, hs/as=score, st=status.type.name; 非 200 → reject */
async function fetchBoard(leagueCode, yyyymmdd, fetcher) {
  const url = "https://site.api.espn.com/apis/site/v2/sports/soccer/" + leagueCode +
    "/scoreboard?dates=" + yyyymmdd;
  const r = await (fetcher || defaultFetcher)(url);
  if (!r.ok) throw new Error("ESPN " + leagueCode + "@" + yyyymmdd + " HTTP " + (r.status || "?"));
  const j = await r.json();
  return (j.events || []).map(e => {
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
  module.exports = { LEAGUE_MAP, TEAM_MAP, MATCH_LEAGUES, DATES, fetchBoard, findScore };
}
