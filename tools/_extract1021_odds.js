/* 从出奇快照(cq_1020.json)+盘口全量表(_cq_odds_raw_1020b.json)提取今晚(10-21 凌晨)场次的
   欧赔 1x2 / 亚盘 ah / 大小 ou 主盘(澳彩→365→伟德, 即时→初盘)。只打印不写。 */
'use strict';
const fs = require('fs'), path = require('path');

const cq = JSON.parse(fs.readFileSync(path.join(__dirname, 'cq_1020.json'), 'utf8'));
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '_cq_odds_raw_1020b.json'), 'utf8'));
const d = raw.data;
const SUP_ORDER = [2, 5, 26];
const SUP_NAME = { 2: '澳彩', 5: '365', 26: '伟德' };
const NAME = { 0: '平手', 0.25: '平手/半球', 0.5: '半球', 0.75: '半球/一球', 1: '一球', 1.25: '一球/球半', 1.5: '球半', 1.75: '球半/两球', 2: '两球', 2.25: '两球/两球半', 2.5: '两球半', 2.75: '两球半/三球', 3: '三球', 3.25: '三球/三球半', 3.5: '三球半', 3.75: '三球半/四球', 4: '四球' };
const lineName = h => h === 0 ? '平手' : (h > 0 ? (NAME[Math.abs(h)] || Math.abs(h) + '球') : '受' + (NAME[Math.abs(h)] || Math.abs(h) + '球'));

// eventId 映射
const evOfBd = {}, evOfLabel = {}, evOfPair = {};
for (const m of cq.matches) {
  if (m.lottery === '北单') evOfBd[Number(m.number)] = m.eventId;
  if (m.lottery === '竞彩' && m.label) evOfLabel[m.label] = m.eventId;
  evOfPair[m.home + '|' + m.away] = m.eventId;
}

// oddsId 索引
const oneX2ById = {}, ahById = {}, ouById = {};
for (const r of d['odds.1x2'].data) (oneX2ById[r[0]] = oneX2ById[r[0]] || []).push(r);
for (const r of d['odds.ah'].data) (ahById[r[0]] = ahById[r[0]] || []).push(r);
for (const r of d['odds.ou'].data) (ouById[r[0]] = ouById[r[0]] || []).push(r);
const byEvent = {};
for (const r of d.odds.data) {
  if (SUP_ORDER.includes(r[4])) {
    (byEvent[r[3]] = byEvent[r[3]] || {});
    (byEvent[r[3]][r[4]] = byEvent[r[3]][r[4]] || []).push(r[0]);
  }
}
function pick(eventId, poolById, selMain) {
  const supMap = byEvent[eventId] || {};
  for (const sup of SUP_ORDER) {
    const rows = [];
    for (const id of supMap[sup] || []) for (const a of poolById[id] || []) rows.push(a);
    if (!rows.length) continue;
    const sel = mask => rows.filter(a => (a[4] & ~1) === mask && (a[4] & 1) === 0);
    const cur = sel(0x110), ini = sel(0x130);
    const pickRows = cur.length ? cur : ini;
    if (pickRows.length) {
      const a = pickRows[pickRows.length - 1];
      return { a, tag: (cur.length ? '即时' : '初盘') + '(' + SUP_NAME[sup] + ')' };
    }
  }
  return null;
}

// 今晚竞彩 8 场 + 北单深夜候选
const TARGETS = [
  { id: '周二001', home: '费内巴切', away: '斯拉维亚' },
  { id: '周二002', home: '萨巴赫', away: '多特蒙德' },
  { id: '周二003', home: '伍尔弗', away: '朴次茅斯' },
  { id: '周二004', home: '那不勒斯', away: '博德闪耀' },
  { id: '周二006', home: '巴黎圣曼', away: '巴萨' },
  { id: '周二007', home: '利物浦', away: '比利亚雷' },
  { id: '周二009', home: '斯图加特', away: '马竞' },
  { id: '周二010', home: '波尔图', away: '埃因霍温' },
  { id: '北单003', home: '北雪平', away: '厄勒布鲁' },
  { id: '北单028', home: '巴黎圣日耳曼', away: '巴塞罗那' },
  { id: '北单029', home: '利物浦', away: '比利亚雷亚尔' },
  { id: '北单030', home: '曼彻斯特城', away: '雅典AEK' },
  { id: '北单031', home: '罗马', away: '布拉迪斯拉发' },
  { id: '北单032', home: '波尔图', away: 'PSV埃因霍温' },
  { id: '北单033', home: '那不勒斯', away: '博德闪耀' },
  { id: '北单034', home: '斯图加特', away: '马德里竞技' },
];
for (const t of TARGETS) {
  const bdNum = Number(String(t.id).replace('北单', ''));
  const ev = String(t.id).startsWith('北单') ? evOfBd[bdNum] : (evOfLabel[t.id] || evOfPair[t.home + '|' + t.away]);
  if (!ev) { console.log(t.id, t.home, 'vs', t.away, '→ 无 eventId'); continue; }
  const p1 = pick(ev, oneX2ById);
  const pah = pick(ev, ahById);
  const pou = pick(ev, ouById);
  const f = (p, n) => p ? `${p.tag} ${p.a.slice(1, n + 1).map((x, i) => (i === 0 ? (x > 0 ? (x >= 1 ? x.toFixed(2) : (x + 1).toFixed(2)) : x) : x)).join('/')}` : '无';
  console.log(`${t.id} ${t.home} vs ${t.away} [ev=${ev}]`);
  if (p1) console.log(`  欧赔: ${p1.tag} 主${p1.a[1]} 平${p1.a[2]} 客${p1.a[3]}`);
  if (pah) console.log(`  亚盘: ${pah.tag} ${lineName(pah.a[1])} 主${(1 + pah.a[2]).toFixed(2)}/客${(1 + pah.a[3]).toFixed(2)}`);
  if (pou) console.log(`  大小: ${pou.tag} ${pou.a[1]} 大${pou.a[2]} 小${pou.a[3]}`);
}
