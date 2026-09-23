/* 出奇体育 竞彩篮球 博彩公司盘口抓取(2026-09-23 新增, 篮球板块数据层第一步)
   动因: 官方 webapi 只给竞彩 SP(单一盘口), 篮球要做类似足球「亚盘水位」的分析, 需要多家博彩公司盘。
         出奇 /odds/data 的篮球口径是 choose=9984(足球是 458783), 其余参数同。
         ⚠️ choose=458783(足球口径) 在篮球上返回 HTTP 500 —— 别照搬足球的 URL。
   实测(2026-09-23): 每场 5~23 家供应商(中位 22), 表 odds / odds.1x2 / odds.ah / odds.ou;
         四张表按 odds.id ↔ {1x2,ah,ou}.oddsid 关联。
   ⚠️ 本模块**只做结构组装, 不做任何解释**:
         - 不做供应商过滤(哪些是占位废行, 由 _lq_pool.js 判)
         - **不做让分符号归一**(符号约定与官方 goalLine 相反, 归一化统一放 _lq_pool.js ——
           那里有官方线可做交叉护栏, 单源处归一无法自证)
         - 不改名(handicap/win/lost/over/under 原样留), 保留完整审计链
   已知数据质量(**全量 610 场 × 22 家实测**, 供 _lq_pool.js 过滤规则参考):
         - ★ **让分 handicap 是【有符号】数**: 正 = 主队受让, 负 = 主队让分, 0 = 平手盘。
           实测 sup1 正 331 / 负 191 / 零 85, 家家如此。
           ⚠️ 我一度记成"无符号正数" —— 照那个前提写归一化, 每一个让分判断都会静默反向。
         - ★ **supplier 51 = 竞彩官方线本身**(与 webapi 逐字节相同) ⇒ 下游必须标 isOfficial 并剔除,
           否则官方线被当成第 13 家重复计入。它的 ah/ou 只在竞彩真实开售的场次存在
           (实测 60 场, 恰好 = 官方 hdc 池覆盖的 60 场); 值就是竞彩 SP(常 1.7/1.7 对开)。
           ⚠️ 那 1.7/1.7 **不是未开盘占位符**(我曾如此误判, 已由 _lq_pool.js 证伪)。
         - 1x2 段并非"24/30/51 缺失": 三家分别 546/546/203 场有值 —— 是**覆盖率低**(排盘不全),
           不是结构缺失。以少数样本推"段缺失"会误删有效供应商。
         - odds.1x2.draw 对篮球恒 0(无平局), 不可当信号
         - rank 恒为 1(不可用作可信度排序); source 仅 supplier=1 有值
         - flags 是**活的**(同一 eventid 隔两次调用取值会变) ⇒ 位移只能靠快照累积, 见 _lq_snap.js
   产出: tools/lqodds_<MMDD>.json
         { fetchedAt, source, counts:{...}, truncation:null|{...}, events:{ "<eventId>": { suppliers:[...] } } }
         供应商行: { sup, id, gameflags, rank, source, flags,
                     ah:{handicap,win,lost,flags}|null, ou:{handicap,over,under,flags}|null,
                     x12:{win,draw,lost,flags}|null }
   用法: node tools/_lq_odds.js           抓最新(缺省 MMDD = 今日北京)
         node tools/_lq_odds.js 0922      指定快照命名口径
   注意: 非官方接口, 低频拉取 + 落盘缓存, 勿高频轮询。 */
const fs = require("fs");
const path = require("path");

const API = "https://d.botidata8.com/odds/data";
const REFERER = "https://live.chuqi.com/football/freecall";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PS = 5000;
// choose=9984 是篮球口径; 足球的 458783 在篮球上 HTTP 500
const QS = `?scheme=1&ps=${PS}&choose=9984&virtual=1&lottery=true`;

const mmdd = process.argv[2] || (() => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
})();
const OUT = path.join(__dirname, "lqodds_" + mmdd + ".json");

