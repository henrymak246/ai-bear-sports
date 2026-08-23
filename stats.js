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
        .filter(l => l.total > 0) // 全部待回填的联赛不展示
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

  // ---- 方案层命中统计 ----
  // 6 类固定顺序；归组规则（自上而下优先）：
  //   std 盘：名称含「大小」→ 大小盘，其余 → 亚洲让球
  //   竞彩（market 缺省按 jc）：含「比分」→ 比分；含「进球」→ 进球数；含「过关/串」→ 过关串关；其余 → 胜平负
  var PLAN_TYPES = ['胜平负', '进球数', '比分', '过关串关', '亚洲让球', '大小盘'];

  function planTypeOf(market, name) {
    var m = market || 'jc';
    var n = String(name || '');
    if (m === 'std') return n.indexOf('大小') !== -1 ? '大小盘' : '亚洲让球';
    if (n.indexOf('比分') !== -1) return '比分';
    if (n.indexOf('进球') !== -1) return '进球数';
    if (n.indexOf('过关') !== -1 || n.indexOf('串') !== -1) return '过关串关';
    return '胜平负';
  }

  // 汇总每天 plan[] 的 result（hit/half/miss/push，缺省不计）：
  // total=hit+half+miss（走水 push 不计入分母）；rate=(hit+0.5*half)/total，total=0 时为 null
  // last14：已回填块按日期升序、最多 14 条，供面板画迷你圆点
  function planStats(days) {
    var acc = {};
    PLAN_TYPES.forEach(function (t) {
      acc[t] = { hit: 0, half: 0, miss: 0, push: 0, blocks: [] };
    });
    (days || []).forEach(function (day) {
      (Array.isArray(day.plan) ? day.plan : []).forEach(function (p) {
        if (!p || ['hit', 'half', 'miss', 'push'].indexOf(p.result) === -1) return;
        var type = planTypeOf(p.market, p.name);
        acc[type][p.result] += 1;
        acc[type].blocks.push({ date: day.date, result: p.result });
      });
    });
    return PLAN_TYPES.map(function (t) {
      var b = acc[t];
      var total = b.hit + b.half + b.miss;
      var blocks = b.blocks.slice().sort(function (x, y) { return x.date < y.date ? -1 : 1; });
      return {
        type: t,
        hit: b.hit, half: b.half, miss: b.miss, push: b.push,
        total: total,
        rate: total === 0 ? null : (b.hit + 0.5 * b.half) / total,
        last14: blocks.slice(-14),
      };
    });
  }

  // ---- 北单专栏：id 以「北单」开头的场次单独累计（含竞彩方向对照 + 北单方案块） ----
  function isBeidan(m) { return !!m && String(m.id || '').indexOf('北单') === 0; }

  // ---- 日韩专栏：id 以「日职/韩K」开头，或 league 含「日职/韩K/韩职」的场次单独累计 ----
  function isJK(m) {
    if (!m) return false;
    const id = String(m.id || '');
    const lg = String(m.league || '');
    if (id.indexOf('日职') === 0 || id.indexOf('韩K') === 0) return true;
    return lg.indexOf('日职') >= 0 || lg.indexOf('韩K') >= 0 || lg.indexOf('韩职') >= 0;
  }

  // direction/overUnder/score 只累计北单场；jcDirection 累计竞彩组（非北单非日韩）场次方向作对照；
  // matches 为北单明细（日期倒序，含待回填场，d/o/b 为三项判定 null=不计入）；
  // plan 只数名称含「北单」的方案块 result
  function computeBeidan(days) {
    const dir = { score: 0, total: 0 }, ou = { score: 0, total: 0 }, sc = { score: 0, total: 0 };
    const jcDir = { score: 0, total: 0 };
    const plan = { hit: 0, half: 0, miss: 0, push: 0 };
    const list = [];
    (days || []).forEach(day => {
      (day.matches || []).forEach(m => {
        const d = judgeDirection(m.direction, m.finalScore);
        if (!isBeidan(m)) { if (!isJK(m) && d !== null) { jcDir.score += d; jcDir.total += 1; } return; }
        if (d !== null) { dir.score += d; dir.total += 1; }
        const o = judgeOverUnder(m.overUnder, m.finalScore);
        if (o !== null) { ou.score += o; ou.total += 1; }
        const b = judgeScore(m.score, m.finalScore);
        if (b !== null) { sc.score += b; sc.total += 1; }
        list.push({ date: day.date, id: m.id, league: m.league, home: m.home, away: m.away,
          direction: m.direction, overUnder: m.overUnder, finalScore: m.finalScore || null,
          score: m.score || [], scoreSp: m.scoreSp || null, d, o, b });
      });
      (Array.isArray(day.plan) ? day.plan : []).forEach(p => {
        if (!p || String(p.name || '').indexOf('北单') === -1) return;
        if (['hit', 'half', 'miss', 'push'].indexOf(p.result) !== -1) plan[p.result] += 1;
      });
    });
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 日期倒序，同日保持原顺序
    return {
      direction: { score: dir.score, total: dir.total, rate: rate(dir) },
      overUnder: { score: ou.score, total: ou.total, rate: rate(ou) },
      score: { score: sc.score, total: sc.total, rate: rate(sc) },
      jcDirection: { score: jcDir.score, total: jcDir.total, rate: rate(jcDir) },
      plan,
      matches: list,
    };
  }

  // ---- 日韩专栏：结构同 computeBeidan；jcDirection 累计竞彩组（非北单非日韩）方向作对照；
  // plan 只数名称含「日韩」的方案块 result ----
  function computeJK(days) {
    const dir = { score: 0, total: 0 }, ou = { score: 0, total: 0 }, sc = { score: 0, total: 0 };
    const jcDir = { score: 0, total: 0 };
    const plan = { hit: 0, half: 0, miss: 0, push: 0 };
    const list = [];
    (days || []).forEach(day => {
      (day.matches || []).forEach(m => {
        const d = judgeDirection(m.direction, m.finalScore);
        if (!isJK(m)) { if (!isBeidan(m) && d !== null) { jcDir.score += d; jcDir.total += 1; } return; }
        if (d !== null) { dir.score += d; dir.total += 1; }
        const o = judgeOverUnder(m.overUnder, m.finalScore);
        if (o !== null) { ou.score += o; ou.total += 1; }
        const b = judgeScore(m.score, m.finalScore);
        if (b !== null) { sc.score += b; sc.total += 1; }
        list.push({ date: day.date, id: m.id, league: m.league, home: m.home, away: m.away,
          direction: m.direction, overUnder: m.overUnder, finalScore: m.finalScore || null,
          score: m.score || [], scoreSp: m.scoreSp || null, d, o, b });
      });
      (Array.isArray(day.plan) ? day.plan : []).forEach(p => {
        if (!p || String(p.name || '').indexOf('日韩') === -1) return;
        if (['hit', 'half', 'miss', 'push'].indexOf(p.result) !== -1) plan[p.result] += 1;
      });
    });
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 日期倒序，同日保持原顺序
    return {
      direction: { score: dir.score, total: dir.total, rate: rate(dir) },
      overUnder: { score: ou.score, total: ou.total, rate: rate(ou) },
      score: { score: sc.score, total: sc.total, rate: rate(sc) },
      jcDirection: { score: jcDir.score, total: jcDir.total, rate: rate(jcDir) },
      plan,
      matches: list,
    };
  }

  // ---- 英超专栏：league 含「英超」的场次单独累计（方向/大小/比分，无方案块） ----
  function isEPL(m) {
    if (!m) return false;
    return String(m.league || '').indexOf('英超') >= 0;
  }

  function computeEPL(days) {
    const dir = { score: 0, total: 0 }, ou = { score: 0, total: 0 }, sc = { score: 0, total: 0 };
    const list = [];
    (days || []).forEach(day => {
      (day.matches || []).forEach(m => {
        if (!isEPL(m)) return;
        const d = judgeDirection(m.direction, m.finalScore);
        if (d !== null) { dir.score += d; dir.total += 1; }
        const o = judgeOverUnder(m.overUnder, m.finalScore);
        if (o !== null) { ou.score += o; ou.total += 1; }
        const b = judgeScore(m.score, m.finalScore);
        if (b !== null) { sc.score += b; sc.total += 1; }
        list.push({ date: day.date, id: m.id, league: m.league, home: m.home, away: m.away,
          direction: m.direction, overUnder: m.overUnder, finalScore: m.finalScore || null,
          score: m.score || [], scoreSp: m.scoreSp || null, d, o, b });
      });
    });
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return {
      direction: { score: dir.score, total: dir.total, rate: rate(dir) },
      overUnder: { score: ou.score, total: ou.total, rate: rate(ou) },
      score: { score: sc.score, total: sc.total, rate: rate(sc) },
      matches: list,
    };
  }

  // ---- 心水公布记录：day.xinshui.picks[]（label + result: hit/miss/缺省=待赛）累计 ----
  function computeXinshui(days) {
    var hit = 0, miss = 0, pending = 0;
    var entries = [];
    (days || []).forEach(function (day) {
      var xs = day && day.xinshui;
      if (!xs || !Array.isArray(xs.picks)) return;
      xs.picks.forEach(function (p) {
        if (!p) return;
        var r = p.result === 'hit' ? 'hit' : p.result === 'miss' ? 'miss' : null;
        if (r === 'hit') hit++; else if (r === 'miss') miss++; else pending++;
        entries.push({ date: day.date, label: p.label || '', result: r });
      });
    });
    entries.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); // 日期倒序
    var total = hit + miss;
    return { hit: hit, miss: miss, pending: pending, total: total, rate: rate({ score: hit, total: total }), entries: entries };
  }

  return { parseScore, judgeDirection, judgeOverUnder, judgeScore, computeDayStats, computeOverall, computeTrend, planTypeOf, planStats, isBeidan, computeBeidan, isJK, computeJK, isEPL, computeEPL, computeXinshui };
});
