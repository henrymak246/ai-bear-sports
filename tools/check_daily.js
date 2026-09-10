/* 每日发布前自检(V3.2 ★4+ 硬门禁 + V3.3 胆/北单门禁):
   扫指定日(默认最新日)数据, 发现以下情形即报错(修正后再发):
     [★4+] ①反向/博冷标记: note/reason 含 诱|反向|魔咒|博冷|防冷|冲突|虚火 ②所选侧受让 ≥1.5 球
     [胆]  max7 key 腿: 主场胆 SP>1.35 / 客场胆 SP>1.5 / 放弃清单联赛胆(沙职等)
     [北单] beidan310 单选腿(非 a/b 双选)让球 ≠0(让球场一律双选: 让-1用3/1, 让+1用0/1)
   用法: node tools/check_daily.js [YYYY-MM-DD]   退出码 0=通过, 1=有违规 */
const path = require("path");
const days = require(path.join(__dirname, "..", "data", "predictions.js"));

const dateArg = process.argv[2];
const day = dateArg ? days.find(d => d.date === dateArg) : days[0];
if (!day) { console.error("找不到日期 " + dateArg); process.exit(1); }

const BAD = /诱|反向|魔咒|博冷|防冷|冲突|虚火/;
const COLD_LEAGUES = new Set("韩职,韩K联,葡超,瑞超,巴甲,解放者杯,阿甲,美职联,法乙,白俄超,MLS,南俱杯,巴西甲,德乙,沙职".split(","));
const violations = [];

function matchOf(idx3) {
  return (day.matches || []).find(m => String(m.id || "").slice(-3) === idx3) || null;
}

// ---- V3.2 ★4+ 门禁 ----
function checkAh(tag, pickText, conf, text) {
  if ((conf || 0) < 4) return;
  if (BAD.test(text || "")) {
    violations.push(`[★4+] ${tag} ${pickText} ★${conf}: 含反向/博冷标记(${(text || "").match(BAD)[0]})`);
  }
  const m = String(pickText || "").match(/\+\s*(\d+(?:\.\d+)?)\s*$/);
  if (m && parseFloat(m[1]) >= 1.5) {
    violations.push(`[★4+] ${tag} ${pickText} ★${conf}: 深盘受让 +${m[1]} ≥1.5 不给 ★4+`);
  }
}
(day.matches || []).forEach(m => {
  if (m.ahPick) checkAh(`${m.id} ${m.home}vs${m.away}`, m.ahPick, m.ahConf, m.note);
});
((day.asian7 && day.asian7.legs) || []).forEach(l => {
  const c = parseInt(((l.reason || "").match(/★(\d)/) || [0, 0])[1]);
  checkAh(`asian7 ${l.match}`, l.pick, c, l.reason);
});

// ---- V3.3 胆门禁 ----
((day.max7 && day.max7.legs) || []).forEach(l => {
  if (!l.key) return;
  const odds = parseFloat(l.odds) || 0;
  const isHome = /主胜/.test(l.pick || "") || (/让/.test(l.pick || "") && /主/.test(l.pick || ""));
  const isAway = /客胜/.test(l.pick || "");
  const m = matchOf(String(l.match || "").slice(0, 3));
  const lg = m ? m.league : null;
  if (lg && COLD_LEAGUES.has(lg)) {
    violations.push(`[胆] ${l.match} ${l.pick}@${l.odds}: 放弃清单联赛(${lg})不当胆`);
  }
  if (isAway && odds > 1.5) {
    violations.push(`[胆] ${l.match} 客场胆 SP ${odds} >1.5(客场胆须 ≤1.5 且双证)`);
  }
  if (isHome && odds > 1.35 && odds < 3) { // odds<3 排除解析异常
    violations.push(`[胆] ${l.match} 主场胆 SP ${odds} >1.35(主场胆须 ≤1.35)`);
  }
});

// ---- V3.3 北单门禁 ----
((day.beidan310 && day.beidan310.legs) || []).forEach(l => {
  const single = !String(l.pick).includes("/");
  const hcp = String(l.handicap == null ? "0" : l.handicap);
  if (single && hcp !== "0") {
    violations.push(`[北单] ${l.match} 单选 ${l.pick} 但让球 ${hcp}≠0(让球场一律双选: 让-1用3/1, 让+1用0/1)`);
  }
});

if (violations.length === 0) {
  console.log(`✓ ${day.date} 发布前门禁全部通过`);
  process.exit(0);
}
console.error(`✗ ${day.date} 发现 ${violations.length} 条违规:`);
violations.forEach(v => console.error("  - " + v));
console.error("处理: ★4+ 压 ★2 / 胆换场或降双选 / 北单单选改双选后重跑本脚本");
process.exit(1);