const bj = ms => {
  const d = new Date(Number(ms) + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};
const nOrNull = v => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

(async () => {
  const r = await fetch(API + QS, { headers: { "User-Agent": UA, Referer: REFERER } });
  if (!r.ok) { console.error("HTTP " + r.status + " " + API); process.exit(1); }
  const j = await r.json();
  if (j.code !== 0) { console.error("接口返回 code=" + j.code + " name=" + j.name); process.exit(1); }
  const d = j.data || {};

  // 列式表 → 对象数组
  const tbl = k => {
    const t = d[k] || {};
    const f = t.fields || [];
    return (t.data || []).map(row => { const o = {}; f.forEach((key, i) => o[key] = row[i]); return o; });
  };
  const odds = tbl("odds"), ah = tbl("odds.ah"), ou = tbl("odds.ou"), x12 = tbl("odds.1x2");

  // 截断护栏: 任一张表行数**恰好等于 ps** 即高度可疑(被页码截断)。
  // 被截断的快照看起来就像"供应商消失", 而位移分析会把它忠实地记成盘口移动 —— 静默错, 必须硬拦。
  // 实测 2026-09-23: odds 表 12712 行 > ps, 故 ps 不是行数上限; 此护栏是防御性的。
  const counts = { odds: odds.length, ah: ah.length, ou: ou.length, x12: x12.length };
  const truncation = Object.entries(counts).filter(([, n]) => n === PS).map(([k, n]) => ({ table: k, rows: n }));
  if (truncation.length) {
    console.error("✗ 疑似截断: 表 " + truncation.map(t => t.table).join(", ") + " 行数恰好 = ps(" + PS + ")");
    console.error("  被截断的快照会让位移分析记下假移动 —— 拒绝产出文件, 请改用更大 ps 或分页。");
    process.exit(1);
  }

  const idx = (arr, f) => { const m = {}; arr.forEach(o => { m[o[f]] = o; }); return m; };
  const AH = idx(ah, "oddsid"), OU = idx(ou, "oddsid"), X12 = idx(x12, "oddsid");

  // 按 eventid 归组
  const events = {};
  for (const o of odds) {
    const e = events[o.eventid] || (events[o.eventid] = { suppliers: [] });
    const a = AH[o.id], u = OU[o.id], w = X12[o.id];
    e.suppliers.push({
      sup: o.supplierid, id: o.id, gameflags: o.gameflags, rank: o.rank,
      source: o.source === undefined ? null : o.source, flags: o.flags,
      ah:  a ? { handicap: nOrNull(a.handicap), win: nOrNull(a.win), lost: nOrNull(a.lost), flags: a.flags } : null,
      ou:  u ? { handicap: nOrNull(u.handicap), over: nOrNull(u.over), under: nOrNull(u.under), flags: u.flags } : null,
      x12: w ? { win: nOrNull(w.win), draw: nOrNull(w.draw), lost: nOrNull(w.lost), flags: w.flags } : null,
    });
  }
  // 供应商按 sup 数值排序 ⇒ 产出可复现, 可直接 diff
  Object.values(events).forEach(e => e.suppliers.sort((p, q) => p.sup - q.sup));

  fs.writeFileSync(OUT, JSON.stringify({
    fetchedAt: bj(Date.now()), source: API + QS, counts, truncation: null, events,
  }, null, 1), "utf8");

  const supCounts = Object.values(events).map(e => e.suppliers.length);
  console.log(`✓ → ${path.basename(OUT)}   ${Object.keys(events).length} 场 / ${odds.length} 个供应商盘`);
  console.log(`  表行数 odds=${counts.odds} ah=${counts.ah} ou=${counts.ou} 1x2=${counts.x12}`);
  console.log(`  每场供应商数 中位 ${supCounts.sort((a, b) => a - b)[Math.floor(supCounts.length / 2)]} / 最少 ${Math.min(...supCounts)} / 最多 ${Math.max(...supCounts)}`);
})();
