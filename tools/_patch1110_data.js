/* tools/_patch1110_data.js — 11-10 池数据补全(幂等)
   1) 大小盘: 用 _cq_odds_snap_1110_2108.json 澳彩大小盘回填 match.ouOdds, 并把 ouPick 对齐真实盘口线
   2) 串关: ou2 两腿、slot8 深夜票两条大小腿的赔率/选项/总倍数, asian7 总倍数
   3) 梦想7关: 北单让球SP口径 7 关展示票(不投注)
   4) 盘路: 按最新 17 个快照的判读重写 4 场旧 note, 并给每场异动写具体建议
   用法: node tools/_patch1110_data.js [--dry-run] */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'data', 'predictions.js');
const days = require(file);
const day = days.find(d => d.date === '2026-11-10');
if (!day) throw new Error('无 2026-11-10 数据');

// ---- 1. 大小盘(澳彩, 出奇 21:08 快照; 数值已人工核对 12/12) ----
const OU = {
  '北单001': { total: 3.25, over: 1.88, under: 1.84 },
  '北单002': { total: 3.25, over: 1.92, under: 1.80 },
  '周二001': { total: 3.00, over: 1.82, under: 1.90 },
  '北单004': { total: 2.75, over: 1.88, under: 1.84 },
  '北单005': { total: 4.00, over: 1.77, under: 1.95 },
  '北单006': { total: 3.25, over: 1.82, under: 1.90 },
  '北单007': { total: 2.50, over: 1.77, under: 1.95 },
  '北单008': { total: 3.50, over: 1.88, under: 1.84 },
  '北单009': { total: 3.50, over: 1.94, under: 1.78 },
  '北单010': { total: 3.50, over: 1.90, under: 1.82 },
  '北单011': { total: 3.25, over: 1.82, under: 1.90 },
  '周二002': { total: 3.25, over: 1.93, under: 1.79 }
};

let changed = 0;
day.matches.forEach(m => {
  const ou = OU[m.id];
  if (!ou) throw new Error('缺大小盘数据: ' + m.id);
  m.ouOdds = { goals: String(ou.total), name: String(ou.total), over: ou.over.toFixed(2), under: ou.under.toFixed(2) };
  // 方向沿用建日判断(大/小), 盘口线改成真实线, 不再写 2.5
  const dir = String(m.ouPick || '').slice(0, 1);
  if (dir !== '大' && dir !== '小') throw new Error('ouPick 方向异常: ' + m.id + ' ' + m.ouPick);
  const want = dir + ou.total;
  if (m.ouPick !== want) { m.ouPick = want; changed++; }
  m.ouConf = 1;
});

// ---- 2. 串关赔率 ----
const byId = Object.fromEntries(day.matches.map(m => [m.id, m]));
function legOdds(id) {
  const m = byId[id], ou = OU[id];
  return String(m.ouPick).startsWith('大') ? ou.over.toFixed(2) : ou.under.toFixed(2);
}
day.ou2.legs.forEach(leg => {
  const id = Object.keys(byId).find(k => leg.match.indexOf(byId[k].home) >= 0);
  if (!id) throw new Error('ou2 腿无法匹配: ' + leg.match);
  leg.pick = byId[id].ouPick;
  leg.odds = legOdds(id);
  leg.reason = (id === '北单005'
    ? '英甲对英乙攻强, 但澳彩已开 4 球深盘, 追大成本高, 只作 1 元小注。'
    : '主队已出线轮换、客队客场保守, 3.25 球低战意盘取小。');
  changed++;
});
day.ou2.note = '大小 2 串(各 1 元): 005 大4 @1.77 + 011 小3.25 @1.90, 名义约 3.36 倍; 005 盘口已升到 4 球, 只小注不追加。';

day.slot8.late.asian.legs.forEach(leg => {
  if (leg.play !== '大小球') return;
  const id = (leg.id && byId[leg.id]) ? leg.id : Object.keys(byId).find(k => leg.match.indexOf(byId[k].home) >= 0);
  if (!id) throw new Error('slot8 大小腿无法匹配: ' + leg.match);
  leg.pick = byId[id].ouPick;
  leg.odds = legOdds(id);
  changed++;
});
const asianLegs = day.slot8.late.asian.legs.filter(l => l.play !== '大小球');
const overLegs = day.slot8.late.asian.legs.filter(l => l.play === '大小球');
const asianProd = asianLegs.reduce((p, l) => p * Number(l.odds), 1);
const ouProd = overLegs.reduce((p, l) => p * Number(l.odds), 1);
day.slot8.late.asian.totalOdds = (asianProd * ouProd).toFixed(1);
day.slot8.late.asian.legs.forEach(l => { if (!(Number(l.odds) > 1)) throw new Error('slot8 腿赔率异常: ' + l.match); });

