/* 10-19(周一) 深夜快车窗口比分盯梢: 北单池 23 场(北单316-342, 00:20~07:05 开球)。
   通道: ESPN 主通道(已 probe 验证 17/23) + 出奇兜底(bel.1/rou.1/bra.2 部分场+阿甲337 走出奇 cq)。
   用法: node tools/_live1019.js          正常回填(有变更才写文件)
         node tools/_live1019.js --probe  只打印原始状态(调试映射) */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const file = path.join(__dirname, "..", "data", "predictions.js");
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, ".agents", "skills", "football-result-collect", "espn_score.js");
const probe = process.argv.includes("--probe");

const LEAGUES = {
  "北单316": "esp.2", "北单317": "esp.2", "北单318": null,
  "北单319": "gre.1", "北单320": "nor.1", "北单321": "ita.2",
  "北单322": "arg.1", "北单323": "ned.1", "北单324": "ned.1",
  "北单325": "gre.1", "北单326": null, "北单329": "esp.1",
  "北单330": "esp.2", "北单332": null, "北单333": "bra.2",
  "北单334": null, "北单336": "arg.1", "北单337": null,
  "北单338": "usa.1", "北单339": "bra.2", "北单340": "bra.1",
  "北单341": "bra.1", "北单342": "arg.1",
};
const TEAM = {
  "赫罗纳": "Girona", "FC安道尔": "Andorra",
  "巴利亚多利德": "Valladolid", "埃尔登斯": "Eldense",
  "基菲西亚": "Kifisia", "阿瑞斯": "Aris",
  "特罗姆瑟": "Tromso", "KFUM奥斯陆": "KFUM",
  "桑普多利亚": "Sampdoria", "阿雷佐": "Arezzo",
  "竞技俱乐部": "Racing", "阿根廷独立": "Independiente",
  "奈梅亨": "NEC", "锡塔德福图纳": "Fortuna",
  "特温特": "Twente", "乌德勒支": "Utrecht",
  "PAOK塞萨洛尼基": "PAOK", "伊拉克利斯": "Iraklis",
  "皇家马德里": "Real Madrid", "塞维利亚": "Sevilla",
  "布尔戈斯": "Burgos", "萨瓦德尔": "Sabadell",
  "巴西雷加塔斯": "CRB", "博塔弗戈SP": "Botafogo-SP",
  "拉普拉塔大学生": "La Plata", "圣洛伦索": "San Lorenzo",
  "FC辛辛那提": "Cincinnati", "哥伦布机员": "Columbus",
  "维拉诺瓦": "Vila Nova", "新奥里藏蒂诺": "Novorizontino",
  "巴伊亚": "Bahia", "弗拉门戈": "Flamengo",
  "雷莫": "Remo", "布拉干蒂诺红牛": "Bragantino",
  "贝尔格拉诺": "Belgrano", "河床": "River Plate",
};
const DATES = ["20261018", "20261019"];

const boards = {};
function board(lg, dt) {
  const k = lg + "@" + dt;
  if (boards[k] == null) {
    try { boards[k] = execSync(`node "${SKILL}" board ${lg} ${dt}`, { encoding: "utf8", timeout: 60000 }); }
    catch (e) { boards[k] = ""; }
  }
  return boards[k];
}
function findScore(lg, homeSub, awaySub) {
  for (const dt of DATES) {
    for (const line of board(lg, dt).split("\n")) {
      const m = line.match(/^\s*(.+?)\s+(\d+)-(\d+)\s+(.+?)\s+\[(\w+)\]/);
      if (!m) continue;
      const [, h, hs, as, a, st] = m;
      if (h.toLowerCase().includes(homeSub.toLowerCase()) && a.toLowerCase().includes(awaySub.toLowerCase())) {
        return { score: hs + "-" + as, status: st, raw: line.trim() };
      }
    }
  }
  return null;
}

function cqSnap() {
  for (const dir of [path.join(__dirname, ".."), __dirname]) {
    try {
      const fs1 = fs.readdirSync(dir).filter((f) => /^cq_\d{4}\.json$/.test(f)).sort();
      if (fs1.length) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, fs1[fs1.length - 1]), "utf8"));
        return j.matches || j.rows || j.data || [];
      }
    } catch (e) { /* 下一处 */ }
  }
  return [];
}
function cqScoreLabel(label, lottery, minPeriod) {
  const rows = cqSnap().filter((r) => (lottery ? r.lottery === lottery : true) && r.label === label);
  let best = null;
  for (const r of rows) {
    const p = Number(r.period || 0);
    if (minPeriod && p && p < minPeriod) continue;
    if (!r.played) continue;
    if (!best || p > Number(best.period || 0)) best = r;
  }
  return best ? { score: best.hs + "-" + best.as, raw: JSON.stringify(best) } : null;
}

function main() {
  const days = require(file);
  const day = days.find((d) => d.date === "2026-10-19");
  if (!day) { console.log("无 2026-10-19 日"); return; }
  let changed = 0;
  for (const mm of day.matches) {
    const lg = LEAGUES[mm.id];
    let hit = null;
    if (lg) hit = findScore(lg, TEAM[mm.home], TEAM[mm.away]);
    if (!hit) {
      const cq = cqScoreLabel(mm.id, "北单", 20261019);
      if (cq) hit = { score: cq.score, status: "FULL_TIME", raw: cq.raw };
    }
    if (probe) {
      console.log("%s %s vs %s | %s", mm.id, mm.home, mm.away, hit ? hit.raw : "(未找到)");
      continue;
    }
    if (hit && /^(STATUS_FULL_TIME|FULL_TIME|FT)$/i.test(hit.status) && mm.finalScore !== hit.score) {
      console.log("%s %s vs %s → %s", mm.id, mm.home, mm.away, hit.score);
      mm.finalScore = hit.score;
      changed++;
    }
  }
  if (changed && !probe) {
    const src = fs.readFileSync(file, "utf8");
    const header = src.slice(0, src.indexOf("const PREDICTION_DAYS"));
    const json = JSON.stringify(days, null, 2).split("\n").map(l => l.startsWith("  ") ? l.slice(2) : l).join("\n").replace(/\n\]$/, "];");
    fs.writeFileSync(file, header + "const PREDICTION_DAYS = " + json + "\n\nif (typeof module !== \"undefined\" && module.exports) { module.exports = PREDICTION_DAYS; }\n", "utf8");
    console.log("已回填 %d 场", changed);
  } else if (!probe) {
    console.log("无变更");
  }
}
main();
