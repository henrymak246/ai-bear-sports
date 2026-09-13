/* 小程序模拟器集成验收 v2(逐步容错版): 每步 try/catch+计时, 单步失败不拖垮全局。
 * 产出: tools/_mini_shots/*.png + 逐步日志。 */
const path = require('path');
const fs = require('fs');
const automator = require('miniprogram-automator');

const PROJECT = path.resolve(__dirname, '../miniprogram');
const SHOTS = path.resolve(__dirname, '_mini_shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function step(name, fn) {
  try {
    const t0 = Date.now();
    const r = await fn();
    let s = '';
    if (r !== undefined) { try { s = String(JSON.stringify(r)).slice(0, 220); } catch (e) { s = '(unprintable)'; } }
    console.log('[OK]', name, (Date.now() - t0) + 'ms', s);
    return r;
  } catch (e) {
    console.log('[SKIP/FAIL]', name, '→', String((e && e.message) || e).slice(0, 160));
    return undefined;
  }
}

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  let mini;
  try {
    mini = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
    console.log('[mode] connect 9420 OK');
  } catch (e) {
    console.log('[FAIL] connect 失败(需先 cli auto 拉起):', e.message.split('\n')[0]);
    process.exit(1);
  }

  // 等首页数据就绪(最长 60s); 注意: 任何步骤都可能因重编译导致 page destroyed, 用 curPage() 取新鲜引用
  let page, d;
  for (let i = 0; i < 30; i++) {
    page = await step('currentPage', () => mini.currentPage());
    if (page && page.path === 'pages/index/index') {
      d = await step('page.data', () => page.data());
      if (d && d.loading === false) break;
    }
    await sleep(2000);
  }
  if (!page || !d || d.loading !== false) { console.log('[FAIL] 首页未就绪'); process.exit(1); }
  console.log('[index]', JSON.stringify({
    errMsg: d.errMsg || '', jc: d.groups.jc.length, bd: d.groups.bd.length, ah: d.groups.ah.length,
    planJc: d.planJc.length, planBd: d.planBd.length, scoreStatus: d.scoreStatus, dailyTitle: d.dailyTitle,
  }));

  // 比分轮询: 等到至少一场有 liveScore/liveSt 或 ~40s 封顶(此时段全未开赛则 0 属正常)
  let live = 0;
  for (let i = 0; i < 8; i++) {
    await sleep(5000);
    const dd = await step('poll data', async () => {
      const p = await mini.currentPage(); // 每次取新鲜引用, 防 page destroyed
      return p && p.path === 'pages/index/index' ? p.data() : undefined;
    });
    if (dd && dd.groups) {
      live = (dd.groups.jc || []).filter((m) => m.liveScore).length;
      const st = (dd.groups.jc || []).filter((m) => m.liveSt).length;
      console.log('[poller]', (i + 1) * 5 + 's liveScore=' + live + ' liveSt=' + st);
      if (live > 0) break;
    }
  }
  await step('shot 1_jc', () => mini.screenshot({ path: path.join(SHOTS, '1_jc.png') }));

  page = await step('ref page', () => mini.currentPage()) || page;
  await step('tab→bd', () => page.callMethod('switchTab', { currentTarget: { dataset: { tab: 'bd' } } }));
  await sleep(1000);
  await step('shot 2_bd', () => mini.screenshot({ path: path.join(SHOTS, '2_bd.png') }));

  page = await step('ref page', () => mini.currentPage()) || page;
  await step('tab→ah', () => page.callMethod('switchTab', { currentTarget: { dataset: { tab: 'ah' } } }));
  await sleep(1000);
  await step('shot 3_ah', () => mini.screenshot({ path: path.join(SHOTS, '3_ah.png') }));

  page = await step('ref page', () => mini.currentPage()) || page;
  await step('tab→jc', () => page.callMethod('switchTab', { currentTarget: { dataset: { tab: 'jc' } } }));
  await sleep(800);
  await step('cartMode on', () => page.callMethod('toggleCartMode'));
  const bd0 = d.groups.bd[0];
  const jc0 = d.groups.jc[0];
  if (bd0) await step('勾选北单腿 ' + bd0.bdNum, () => page.callMethod('toggleCart', { currentTarget: { dataset: { key: 'bd:' + bd0.bdNum, type: 'bd', bdnum: bd0.bdNum } } }));
  if (jc0) await step('勾选竞彩场 ' + jc0.id, () => page.callMethod('toggleCart', { currentTarget: { dataset: { key: 'jc:' + jc0.id, type: 'jc', id: jc0.id } } }));
  await step('openCart', () => page.callMethod('openCart'));
  await sleep(800);
  const d3 = await step('cart data', async () => { const p = await mini.currentPage(); return p ? p.data() : undefined; });
  if (d3) console.log('[cart]', JSON.stringify({ count: d3.cartCount, calc: d3.cartCalc, amount: d3.cartAmount, source: d3.sourceBadge }));
  await step('shot 4_cart', () => mini.screenshot({ path: path.join(SHOTS, '4_cart.png') }));
  await step('closeCart', () => page.callMethod('closeCart'));
  await step('cartMode off', () => page.callMethod('toggleCartMode'));

  await step('switchTab→bets', () => mini.switchTab('/pages/bets/bets'));
  await sleep(5000);
  const bpage = await step('bets page', () => mini.currentPage());
  if (bpage) {
    const bd5 = await step('bets data', () => bpage.data());
    if (bd5) console.log('[bets]', JSON.stringify({ path: bpage.path, loading: bd5.loading, bets: (bd5.bets || []).length, errMsg: bd5.errMsg || '', stats: bd5.stats }));
  }
  await step('shot 5_bets', () => mini.screenshot({ path: path.join(SHOTS, '5_bets.png') }));

  if (typeof mini.disconnect === 'function') await mini.disconnect();
  console.log('[done] 截图目录 tools/_mini_shots/');
})().catch((e) => { console.error('[FATAL]', e.message); process.exit(1); });