const a7Prod = day.asian7.legs.reduce((p, l) => p * Number(l.odds), 1);
day.asian7.totalOdds = '约' + a7Prod.toFixed(1) + '倍';
day.asian7.note = day.asian7.note.replace(/盘口与水位待出奇补齐后复核/, '澳彩初盘水位已补(09:08), 赛前复核');

// ---- 3. 梦想7关(北单让球SP口径, 展示票) ----
const D7 = [
  { id: '北单002', pick: '雷丁 客胜(让0)', sp: 1.83, reason: '雷丁英甲第6必须取胜, 布流浪防守漏。' },
  { id: '北单006', pick: '切斯特菲尔德 客胜(让0)', sp: 2.84, reason: '主队0分已淘汰, 客队4分需胜。' },
  { id: '北单007', pick: '吉林汉姆 客胜(让0)', sp: 3.14, reason: '主队垫底已淘汰, 客队状态战意双优。' },
  { id: '北单008', pick: '牛津联 让球主胜(-2)', sp: 1.21, reason: '英甲第3对英乙第5, 深盘只作展示。' },
  { id: '北单009', pick: '普利茅斯 让球主胜(-1)', sp: 1.42, reason: '主队争头名, 客队0分已淘汰。' },
  { id: '北单010', pick: '斯托克波特 让球主胜(-1)', sp: 1.36, reason: '英甲第2主场, 但已出线会轮换。' },
  { id: '北单011', pick: '布拉德福德 让球主胜(-1)', sp: 1.74, reason: '主队已出线轮换, 约克城需胜, 让1球是上限。' }
];
const d7Prod = D7.reduce((p, l) => p * l.sp, 1);
day.dream7 = {
  totalOdds: '约' + d7Prod.toFixed(1) + '倍',
  result: null,
  legs: D7.map(l => {
    const m = byId[l.id];
    return { league: m.league, match: l.id + ' ' + m.home + ' vs ' + m.away, pick: l.pick, odds: l.sp.toFixed(2), reason: l.reason, result: null, finalScore: null };
  }),
  note: '本日竞彩只开 2 场, 凑不出竞彩 7 关, 改用北单让球SP 7 关展示; 北单 SP 为浮动值, 以出票为准, 只展示不投注。'
};

// ---- 4. 盘路 note 重写 + 具体建议 ----
const MOVES = {
  '北单001': { note: '盘路: 平手盘主水 1.85→1.80=资金站主队, 与主不败同向。', advice: '亚盘可跟巴尼特0(1.80); 方向主不败维持' },
  '北单002': { note: '盘路: 受半球→受半/一且主水 1.86→1.95=真冷, 上盘(布流浪)被资金抛弃; 客队雷丁一侧受支持。', advice: '亚盘弃布流浪, 雷丁-0.75 可跟; 客不败同向' },
  '周二001': { note: '盘路: 平/半退平手且主水 1.97→1.86=资金反向下盘(诺茨郡受让), 与主胜方向反向。', advice: '亚盘撤伯顿-0.25/改平手; 主胜信心下调' },
  '北单005': { note: '盘路: 球半/两球升两球且主水 1.93→1.97=诱上盘, 主队大胜不可信, 深让不追穿。', advice: '弃莱斯特让球上盘; 方向主胜保留' },
  '北单006': { note: '盘路: 平/半升半球且主水 1.91→1.79=真热上盘, 资金实入曼斯菲尔德, 与客不败方向相反。', advice: '亚盘撤切斯特菲尔德+0.25; 客不败只留方向' },
  '北单007': { note: '盘路: 半球退平/半且主水 1.98→1.92=资金反向下盘, 吉林汉姆受让一侧得利。', advice: '亚盘跟吉林汉姆+0.25; 客不败同向' },
  '北单008': { note: '盘路: 两球盘稳、主水 2.01→1.92=资金站主队(牛津联), 但让 2 球属深盘。', advice: '方向主胜维持; 让球盘太深只展示' },
  '北单010': { note: '盘路: 一/球半升球半且主水 1.83→1.89=诱上盘, 盘口虚抬水位不配合, 主队大胜不可信。', advice: '弃斯托克波特让球上盘; 防平, 方向只留主不败' },
  '北单011': { note: '盘路: 半/一升一球且主水 1.98→1.92=真热上盘, 资金实入布拉德福德。', advice: '亚盘跟布拉德福德-1(1.92); 主不败同向' },
  '周二002': { note: '盘路: 受半球退受一球且主水 1.98→1.81=资金反向下盘, 布罗姆利受让一侧获资金, 与客胜方向反向。', advice: '米尔顿-1 撤/降信心; 客不败含平保留' }
};
Object.keys(MOVES).forEach(id => {
  const m = byId[id];
  if (!m) throw new Error('盘路场次不存在: ' + id);
  if (!m.ahMoves || !m.ahMoves.verdict || m.ahMoves.verdict.indexOf('无明显') === 0) throw new Error('无盘路信号: ' + id);
  m.ahMoves.advice = MOVES[id].advice;
  // 清掉旧的「盘路: ...」尾巴再写入新判读(幂等)
  m.note = String(m.note || '').replace(/\s*盘路:[\s\S]*$/, '').trim() + ' ' + MOVES[id].note;
});

