/* 竞彩篮球 盘口快照归档器(2026-09-23 新增, 篮球板块数据层)
   动因: 两个源(官方 webapi / 出奇 odds)都**只返回当前值, 不给历史** —— 实测同一个 eventid
         隔两次调用 flags 就变了, 且 odds 表里每 (eventid, supplierid) 恒只有 1 行。
         ⇒ 位移信号【只能靠定时快照累积】, 而这件事**越早开跑越好**: 今天之前的盘口历史永远拿不回来。
   本模块【只归档, 不解释】: 原样存两源的原始响应, 不做归一化、不判全场/半场、不过滤供应商。
         任何清洗都写在别的脚本里 —— 归档目录是事实档案, 一旦落盘就不再改。
   产出: tools/lqsnap/<YYYYMMDD>/<HHMM>.json    当天按分钟切片的原始快照
         体 = { official(官方四池), poolList(单关/过关可用性), odds(出奇博彩盘) }
         tools/lqsnap/state.json                 { rounds, appends, lastRoundAt, lastAppendAt }
   ⚠️ 幂等: 与【最新一份】内容等价就不落盘(不堆垃圾); 切片名 <HHMM>.json。
   ⚠️ 冻结: 与更早的快照**只增不改** —— 同分钟内内容不同则追加 -2/-3 序号, 【绝不覆盖】。
          (实测 2026-09-23 踩过: 旧实现"同分钟重跑覆盖自己"在数据变了时会冲掉上一份真实快照,
           而位移证据一旦没了就永远拿不回来 —— 这正是本模块存在的理由。)
   用法: node tools/_lq_snap.js              取数并归档(内部串行调用 _lq_fetch.js / _lq_odds.js)
         node tools/_lq_snap.js --from=0923  不取数, 直接归档已存在的 lq_0923/lqodds_0923 (可测幂等)
         node tools/_lq_snap.js --dry        只报会不会落盘, 不写文件
   节奏建议: 开售时一次 + 临场前 2~3 次, 而非高频轮询(非官方接口, 别打太密)。
   ⚠️ Windows 无 cron: 要定时得用 schtasks 建计划任务(需另行确认后执行)。
*/
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const fromArg = (argv.find(a => a.startsWith("--from=")) || "").split("=")[1];

const dir = __dirname;
const SNAP_DIR = path.join(dir, "lqsnap");
const LOCK = path.join(SNAP_DIR, ".lock");

const now = () => new Date(Date.now() + 8 * 3600 * 1000);
const p2 = n => String(n).padStart(2, "0");
const stamp = () => { const d = now(); return { ymd: d.getUTCFullYear() + p2(d.getUTCMonth() + 1) + p2(d.getUTCDate()), hm: p2(d.getUTCHours()) + p2(d.getUTCMinutes()) }; };
const bj = ms => { const d = new Date(ms + 8 * 3600 * 1000); return d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()) + " " + p2(d.getUTCHours()) + ":" + p2(d.getUTCMinutes()); };

if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });

// ---- 独占锁: 防止两份快照同时写同一个切片(用 wx 原子创建) ----
if (!DRY) {
  try {
    fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
  } catch (e) {
    const age = (Date.now() - fs.statSync(LOCK).mtimeMs) / 60000;
    if (age < 10) { console.error("✗ 已有另一份归档在跑(锁 " + LOCK + ", " + Math.round(age) + " 分钟前) —— 退出"); process.exit(1); }
    console.log("⚠️ 发现 " + Math.round(age) + " 分钟前的陈旧锁, 抢占");
    fs.writeFileSync(LOCK, String(process.pid));
  }
}
const unlock = () => { try { fs.unlinkSync(LOCK); } catch (e) {} };
process.on("exit", unlock);

// ---- 取数(或复用已有文件) ----
const SNAP = fromArg || stamp().ymd.slice(4);   // MMDD
const lqName = "lq_" + SNAP + ".json", odName = "lqodds_" + SNAP + ".json";
if (!fromArg) {
  console.log("取数中… " + lqName + " + " + odName);
  for (const [js, label] of [["_lq_fetch.js", "官方四池"], ["_lq_odds.js", "出奇博彩盘"]]) {
    try {
      execFileSync(process.execPath, [path.join(dir, js), SNAP], { stdio: "inherit", cwd: dir });
    } catch (e) {
      console.error("✗ " + label + " 取数失败(" + js + ") —— 快照不完整, 拒绝归档");
      process.exit(1);
    }
  }
}
for (const f of [lqName, odName]) {
  if (!fs.existsSync(path.join(dir, f))) {
    console.error("✗ 缺 " + f + " —— 先跑 node tools/_lq_" + (f.startsWith("lq_") ? "fetch" : "odds") + ".js " + SNAP);
    process.exit(1);
  }
}
const lq = JSON.parse(fs.readFileSync(path.join(dir, lqName), "utf8"));
const od = JSON.parse(fs.readFileSync(path.join(dir, odName), "utf8"));

