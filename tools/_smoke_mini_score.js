/* tools/_smoke_mini_score.js — 比分轮询 + 组串登记冒烟(node)
 * ① cart.calc 对 2026-09-12 历史 beidan310 8 腿: stakes=64, expectPayout≈291(±1)
 * ② detectSource: 全北单腿='bd', 混合='jc', 全亚盘='ah';
 *    buildLeg 亚盘水位: 主队命名取主水 / 客队命名取客水 / 别名容错(FC首尔≈首尔FC)
 * ③ scorePoller: 样本队名动态取日抛 espn.TEAM_MAP 首两条(不写死, 参照 _smoke_mini_api.js),
 *    注入假 fetcher(STATUS_FULL_TIME 0-0), tick 后样本场 liveScore='0-0';
 *    死链联赛场(LEAGUE_MAP 静态表显式 null)finalScore 兜底标 MANUAL;
 *    二次 tick 幂等(无变化不回调, 完场后不再请求)
 * ④ buildLeg jcHad/jcHhad(sp=null 容错 + 让球文本) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'data/predictions.js'), 'utf8');
const days = new Function(src + ';return PREDICTION_DAYS;')();
const payload = days.find((d) => d.date === '2026-09-12');
assert(payload, '未找到 2026-09-12 数据');

const cart = require('../miniprogram/utils/cart.js');
const espn = require('../miniprogram/utils/espn.js');
const { createScorePoller } = require('../miniprogram/utils/scorePoller.js');

// ---- ① cart.calc: 9-12 北单 8 腿 ----
const bdLegs = payload.beidan310.legs.map((l) => cart.buildLeg(l, 'bd'));
const c = cart.calc(bdLegs);
assert.strictEqual(c.stakes, 64, '8 腿(2单6双)复式注数应为 64, 实际 ' + c.stakes);
assert(Math.abs(c.expectPayout - 291) <= 1, '理论奖金应≈291, 实际 ' + c.expectPayout);
console.log('OK 1/4 cart.calc: stakes=' + c.stakes + ' expectPayout=' + c.expectPayout + '(≈291)');

// ---- ② detectSource + buildLeg 亚盘水位 ----
assert.strictEqual(cart.detectSource(bdLegs), 'bd', '全北单腿应=bd');
const m8 = payload.matches.find((m) => m.id === '周六008');
const mixed = bdLegs.concat([cart.buildLeg(m8, 'jcHad')]);
assert.strictEqual(cart.detectSource(mixed), 'jc', '北单+竞彩混合应=jc');
assert.strictEqual(cart.detectSource([cart.buildLeg(m8, 'ah')]), 'ah', '全亚盘腿应=ah');
// 008 美因茨-0.5: 命名队=主队 → 主水 0.86 → 1.86
assert.strictEqual(cart.buildLeg(m8, 'ah').odds, '1.86', '美因茨-0.5 应取主水 0.86→1.86');
// 016 富勒姆+1.25: 命名队=客队 → 客水 0.84 → 1.84
const m16 = payload.matches.find((m) => m.id === '周六016');
assert.strictEqual(cart.buildLeg(m16, 'ah').odds, '1.84', '富勒姆+1.25 应取客水 0.84→1.84');
// 002 FC首尔-0.25: 别名容错(FC首尔≈客队首尔FC) → 客水 1.03 → 2.03
const m2 = payload.matches.find((m) => m.id === '周六002');
assert.strictEqual(cart.buildLeg(m2, 'ah').odds, '2.03', 'FC首尔-0.25 别名应取客水 1.03→2.03');
console.log('OK 2/4 detectSource(bd/jc/ah) + 亚盘水位(主/客/别名) 全对');

// ---- ③ scorePoller ----
// TEAM_MAP 是日抛生成数据(gen_mini_espn 每日重生成), 不写死队名: 动态取首两条造样本。
// 样本场 id 用非"周Xnnn"形态, 永不撞 MATCH_LEAGUES 日抛注册表; league 走 LEAGUE_MAP 静态表。
const cnTeams = Object.keys(espn.TEAM_MAP);
assert(cnTeams.length >= 2, 'TEAM_MAP 应至少 2 条(当日生成产物), 实际 ' + cnTeams.length);
const homeCn = cnTeams[0], awayCn = cnTeams[1];
const mLiv = { id: 'TEST-LIVE', league: '英超', home: homeCn, away: awayCn, finalScore: '0-0', liveScore: '', liveSt: '' };
const mKor = { id: 'TEST-DEAD', league: '韩职', home: '甲队', away: '乙队', finalScore: '2-1', liveScore: '', liveSt: '' };
const matches = [mLiv, mKor];
const board = {
  events: [{
    competitions: [{
      competitors: [
        { homeAway: 'home', team: { displayName: espn.TEAM_MAP[homeCn] }, score: '0' },
        { homeAway: 'away', team: { displayName: espn.TEAM_MAP[awayCn] }, score: '0' },
      ],
    }],
    status: { type: { name: 'STATUS_FULL_TIME' } },
  }],
};
const fetcher = async (url) => {
  assert(url.indexOf('eng.1') !== -1, '只应请求英超(eng.1), 实际: ' + url);
  return { ok: true, status: 200, json: async () => board };
};
let updates = 0;
const poller = createScorePoller({
  getMatches: () => matches,
  onUpdate: () => { updates++; },
  fetcher,
});

(async () => {
  const changed = await poller.tick();
  assert.strictEqual(changed.length, 2, '首轮 tick 应有 2 场变化, 实际 ' + changed.length);
  assert.strictEqual(mLiv.liveScore, '0-0', homeCn + '场 liveScore 应为 0-0, 实际 ' + mLiv.liveScore);
  assert.strictEqual(mLiv.liveSt, 'STATUS_FULL_TIME', homeCn + '场 liveSt 应为 STATUS_FULL_TIME');
  assert.strictEqual(mKor.liveScore, '2-1', '死链联赛场应 finalScore 兜底 2-1, 实际 ' + mKor.liveScore);
  assert.strictEqual(mKor.liveSt, 'MANUAL', '韩职场(LEAGUE_MAP null)应标 MANUAL');
  assert.strictEqual(updates, 1, 'onUpdate 应回调 1 次, 实际 ' + updates);
  // 幂等: 二次 tick 无变化不回调; 全部完场后不再发起请求(fetcher 断言兜底)
  const changed2 = await poller.tick();
  assert.strictEqual(changed2.length, 0, '二次 tick 应无变化');
  assert.strictEqual(updates, 1, '二次 tick 不应再回调 onUpdate');
  console.log('OK 3/4 scorePoller: ' + homeCn + ' 0-0 完场 + 韩职 MANUAL 兜底 + 幂等');

  // ---- ④ buildLeg jcHad / jcHhad ----
  const leg8 = cart.buildLeg(m8, 'jcHad'); // direction=主胜, sp=null 容错
  assert.strictEqual(leg8.pick, '3', '008 direction=主胜 默认腿应为 3');
  assert.strictEqual(leg8.odds, '', '008 sp=null 时 odds 应留空不炸');
  const leg8h = cart.buildLeg(m8, 'jcHhad'); // spHandicap=-1, hhad=[1.98,3.55,2.92]
  assert.strictEqual(leg8h.pick, '让-1 3', '让球腿 pick 应含让球文本, 实际 ' + leg8h.pick);
  assert.strictEqual(leg8h.odds, '1.98', '让球腿 odds 应取 hhad[0]=1.98');
  const c2 = cart.calc([leg8h, cart.buildLeg(m8, 'jcHad')]);
  assert.strictEqual(c2.stakes, 1, '两个单选腿注数应为 1');
  console.log('OK 4/4 buildLeg jcHad/jcHhad(sp=null 容错 + 让球文本)');

  console.log('\nSMOKE_OK');
})().catch((e) => {
  console.error('SMOKE FAIL:', e && e.stack ? e.stack : e);
  process.exit(1);
});
