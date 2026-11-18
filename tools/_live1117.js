/* 11-17 池比分盯梢: 15 场(国际赛 5 + 欧国联末轮 6 + U21×2 + 英锦赛 + CNL)
   ESPN 主通道(fifa.friendly / uefa.nations / eng.trophy; U21 欧青资格赛 ESPN 无稳定码走出奇兜底)+出奇比分兜底(26116 期 label)。
   注意: 竞彩场开球 11-18 03:45(北京), ESPN date=20261117(UTC 日); 智利场 07:00(北京 11-18)=ESPN 20261117。
   用法: node tools/_live1117.js [--probe] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills', 'football-result-collect', 'espn_score.js');
const probe = process.argv.includes('--probe');
const LEAGUES = {
  '周二001': 'fifa.friendly', '周二002': 'fifa.friendly', '周二003': 'fifa.friendly',
  '周二004': 'uefa.nations', '周二005': 'uefa.nations', '周二006': 'uefa.nations',
  '周二007': 'uefa.nations', '周二008': 'uefa.nations', '周二009': 'uefa.nations',
  '周二010': 'fifa.friendly',
  '北单004': 'fifa.friendly', '北单005': '', '北单006': '', '北单007': '', '北单008': 'eng.trophy'
};
const TEAM = {
  '新加坡': 'Singapore', '巴西': 'Brazil',
  '中国': 'China', '巴林': 'Bahrain',
  '日本': 'Japan', '巴拉圭': 'Paraguay',
  '波黑': 'Bosnia-Herzegovina', '罗马尼亚': 'Romania',
  '波兰': 'Poland', '瑞典': 'Sweden',
  '丹麦': 'Denmark', '挪威': 'Norway',
  '威尔士': 'Wales', '葡萄牙': 'Portugal',
  '匈牙利': 'Hungary', '北爱尔兰': 'Northern Ireland',
  '爱尔兰': 'Republic of Ireland', '科索沃': 'Kosovo',
  '智利': 'Chile', '哥伦比亚': 'Colombia',
  '卡塔尔': 'Qatar', '韩国': 'South Korea',
  '捷克U21': 'Czechia U21', '土耳其U21': 'Turkiye U21',
  '荷兰U21': 'Netherlands U21', '丹麦U21': 'Denmark U21',
  '爱尔兰U21': 'Republic of Ireland U21', '芬兰U21': 'Finland U21',
  '卢顿': 'Luton Town', '彼得堡联': 'Peterborough United'
};
const ESPN_DATE = {};
function runEspn(lg, date, home, away) {
  if (!lg) return null;
  try {
    const out = execSync(`node "${SKILL}" find ${lg} ${date} "${home}" "${away}"`, { encoding: 'utf8', timeout: 30000 });
    const m = out.match(/(\d+)\s*-\s*(\d+)/);
    if (/FULL_TIME|FT|FINAL/.test(out) && m) return { home: +m[1], away: +m[2] };
    return null;
  } catch (e) { return null; }
}
function cqSnap() {
  const p = path.join(__dirname, 'cq_1117.json');
  if (!fs.existsSync(p) || Date.now() - fs.statSync(p).mtimeMs > 3 * 3600e3) {
    try { execSync('node "' + path.join(__dirname, '_cq_fetch.js') + '" 1117', { timeout: 60000 }); } catch (e) {}
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).matches || []; } catch (e) { return []; }
}
function cqScore(mm) {
  const rows = cqSnap().filter(r => {
    if (String(r.status) !== '30') return false;
    const t = String(r.time || '');
    const dayOk = t.startsWith('2026-11-17') ? Number(t.slice(11, 13)) >= 12 : t.startsWith('2026-11-18') ? Number(t.slice(11, 13)) < 12 : false;
    if (!dayOk) return false;
    const sc = r.score || (r.hs != null && r.as != null ? r.hs + '-' + r.as : null);
    if (!sc || !/^\d+-\d+$/.test(String(sc))) return false;
    return String(r.label) === mm.id || (String(r.home).indexOf(mm.home) >= 0 && String(r.away).indexOf(mm.away) >= 0);
  });
  for (const r of rows) {
    const sc = r.score || (r.hs + '-' + r.as);
    return { home: +String(sc).split('-')[0], away: +String(sc).split('-')[1] };
  }
  return null;
}
function main() {
  const code = fs.readFileSync(file, 'utf8');
  const m = code.match(/^([\s\S]*?)(const PREDICTION_DAYS\s*=\s*)([\s\S]*?)(;\s*\n\s*if \(typeof module[\s\S]*)$/);
  if (!m) { console.error('parse failed'); process.exit(1); }
  const days = JSON.parse(m[3]), day = days.find(d => d.date === '2026-11-17');
  if (!day) { console.error('no day'); process.exit(1); }
  let filled = 0;
  for (const mm of day.matches) {
    if (mm.finalScore) continue;
    const lg = LEAGUES[mm.id];
    let sc = null;
    if (lg && TEAM[mm.home] && TEAM[mm.away]) sc = runEspn(lg, ESPN_DATE[mm.id] || '20261117', TEAM[mm.home], TEAM[mm.away]);
    if (!sc) sc = cqScore(mm);
    if (sc) { mm.finalScore = sc.home + '-' + sc.away; filled++; console.log(mm.id, mm.home, 'vs', mm.away, '=>', sc.home + '-' + sc.away); }
    else if (probe) console.log('[probe]', mm.id, mm.home, 'vs', mm.away);
  }
  if (filled) {
    fs.writeFileSync(file, m[1] + m[2] + JSON.stringify(days, null, 1) + m[4], 'utf8');
    console.log('✓ 回填 ' + filled + ' 场');
  } else console.log('无新赛果');
}
main();
