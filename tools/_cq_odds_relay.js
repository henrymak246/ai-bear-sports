/* 出奇盘口快照中继(本机计划任务 FootballOddsRelay 用): 每小时抓出奇全量盘口表(澳彩/365/伟德 亚盘+欧赔),
   本机带时间戳落盘 _cq_odds_snap_<MMDD>_<HHmm>.json → ssh stdin 管道推送东京 /root/football/tools/odds_snapshots/(归档冗余)。
   背景: 东京直连出奇超时(10-20 实测 000), 盘口只能本机收集中继; 比分已由 _cq_relay.js 覆盖, 本脚本只管盘口。
   用途: 盘路时序分析(_ah_moves.js 读本机快照序列); 本机与东京各保留最近 2 天, 超时自动清理。
   用法: node tools/_cq_odds_relay.js */
const { execSync } = require("child_process");
const https = require("https");
const path = require("path");
const fs = require("fs");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0";
const REFERER = "https://live.chuqi.com/football/freecall";
const ODDS_URL = "https://d.botidata8.com/odds/data?scheme=1&virtual=1&ps=0&choose=9984&special=true";
const REMOTE_DIR = "/root/football/tools/odds_snapshots";
const KEEP_MS = 2 * 24 * 3600 * 1000;

const bj = new Date(Date.now() + 8 * 3600 * 1000);
const p = n => String(n).padStart(2, "0");
const mmdd = p(bj.getUTCMonth() + 1) + p(bj.getUTCDate());
const hhmm = p(bj.getUTCHours()) + p(bj.getUTCMinutes());
const snapName = `_cq_odds_snap_${mmdd}_${hhmm}.json`;
const snapPath = path.join(__dirname, snapName);
const logFile = path.join(__dirname, "_cq_odds_relay.log");
const log = m => { const line = new Date().toISOString() + " " + m; try { fs.appendFileSync(logFile, line + "\n"); } catch (_) {} console.log(line); };

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": UA, "Referer": REFERER, "Accept-Encoding": "gzip" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        let buf = Buffer.concat(chunks);
        if (res.headers["content-encoding"] === "gzip") buf = require("zlib").gunzipSync(buf);
        resolve(buf);
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("超时")));
  });
}

function cleanLocal() {
  let n = 0;
  for (const f of fs.readdirSync(__dirname)) {
    if (!/^_cq_odds_snap_\d{4}_\d{4}\.json$/.test(f)) continue;
    const fp = path.join(__dirname, f);
    if (Date.now() - fs.statSync(fp).mtimeMs > KEEP_MS) { fs.unlinkSync(fp); n++; }
  }
  if (n) log(`本机清理旧快照 ${n} 个`);
}

function cleanRemote() {
  try {
    execSync(`ssh tokyo-via-proxy "find ${REMOTE_DIR} -name '_cq_odds_snap_*' -mtime +2 -delete"`, { stdio: "pipe" });
  } catch (e) { log("东京清理失败(忽略): " + String(e.message).slice(0, 120)); }
}

async function main() {
  const buf = await get(ODDS_URL);
  // 有效性检查: JSON 且含 odds.ah 表
  const j = JSON.parse(buf.toString());
  if (!j.data || !j.data["odds.ah"] || !j.data.odds) throw new Error("快照结构异常(无 odds.ah/odds 表)");
  fs.writeFileSync(snapPath, buf);
  log(`✓ 抓取 ${snapName} ${(buf.length / 1048576).toFixed(1)}MB 盘口行数=${j.data["odds.ah"].data.length}`);

  execSync(`ssh tokyo-via-proxy "mkdir -p ${REMOTE_DIR} && cat > ${REMOTE_DIR}/${snapName}"`, { input: buf, stdio: ["pipe", "pipe", "pipe"] });
  log(`✓ 推送东京 ${REMOTE_DIR}/${snapName}`);

  cleanLocal();
  cleanRemote();
}

main().then(() => log("✓ 盘路中继完成")).catch((e) => { log("✗ 盘路中继失败: " + String(e.message).slice(0, 200)); process.exit(1); });