// ---- 稳定序列化: 键递归排序 ⇒ 内容相同必得同一字符串(否则对象键序抖动会被误判成"变了") ----
const canon = v => {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
};

// 归档体: 原样两源数据, 不带 fetchedAt(带时间戳会让每一次都"不同", 幂等就废了)
// ★ poolList(单关/过关可用性)**必须一起归档**: 官方接口只返回【当前在售】的 poolList,
//   一旦下架就再也拿不回来 —— 与盘口位移同理, 不归档 = 永久丢失。
//   (2026-09-23 实证: 重建 lqpool_20260922 时官方在售已从 305~308 缩到 307~308,
//    305/306 官方段当场退化成 book51。玩法可用性会以同样方式丢, 只是更无声。)
// ★ odds 必须按篮球白名单过滤: 出奇 /odds/data 返回的是【全量封套】(含足球等所有彩种),
//   实测 575 场里篮球仅 58 场 = 6.6%, 原样归档 = 93.4% 是无关噪音。
//   实测 4.7MB/轮 · 2 轮/天 ⇒ 3.4GB/年。而这份归档只服务篮球盘口位移。
//   ★ 白名单缺失时【不过滤 + 显式告警】: 宁可存胖, 绝不静默砍数据。
//   ★ 白名单取【今天 ∪ 昨天】: 竞彩期号 D 覆盖 [D凌晨, D+1上午] —— 昨天期号的比赛今天上午才开打,
//     那几小时恰恰是位移最活跃的窗口(2026-09-23 实证: 周二304~308 于 9-23 07:30~10:00 开打,
//     其中 305~308 是站上唯一有全场盘的四场)。只取当天会漏掉整段跨日窗口。
let bkEvUsed = "";
const bkEv = (() => {
  const pad = n => String(n).padStart(2, "0");
  const d0 = new Date();
  const d1 = new Date(d0.getTime() - 86400000);
  const ymd = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const files = [ymd(d0), ymd(d1)].map(y => path.join(__dirname, "lqpool_" + y + ".json"));
  const s = new Set();
  const used = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    try {
      const p = JSON.parse(fs.readFileSync(f, "utf8"));
      const n0 = s.size;
      (p.matches || []).forEach(m => { if (m && m.eventId) s.add(String(m.eventId)); });
      used.push(path.basename(f) + "(+" + (s.size - n0) + ")");
    } catch (e) { /* 坏文件跳过, 下面按"白名单为空"处理 */ }
  }
  bkEvUsed = used.join(" ∪ ");
  return s.size ? s : null;
})();
const allEvents = od.events || {};
let oddsKeep = allEvents;
if (bkEv) {
  oddsKeep = {};
  for (const [ev, e] of Object.entries(allEvents)) if (bkEv.has(String(ev))) oddsKeep[ev] = e;
  // 护栏: 有白名单却零交集 ⇒ 咬合键变了(或 lqpool 是别的期号开出的), 静默存 0 场比存胖危险得多
  if (!Object.keys(oddsKeep).length) {
    console.error("✗ lqpool 白名单有 " + bkEv.size + " 个 eventId, 却与出奇 events 零交集 —— 咬合键可能变了, 拒绝归档");
    process.exit(1);
  }
} else {
  console.warn("⚠ 未找到 lqpool_" + stamp().ymd + ".json —— 本次【不过滤】odds, 归档将含全量(含足球)");
}
const payload = { official: lq.pools || {}, poolList: lq.poolList || {}, odds: oddsKeep };
if (bkEv) console.log("白名单 " + bkEv.size + " 个 eventId(来自 " + bkEvUsed + ") ⇒ odds " +
  Object.keys(allEvents).length + " 场 → " + Object.keys(oddsKeep).length + " 场");
const digest = canon(payload);

