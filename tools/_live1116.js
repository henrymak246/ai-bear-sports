/* 11-16 池比分盯梢: 11 场(欧国联末轮8 + U21/西乙/CNL 3)
   ESPN 主通道(uefa.nations / esp.2 / concacaf.nations.league; U21 欧青附加赛 ESPN 无码走出奇兜底)+出奇比分兜底(26115 期 label)。
   用法: node tools/_live1116.js [--probe] */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const SKILL = path.join(process.env.HOME || process.env.USERPROFILE, '.agents', 'skills', 'football-result-collect', 'espn_score.js');
const probe = process.argv.includes('--probe');
const LEAGUES = {
  '周一001': 'uefa.nations', '周一002': 'uefa.nations', '周一003': 'uefa.nations', '周一004': 'uefa.nations',
  '周一005': 'uefa.nations', '周一006': 'uefa.nations', '周一007': 'uefa.nations', '周一008': 'uefa.nations',
  '北单105': '', '北单106': 'esp.2', '北单111': 'concacaf.nations.league'
};
const TEAM = {
  '法罗群岛': 'Faroe Islands', '摩尔多瓦': 'Moldova',
  '哈萨克斯坦': 'Kazakhstan', '斯洛伐克': 'Slovakia',
  '爱沙尼亚': 'Estonia', '保加利亚': 'Bulgaria',
  '冰岛': 'Iceland', '卢森堡': 'Luxembourg',
  '瑞士': 'Switzerland', '苏格兰': 'Scotland',
  '德国': 'Germany', '荷兰': 'Netherlands',
  '北马其顿': 'North Macedonia', '斯洛文尼亚': 'Slovenia',
  '希腊': 'Greece', '塞尔维亚': 'Serbia',
  '希腊U21': 'Greece U21', '冰岛U21': 'Iceland U21',
  '阿尔瓦塞特': 'Albacete', '塞尔塔B队': 'Celta Vigo B',
  '加拿大': 'Canada', '危地马拉': 'Guatemala'
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
  const p = path.join(__dirname, 'cq_1116.json');
  if (!fs.existsSync(p) || Date.now() - fs.statSync(p).mtimeMs > 3 * 3600e3) {
    try { execSync('node "' + path.join(__dirname, '_cq_fetch.js') + '" 1116', { timeout: 60000 }); } catch (e) {}
  }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).matches || []; } catch (e) { return []; }
}
function cqScore(mm) {
  const rows = cqSnap().filter(r => {
    if (String(r.status) !== '30') return false;
    const t = String(r.time || '');
    const dayOk = t.startsWith('2026-11-16') ? Number(t.slice(11, 13)) >= 12 : t.startsWith('2026-11-17') ? Number(t.slice(11, 13)) < 12 : false;
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
  const days = JSON.parse(m[3]), day = days.find(d => d.date === '2026-11-16');
  if (!day) { console.error('no day'); process.exit(1); }
  let filled = 0;
  for (const mm of day.matches) {
    if (mm.finalScore) continue;
    const lg = LEAGUES[mm.id];
    let sc = null;
    if (lg && TEAM[mm.home] && TEAM[mm.away]) sc = runEspn(lg, ESPN_DATE[mm.id] || '20261116', TEAM[mm.home], TEAM[mm.away]);
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
