/* 11-10 池比分盯梢: 英锦标赛 12 场(北单001-012 + 竞彩周二001/002)
   ESPN 主通道(eng.trophy, 赛日 20261110 UTC)+出奇比分兜底(北单/竞彩 label 双匹配)。
   用法: node tools/_live1110.js [--probe] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills', 'football-result-collect', 'espn_score.js');
const probe = process.argv.includes('--probe');
const LEAGUES = {
  '北单001': 'eng.trophy', '北单002': 'eng.trophy', '周二001': 'eng.trophy', '北单004': 'eng.trophy',
  '北单005': 'eng.trophy', '北单006': 'eng.trophy', '北单007': 'eng.trophy', '北单008': 'eng.trophy',
  '北单009': 'eng.trophy', '北单010': 'eng.trophy', '北单011': 'eng.trophy', '周二002': 'eng.trophy'
};
const TEAM = {
  '巴尼特': 'Barnet', '莱顿东方': 'Leyton Orient', '布里斯托尔流浪者': 'Bristol Rovers', '雷丁': 'Reading',
  '伯顿': 'Burton', '诺茨郡': 'Notts County', '克鲁': 'Crewe', '维冈竞技': 'Wigan',
  '莱斯特城': 'Leicester', '沃尔索尔': 'Walsall', '曼斯菲尔德': 'Mansfield', '切斯特菲尔德': 'Chesterfield',
  '北安普顿': 'Northampton', '吉林汉姆': 'Gillingham', '牛津联': 'Oxford United', '切尔滕汉姆': 'Cheltenham',
  '普利茅斯': 'Plymouth', '斯文登': 'Swindon', '斯托克波特郡': 'Stockport', '特兰米尔流浪者': 'Tranmere',
  '布拉德福德城': 'Bradford', '约克城': 'York', '布罗姆利': 'Bromley', '米尔顿凯恩斯': 'Milton Keynes'
};
function runEspn(lg, home, away) {
  try {
    const out = execSync(`node "${SKILL}" find ${lg} 20261110 "${home}" "${away}"`, { encoding: 'utf8', timeout: 30000 });
    const m = out.match(/(\d+)\s*-\s*(\d+)/);
    if (/FULL_TIME|FT/.test(out) && m) return { home: +m[1], away: +m[2] };
    return null;
  } catch (e) { return null; }
}
function cqSnap() {
  const p = path.join(__dirname, 'cq_1110.json');
  if (!fs.existsSync(p) || Date.now() - fs.statSync(p).mtimeMs > 3 * 3600e3) {
    try { execSync('node "' + path.join(__dirname, '_cq_fetch.js') + '" 1110', { timeout: 60000 }); } catch (e) {}
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).matches || []; } catch (e) { return []; }
}
function cqScore(mm) {
  const rows = cqSnap().filter(r => {
    if (String(r.status) !== '30') return false;
    // 只认本场开球窗口(北京 11-11 00:00-05:59), 防止历史同队/跨期撞号误判
    const t = String(r.time || '');
    if (!t.startsWith('2026-11-11')) return false;
    const hh = Number(t.slice(11, 13));
    if (!(hh >= 0 && hh < 6)) return false;
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
  const days = JSON.parse(m[3]), day = days.find(d => d.date === '2026-11-10');
  if (!day) { console.error('no day'); process.exit(1); }
  let filled = 0;
  for (const mm of day.matches) {
    if (mm.finalScore) continue;
    const lg = LEAGUES[mm.id];
    let sc = null;
    if (lg && TEAM[mm.home] && TEAM[mm.away]) sc = runEspn(lg, TEAM[mm.home], TEAM[mm.away]);
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
