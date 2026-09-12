/* tools/_smoke_mini_score.js — 比分轮询 + 组串登记冒烟(node)
 * ① cart.calc 对 2026-09-12 真实 beidan310 8 腿: stakes=64, expectPayout≈291(±1)
 * ② detectSource: 全北单腿='bd', 混合='jc', 全亚盘='ah';
 *    buildLeg 亚盘水位: 主队命名取主水 / 客队命名取客水 / 别名容错(FC首尔≈首尔FC)
 * ③ scorePoller: 注入假 fetcher(英超样本 board 'Liverpool vs Fulham' STATUS_FULL_TIME 0-0),
 *    tick 后利物浦场 liveScore='0-0'; 韩职场(LEAGUE_MAP null 死链)finalScore 兜底标 MANUAL;
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
const mLiv = { id: '周六016', league: '英超', home: '利物浦', away: '富勒姆', finalScore: '0-0', liveScore: '', liveSt: '' };
const mKor = { id: '周六001', league: '韩职', home: '蔚山现代', away: '仁川联', finalScore: '2-1', liveScore: '', liveSt: '' };
const matches = [mLiv, mKor];
const board = {
  events: [{
    competitions: [{
      competitors: [
        { homeAway: 'home', team: { displayName: 'Liverpool' }, score: '0' },
        { homeAway: 'away', team: { displayName: 'Fulham' }, score: '0' },
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
  assert.strictEqual(mLiv.liveScore, '0-0', '利物浦场 liveScore 应为 0-0, 实际 ' + mLiv.liveScore);
  assert.strictEqual(mLiv.liveSt, 'STATUS_FULL_TIME', '利物浦场 liveSt 应为 STATUS_FULL_TIME');
  assert.strictEqual(mKor.liveScore, '2-1', '韩职场应 finalScore 兜底 2-1, 实际 ' + mKor.liveScore);
  assert.strictEqual(mKor.liveSt, 'MANUAL', '韩职场(LEAGUE_MAP null)应标 MANUAL');
  assert.strictEqual(updates, 1, 'onUpdate 应回调 1 次, 实际 ' + updates);
  // 幂等: 二次 tick 无变化不回调; 全部完场后不再发起请求(fetcher 断言兜底)
  const changed2 = await poller.tick();
  assert.strictEqual(changed2.length, 0, '二次 tick 应无变化');
  assert.strictEqual(updates, 1, '二次 tick 不应再回调 onUpdate');
  console.log('OK 3/4 scorePoller: 利物浦 0-0 完场 + 韩职 MANUAL 兜底 + 幂等');

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
