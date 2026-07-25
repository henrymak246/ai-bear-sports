/* stats.js — 命中率统计纯函数库（浏览器 <script> 与 Node require 双环境可用） */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatsLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function parseScore(finalScore) {
    if (!finalScore) return null;
    const m = String(finalScore).trim().match(/^(\d+)\s*[-:：]\s*(\d+)$/);
    if (!m) return null;
    return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
  }

  // 方向命中：pred ∈ 主胜/平/客胜/放弃；返回 1/0/null(不计入)
  function judgeDirection(pred, finalScore) {
    if (!pred || pred === '放弃') return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const actual = s.home > s.away ? '主胜' : s.home < s.away ? '客胜' : '平';
    return pred === actual ? 1 : 0;
  }

  function parseOverUnder(pred) {
    if (!pred) return null;
    const m = String(pred).trim().match(/^([大小])\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    return { side: m[1], line: parseFloat(m[2]) };
  }

  // 单段判定：1 中 / 0 不中 / null 走水
  function judgeSegment(side, line, goals) {
    if (goals === line) return null;
    const overWin = goals > line;
    return (side === '大') === overWin ? 1 : 0;
  }

  // 大小球命中：.25/.75 拆双段；返回 1 / 0.5 / 0 / null(放弃或整盘走水)
  function judgeOverUnder(pred, finalScore) {
    const p = parseOverUnder(pred);
    const s = parseScore(finalScore);
    if (!p || !s) return null;
    const goals = s.home + s.away;
    const quarter = Math.round(p.line * 100) % 50 === 25; // .25/.75 → 双段
    const lines = quarter ? [p.line - 0.25, p.line + 0.25] : [p.line];
    const results = lines.map(l => judgeSegment(p.side, l, goals));
    const valid = results.filter(r => r !== null);
    if (valid.length === 0) return null;             // 整盘走水，不计入统计
    if (valid.length !== results.length) return 0.5; // 含走水段 → 半中（赢/输一半）
    return valid.reduce((a, b) => a + b, 0) / valid.length;
  }

  // 比分命中：预测数组中任一与实比分完全一致
  function judgeScore(predArr, finalScore) {
    if (!Array.isArray(predArr) || predArr.length === 0) return null;
    const s = parseScore(finalScore);
    if (!s) return null;
    const norm = s.home + '-' + s.away;
    return predArr.some(p => String(p).replace(/[:：]/g, '-') === norm) ? 1 : 0;
  }

  // 单日统计：score=命中分（含0.5），total=计入场次数，pending=待回填数
  function computeDayStats(day) {
    const acc = {
      direction: { score: 0, total: 0 },
      overUnder: { score: 0, total: 0 },
      score: { score: 0, total: 0 },
      pending: 0,
      matches: (day.matches || []).length,
    };
    (day.matches || []).forEach(m => {
      if (!m.finalScore) { acc.pending += 1; return; }
      const d = judgeDirection(m.direction, m.finalScore);
      if (d !== null) { acc.direction.score += d; acc.direction.total += 1; }
      const o = judgeOverUnder(m.overUnder, m.finalScore);
      if (o !== null) { acc.overUnder.score += o; acc.overUnder.total += 1; }
      const b = judgeScore(m.score, m.finalScore);
      if (b !== null) { acc.score.score += b; acc.score.total += 1; }
    });
    return acc;
  }

  function rate(bucket) { return bucket.total === 0 ? null : bucket.score / bucket.total; }

  // 多日汇总 + 联赛分布（按方向命中）
  function computeOverall(days) {
    const sum = {
      direction: { score: 0, total: 0 },
      overUnder: { score: 0, total: 0 },
      score: { score: 0, total: 0 },
      matches: 0, pending: 0, byLeague: {},
    };
    days.forEach(day => {
      const d = computeDayStats(day);
      ['direction', 'overUnder', 'score'].forEach(k => { sum[k].score += d[k].score; sum[k].total += d[k].total; });
      sum.matches += d.matches;
      sum.pending += d.pending;
      (day.matches || []).forEach(m => {
        const lg = m.league || '其他';
        if (!sum.byLeague[lg]) sum.byLeague[lg] = { score: 0, total: 0 };
        const hit = judgeDirection(m.direction, m.finalScore);
        if (hit !== null) { sum.byLeague[lg].score += hit; sum.byLeague[lg].total += 1; }
      });
    });
    return {
      days: days.length,
      matches: sum.matches,
      pending: sum.pending,
      direction: { score: sum.direction.score, total: sum.direction.total, rate: rate(sum.direction) },
      overUnder: { score: sum.overUnder.score, total: sum.overUnder.total, rate: rate(sum.overUnder) },
      score: { score: sum.score.score, total: sum.score.total, rate: rate(sum.score) },
      byLeague: Object.entries(sum.byLeague)
        .map(([league, b]) => ({ league, score: b.score, total: b.total, rate: rate(b) }))
        .sort((a, b) => b.total - a.total),
    };
  }

  // 近 n 日方向命中率走势（日期升序，仅含有判定场次的日）
  function computeTrend(days, n) {
    return days
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(day => {
        const d = computeDayStats(day);
        return { date: day.date, hit: d.direction.score, total: d.direction.total, rate: rate(d.direction) };
      })
      .filter(p => p.total > 0)
      .slice(-(n || 14));
  }

  return { parseScore, judgeDirection, judgeOverUnder, judgeScore, computeDayStats, computeOverall, computeTrend };
});