// ---- 5. 方案文案同步 ----
const pa = day.plan.find(p => p.name.indexOf('亚洲让球') >= 0);
if (pa) pa.text = 'asian7 4关约12.8倍: 巴尼特0(1.87) / 克鲁-0.25(1.92) / 切斯特菲尔德+0.25(1.87) / 米尔顿凯恩斯-0.5(1.90); 澳彩初盘09:08, 赛前三小时复核水位。 ⚠️盘路: 006 资金进主队(反向) + 012 资金进布罗姆利受让(反向), 这两腿赛前 02:00 复核, 反向确认则撤腿只保留 2 关。';
const po = day.plan.find(p => p.name.indexOf('大小盘') >= 0);
if (po) po.text = '大小 2 串: 005 莱斯特场大4 @1.77 + 011 布拉德福德场小3.25 @1.90, 名义约 3.36 倍。澳彩大小盘已补(21:08); 005 盘口从 2.5 升到 4 球, 追大成本偏高, 只 1 元小注。';
const ps = day.plan.find(p => p.name.indexOf('胜平负') >= 0);
if (ps) ps.text = ps.text.replace(/\s*盘路已入:[\s\S]*$/, '') + ' 盘路已入: 001 站主队/002 弃主队上盘/003 反向(客)/005 诱上盘/006 反向(主)/007 站客队/008 站主队/010 诱上盘/011 站主队/012 反向(受让主队); 具体建议见「盘口异动雷达」。';

// ---- 自检 ----
day.matches.forEach(m => {
  if (!m.ouOdds || m.ouOdds.name === '待补') throw new Error('ouOdds 未补: ' + m.id);
  if (!/^[大小]\d/.test(m.ouPick)) throw new Error('ouPick 未对齐盘口: ' + m.id + ' ' + m.ouPick);
});
if (day.slot8.late.asian.legs.some(l => l.odds === '—' || l.odds === '待补')) throw new Error('slot8 仍有待补赔率');

console.log('修改 ' + changed + ' 处 | asian7 ' + day.asian7.totalOdds + ' | slot8深夜 ' + day.slot8.late.asian.totalOdds + '倍 | 大小2串 ' + (Number(legOdds('北单005')) * Number(legOdds('北单011'))).toFixed(2) + ' | 梦想7关 ' + day.dream7.totalOdds);
if (process.argv.includes('--dry-run')) { console.log('DRY 不写盘'); process.exit(0); }
const head = fs.readFileSync(file, 'utf8').split('const PREDICTION_DAYS')[0];
let json = JSON.stringify(days, null, 2);
json = json.split('\n').map(x => (x.startsWith('  ') ? x.slice(2) : x)).join('\n').replace(/\n\]$/, '];');
const footer = '\n\nif (typeof module !== "undefined" && module.exports) { module.exports = PREDICTION_DAYS; }\n';
fs.writeFileSync(file, head + 'const PREDICTION_DAYS = ' + json + footer, 'utf8');
console.log('✓ 已写回 data/predictions.js');
