/* scorePoller.js — 场卡实时比分轮询(微信小程序 / Node 双环境, 手写)。
 * createScorePoller({ getMatches, onUpdate, intervalMs, fetcher }) → { start, stop, tick }
 * tick 逻辑:
 *   按当日 matches 涉及联赛去重(espn.MATCH_LEAGUES 场次号→联赛码 优先,
 *   espn.LEAGUE_MAP 中文联赛名→联赛码 兜底), 串行逐联赛 fetchBoard(两日 DATES),
 *   对每场未结束场 findScore 写回 { liveScore, liveSt };
 *   LEAGUE_MAP 值为 null 的死链联赛(如韩职)用 match.finalScore 兜底并标 liveSt='MANUAL';
 *   单联赛失败仅缺该联赛不阻断; onUpdate(changed) 仅在比分/状态变化时回调(changed=数组)。
 * 间隔默认 300000ms(5分钟), start=立即 tick+setInterval, stop=clearInterval。
 * match 鸭子类型: { id, league, home, away, finalScore?, liveScore?, liveSt? }(原地写回)。 */
const espn = require('./espn.js');

/* 终态集合: 这些状态不再轮询(含人工兜底) */
const FINISHED = {
  STATUS_FULL_TIME: 1,
  STATUS_FINAL_AET: 1,
  STATUS_FINAL_PEN: 1,
  MANUAL: 1,
};

function isFinished(m) {
  return !!(m && m.liveSt && FINISHED[m.liveSt]);
}

/* 场次 → ESPN 联赛码: 场次号注册表(MATCH_LEAGUES)优先, 中文联赛名(LEAGUE_MAP)兜底。
 * 返回 undefined=无登记通道(永远跳过); null=显式死链(走人工兜底)。 */
function leagueCodeOf(m) {
  if (!m) return undefined;
  if (m.id && Object.prototype.hasOwnProperty.call(espn.MATCH_LEAGUES, m.id)) {
    return espn.MATCH_LEAGUES[m.id];
  }
  if (m.league && Object.prototype.hasOwnProperty.call(espn.LEAGUE_MAP, m.league)) {
    return espn.LEAGUE_MAP[m.league];
  }
  return undefined;
}

function createScorePoller(opts) {
  const getMatches = (opts && opts.getMatches) || (() => []);
  const onUpdate = (opts && opts.onUpdate) || (() => {});
  const fetcher = opts && opts.fetcher;
  const intervalMs = (opts && opts.intervalMs) || 300000;
  let timer = null;
  let ticking = false;

  async function tick() {
    if (ticking) return []; // 上一轮未跑完不重叠
    ticking = true;
    const changed = [];
    try {
      const matches = (getMatches() || []).filter(Boolean);

      // 死链联赛: finalScore 人工兜底(有比分才标 MANUAL, 无比分保持显示开赛时间)
      matches.forEach((m) => {
        if (isFinished(m)) return;
        if (leagueCodeOf(m) === null && m.finalScore) {
          if (m.liveScore !== m.finalScore || m.liveSt !== 'MANUAL') {
            m.liveScore = m.finalScore;
            m.liveSt = 'MANUAL';
            changed.push(m);
          }
        }
      });

      // 待轮询联赛 = 未结束场的联赛码去重(null/undefined 不请求)
      const codes = [];
      matches.forEach((m) => {
        if (isFinished(m)) return;
        const c = leagueCodeOf(m);
        if (c && codes.indexOf(c) === -1) codes.push(c);
      });

      // 串行逐联赛拉今日+次日赛况; 单联赛失败仅缺该联赛, 不阻断其他联赛
      const boardsByCode = {};
      for (let i = 0; i < codes.length; i++) {
        const code = codes[i];
        try {
          const dates = espn.DATES();
          const boards = [];
          for (let j = 0; j < dates.length; j++) {
            const part = await espn.fetchBoard(code, dates[j], fetcher);
            boards.push.apply(boards, part);
          }
          boardsByCode[code] = boards;
        } catch (e) { /* 该联赛本轮缺失 */ }
      }

      // 对未结束场写回比分(未开赛 STATUS_SCHEDULED 不写, 保持显示时间)
      matches.forEach((m) => {
        if (isFinished(m)) return;
        const boards = boardsByCode[leagueCodeOf(m)];
        if (!boards) return;
        const r = espn.findScore(boards, m.home, m.away);
        if (!r || !r.st || r.st === 'STATUS_SCHEDULED') return;
        const score = (r.hs === undefined || r.hs === null || r.hs === '') ? '' : r.hs + '-' + r.as;
        if (m.liveScore !== score || m.liveSt !== r.st) {
          m.liveScore = score;
          m.liveSt = r.st;
          changed.push(m);
        }
      });
    } finally {
      ticking = false;
    }
    if (changed.length) onUpdate(changed);
    return changed;
  }

  function start() {
    if (timer) return;
    tick();
    timer = setInterval(tick, intervalMs);
    // node 冒烟环境: unref 防止定时器挂住进程(小程序 setInterval 返回数字, 无 unref)
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, tick };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createScorePoller };
}
