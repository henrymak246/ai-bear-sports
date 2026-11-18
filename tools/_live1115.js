/* 11-15 池比分盯梢: 15 场(日联赛杯4 + 荷乙1 + 欧国联5 + 芬兰让球场 + 西乙3 + 欧国联C白俄罗斯)
   ESPN 主通道(ned.2 / uefa.nations / esp.2; 日联赛杯 ESPN 无赛事码 400=走出奇兜底)+出奇比分兜底(26117 期 label)。
   用法: node tools/_live1115.js [--probe] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills', 'football-result-collect', 'espn_score.js');
const probe = process.argv.includes('--probe');
const LEAGUES = {
  '周日001': '', '周日002': '', '周日003': '', '周日004': '',
  '周日005': 'ned.2',
  '周日006': 'uefa.nations', '周日007': 'uefa.nations', '周日008': 'uefa.nations', '周日009': 'uefa.nations',
  '周日010': 'uefa.nations', '周日011': 'uefa.nations',
  '北单088': 'esp.2', '北单092': 'esp.2', '北单094': 'uefa.nations', '北单095': 'esp.2'
};
const TEAM = {
  '町田泽维亚': 'Machida Zelvia', '神户胜利船': 'Vissel Kobe',
  '鹿岛鹿角': 'Kashima Antlers', '横滨水手': 'Yokohama F. Marinos',
  '大阪樱花': 'Cerezo Osaka', '浦和红钻': 'Urawa Red Diamonds',
  '柏太阳神': 'Kashiwa Reysol', '川崎前锋': 'Kawasaki Frontale',
  '马斯特里赫特': 'MVV Maastricht', '维特斯': 'Vitesse',
  '拉脱维亚': 'Latvia', '亚美尼亚': 'Armenia', '塞浦路斯': 'Cyprus', '黑山': 'Montenegro',
  '芬兰': 'Finland', '圣马力诺': 'San Marino',
  '克罗地亚': 'Croatia', '捷克': 'Czechia', '西班牙': 'Spain', '英格兰': 'England',
  '比利时': 'Belgium', '意大利': 'Italy',
  '特内里费': 'Tenerife', '休达': 'Ceuta',
  '格拉纳达': 'Granada', '拉斯帕尔马斯': 'Las Palmas',
  '白俄罗斯': 'Belarus', '阿尔巴尼亚': 'Albania',
  '埃瓦尔': 'Eibar', '加的斯': 'Cádiz'
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
  const p = path.join(__dirname, 'cq_1115.json');
  if (!fs.existsSync(p) || Date.now() - fs.statSync(p).mtimeMs > 3 * 3600e3) {
    try { execSync('node "' + path.join(__dirname, '_cq_fetch.js') + '" 1115', { timeout: 60000 }); } catch (e) {}
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).matches || []; } catch (e) { return []; }
}
function cqScore(mm) {
  const rows = cqSnap().filter(r => {
    if (String(r.status) !== '30') return false;
    const t = String(r.time || '');
    const dayOk = t.startsWith('2026-11-15') ? Number(t.slice(11, 13)) >= 12 : t.startsWith('2026-11-16') ? Number(t.slice(11, 13)) < 12 : false;
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
  const days = JSON.parse(m[3]), day = days.find(d => d.date === '2026-11-15');
  if (!day) { console.error('no day'); process.exit(1); }
  let filled = 0;
  for (const mm of day.matches) {
    if (mm.finalScore) continue;
    const lg = LEAGUES[mm.id];
    let sc = null;
    if (lg && TEAM[mm.home] && TEAM[mm.away]) sc = runEspn(lg, ESPN_DATE[mm.id] || '20261115', TEAM[mm.home], TEAM[mm.away]);
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