// ---- 找当天最新一份 ----
const day = stamp().ymd;
const dayDir = path.join(SNAP_DIR, day);
// 切片名数值化排序: 0811.json < 0811-2.json < 0812.json
// ⚠️ 纯字符串排序会把 "0811-2.json" 排到 "0811.json"【前面】('-'(0x2D) < '.'(0x2E))
//    ⇒ 基线会取到旧切片, 位移报告凭空多出一堆假"变回原值"。必须按 (HHMM, 序号) 排。
const skey = f => { const m = f.match(/^(\d{4})(?:-(\d+))?\.json$/); return m ? Number(m[1]) * 1000 + (m[2] ? Number(m[2]) : 1) : null; };
const prevFiles = (fs.existsSync(dayDir) ? fs.readdirSync(dayDir) : [])
  .map(f => ({ f, k: skey(f) })).filter(x => x.k != null).sort((a, b) => a.k - b.k).map(x => x.f);
let prev = null, prevName = null, prevHasPL = false;   // prevHasPL: 上一份快照是否真含 poolList 段(老格式没有)
for (let i = prevFiles.length - 1; i >= 0; i--) {
  const raw = JSON.parse(fs.readFileSync(path.join(dayDir, prevFiles[i]), "utf8"));
  // ⚠️ 必须依据 **raw** 判有无 poolList, 不能在构造出的 prev 上查: 下面那行总会补上 poolList 键(哪怕 {}),
  //    于是 hasOwnProperty 恒为 true、守卫静默失效, 格式升级那一次会谎报成 6 条真实玩法变动。
  prevHasPL = Object.prototype.hasOwnProperty.call(raw, "poolList");
  prev = { official: raw.official || {}, poolList: raw.poolList || {}, odds: raw.odds || {} };
  prevName = prevFiles[i];
  break;
}

const nOff = Object.values(payload.official).reduce((a, arr) => a + (Array.isArray(arr) ? arr.length : 0), 0);
const nOdds = Object.values(payload.odds).reduce((a, e) => a + ((e.suppliers || []).length), 0);

if (prev && canon(prev) === digest) {
  console.log("= 与最新快照 " + prevName + " 内容一致 —— 不落盘(幂等)");
  console.log("  官方 " + nOff + " 行 / 博彩盘 " + nOdds + " 行 / " + Object.keys(payload.odds).length + " 场");
  return;
}

// ---- 位移报告(归档的产出价值就在这几行) ----
const mov = [];
if (prev) {
  // 官方线: (businessDate, matchNum) → 各池线值
  const idx = (snap, getKey, getLines) => { const m = {}; for (const [k, v] of Object.entries(getKey(snap))) m[k] = getLines(v); return m; };
  const offIdx = s => { const m = {}; for (const [pool, arr] of Object.entries(s.official)) for (const r of (arr || [])) { const k = String(r.businessDate) + "|" + r.matchNum + "|" + pool; m[k] = r.line == null ? null : Number(r.line); } return m; };
  const A = offIdx(prev), B = offIdx(payload);
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (A[k] !== B[k] && k in A && k in B) mov.push("官方 " + k + " " + A[k] + " → " + B[k]);
  }
  // 玩法可用性(单关/过关)位移 —— 开售/停售是产品信号(决定某场能不能进单关/过关产品)
  // ⚠️ 2026-09-23 之前的快照不含 poolList 段 ⇒ 首次升级后会看到"全是新增", 那是格式升级不是真变动
  let nPlMov = 0;
  if (prevHasPL) {
    const plIdx = s => { const m = {}; for (const [num, ps] of Object.entries(s.poolList || {})) for (const [p, v] of Object.entries(ps || {})) m[num + "|" + p] = v ? String(v.bettingSingle) + "/" + String(v.bettingAllup) : "-"; return m; };
    const E = plIdx(prev), F = plIdx(payload);
    for (const k of new Set([...Object.keys(E), ...Object.keys(F)])) {
      if (E[k] !== F[k]) { nPlMov++; if (mov.length < 30) mov.push("玩法(单关/过关) " + k + " " + (k in E ? E[k] : "(新)") + " → " + (k in F ? F[k] : "(消失)")); }
    }
  }
  const odIdx = s => { const m = {}; for (const [ev, e] of Object.entries(s.odds)) for (const sup of (e.suppliers || [])) { for (const seg of ["ah", "ou"]) { const v = sup[seg] && sup[seg].handicap; if (v != null) m[ev + "|" + sup.sup + "|" + seg] = Number(v); } } return m; };
  const C = odIdx(prev), D = odIdx(payload);
  // ★ 只有「两边都在场且值不同」才算**真位移**。
  //   出奇 odds 表是滚动窗口: 比赛完赛/无人下注即滑出, 每轮都有成百上千条"消失"
  //   (实测 2026-09-23 08:11→09:10: 1201 条里绝大多数是滑出)。
  //   把它们混进变动计数, 真位移会被噪声淹掉 —— 而位移正是本模块存在的理由, 不能自毁。
  let nOddsMov = 0, nOddsIn = 0, nOddsOut = 0;
  for (const k of new Set([...Object.keys(C), ...Object.keys(D)])) {
    if (C[k] === D[k]) continue;
    if (!(k in C)) { nOddsIn++; continue; }    // 新进窗口 —— 不是位移
    if (!(k in D)) { nOddsOut++; continue; }   // 滑出窗口 —— 不是位移
    nOddsMov++;
    if (mov.length < 30) mov.push("博彩 " + k + " " + C[k] + " → " + D[k]);
  }
  console.log("Δ 相对 " + prevName + " —— 官方线变动 " + mov.filter(x => x.startsWith("官方")).length + " 条 / 博彩盘真位移 " + nOddsMov + " 条" + (nPlMov ? " / 玩法变动 " + nPlMov + " 条" : ""));
  if (nOddsIn || nOddsOut) console.log("   (博彩盘进出窗口 " + nOddsIn + " 进 / " + nOddsOut + " 出 —— 滚动窗口的正常吞吐, 不计入位移)");
  // ⚠️ 报告里的 ah 是**出奇原始符号**(与官方口径相反), 且全程/半场混装(实测有 ah 4 → 20 这种
  //    其实是"这家从上半场盘换成了全场盘", 不是盘口移动)。本模块只归档不解释, 故原样输出 ——
  //    要当盘口移动读, 必须先过 _lq_pool.js 的符号归一 + market 判定。
  if (nOddsMov) console.log("   ⚠️ 上述 ah 为出奇原始符号且全程/半场混装 —— 不可直接当盘口移动, 须经 _lq_pool.js 归一化+market 过滤");
  if (!prevHasPL) console.log("   (" + prevName + " 为老格式(无 poolList 段) —— 本次落盘属格式升级, 玩法可用性自本次起才归档)");
} else {
  console.log("Δ 当天首份快照(无可比基线)");
}
for (const x of mov.slice(0, 20)) console.log("   " + x);
if (mov.length > 20) console.log("   … 另有 " + (mov.length - 20) + " 条");

// 能被走到这里 ⇒ 内容与最新快照【必定不同】(相同的话上面已 return)。
// 故同名文件若已存在, 它装的是【不同的】内容 —— 那是上一份真实快照, 覆盖 = 永久销毁位移证据。
// 追加序号而非覆盖。
const base = stamp().hm;
let outName = base + ".json";
for (let i = 2; fs.existsSync(path.join(dayDir, outName)); i++) outName = base + "-" + i + ".json";

if (DRY) { console.log("(dry-run —— 未落盘, 本该写入 " + path.join("lqsnap", day, outName) + ")"); return; }

// ---- 原子落盘: 先写 .tmp 再 rename ----
const outPath = path.join(dayDir, outName);
if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });
// ★ poolList 必须落盘 —— 官方接口只返回【当前在售】的玩法可用性, 一但下架就再也拿不回来
//   (见上方 84-87 行的注释: 9-23 实证 305/306 官方段当场退化成 book51)。
//   digest 一直含 poolList, 但落盘漏写 ⇒ 前 2 份快照一份都没留住, 属实现 bug(已修 2026-09-23)。
const body = JSON.stringify({
  ts: bj(Date.now()), day, source: { official: lqName, odds: odName },
  official: payload.official, poolList: payload.poolList, odds: payload.odds,
}, null, 1);
const tmp = outPath + ".tmp";
fs.writeFileSync(tmp, body, "utf8");
fs.renameSync(tmp, outPath);

// ---- 计数器 ----
const stPath = path.join(SNAP_DIR, "state.json");
let st = { rounds: 0, appends: 0, lastRoundAt: null, lastAppendAt: null };
try { st = JSON.parse(fs.readFileSync(stPath, "utf8")); } catch (e) {}
st.rounds++; st.appends++; st.lastRoundAt = bj(Date.now()); st.lastAppendAt = bj(Date.now());
fs.writeFileSync(stPath, JSON.stringify(st, null, 1), "utf8");

console.log("✓ → lqsnap/" + day + "/" + outName + "   " + (body.length / 1024).toFixed(0) + "KB");
console.log("  官方 " + nOff + " 行 / 博彩盘 " + nOdds + " 行 / " + Object.keys(payload.odds).length + " 场" +
  "   累计 " + st.appends + " 份");
