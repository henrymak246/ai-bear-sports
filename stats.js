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

  // 总进球/大小球命中：总进球「X球」直接比对总进球数；大小球「大2.5/小2.5」按盘口拆段；返回 1 / 0.5 / 0 / null(放弃或整盘走水)
  function judgeOverUnder(pred, finalScore) {
    const s = parseScore(finalScore);
    if (!s) return null;
    const goals = s.home + s.away;
    const t = String(pred || '').trim().match(/^(\d+)\s*球$/); // 竞彩总进球数：X球
    if (t) return goals === parseInt(t[1], 10) ? 1 : 0;
    const p = parseOverUnder(pred); // 亚盘大小球：大/小 + 盘口
    if (!p) return null;
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
  // selDate（2026-09-15 新增, 可选）＝站点月历选中的日期：明细跟随选中日期（选中哪天就显示哪天的期次，
  // 用户在总览点月历切到昨天时应看到昨天的北单记录）；不传时维持旧行为=最新期次，兼容测试/冒烟等无日历调用方
  function computeBeidan(days, selDate) {
    const dir = { score: 0, total: 0 }, ou = { score: 0, total: 0 }, sc = { score: 0, total: 0 };
    const jcDir = { score: 0, total: 0 };
    const plan = { hit: 0, half: 0, miss: 0, push: 0 };
    const list = [];
    // 明细只显示当日(2026-09-12 用户拍板): 北单对阵表期次强相关, 历史期次的腿无参考意义;
    // "当日"=数据中最新含 beidan310 的日期; 统计(方向/大小/比分/方案块/全中彩金)仍全历史累计
    let latestBdDate = null;
    (days || []).forEach(day => {
      if (day.beidan310 && day.date && (latestBdDate === null || day.date > latestBdDate)) latestBdDate = day.date;
    });
    let payoutTotal = 0, payoutCount = 0; // 理论全中彩金(历史登记 beidan310.fullPayout, 2026-09-12 起)
    (days || []).forEach(day => {
      // 选中日期优先（2026-09-15: 此前固定钉在最新期次 → 用户切到昨天看不到昨天的北单记录）；
      // 无 beidan310 顶层块的历史数据且未传 selDate 时保持旧行为(全显示)
      const showDay = selDate ? day.date === selDate : (latestBdDate === null || day.date === latestBdDate);
      (day.matches || []).forEach(m => {
        const d = judgeDirection(m.direction, m.finalScore);
        if (!isBeidan(m)) { if (!isJK(m) && d !== null) { jcDir.score += d; jcDir.total += 1; } return; }
        if (d !== null) { dir.score += d; dir.total += 1; }
        const o = judgeOverUnder(m.overUnder, m.finalScore);
        if (o !== null) { ou.score += o; ou.total += 1; }
        const b = judgeScore(m.score, m.finalScore);
        if (b !== null) { sc.score += b; sc.total += 1; }
        if (showDay) list.push({ date: day.date, id: m.id, league: m.league, home: m.home, away: m.away,
          direction: m.direction, overUnder: m.overUnder, finalScore: m.finalScore || null,
          score: m.score || [], scoreSp: m.scoreSp || null, d, o, b });
      });
      (Array.isArray(day.plan) ? day.plan : []).forEach(p => {
        if (!p || String(p.name || '').indexOf('北单') === -1) return;
        if (['hit', 'half', 'miss', 'push'].indexOf(p.result) !== -1) plan[p.result] += 1;
      });
      // 北单310 顶层块(2026-09-08 起): legs pick=3/1/0 → 主胜/平/客胜, 复用当日竞彩场 finalScore 自动判定;
      // 2026-09-08 晚起支持复式多选 pick='3/1'(命中其一即红, 对齐竞彩层双选"不败"语义);
      // 2026-09-09 更正: 北单官方对阵表每场带让球数(leg.handicap, 负数=主让), 判定时主队比分+让球数后再定3/1/0;
      // leg.result 人工回填(hit/miss)优先, 'push'=腿无效(如北单未开售该场)不计入; 明细进专栏, 方向命中计入 direction
      var b310 = day.beidan310;
      if (b310 && Array.isArray(b310.legs)) {
        if (['hit', 'half', 'miss', 'push'].indexOf(b310.result) !== -1) plan[b310.result] += 1;
        if (typeof b310.fullPayout === 'number') { payoutTotal += b310.fullPayout; payoutCount += 1; }
        var pickMap = { '3': '主胜', '1': '平', '0': '客胜' };
        var revMap = { '主胜': '3', '平': '1', '客胜': '0' };
        b310.legs.forEach(leg => {
          const num = String(leg.match || '').slice(0, 3);
          const mm = (day.matches || []).find(x => x.id && String(x.id).slice(-3) === num);
          // 北单期次场(非竞彩场, 如 056 圣约翰斯通场): 无竞彩 match → 用 leg 自身 finalScore/home/away(2026-09-09 起)
          const lg = mm ? mm.league : (leg.league || '北单');
          const home = mm ? mm.home : String(leg.match || '').slice(4).split(' vs ')[0];
          const away = mm ? mm.away : (String(leg.match || '').split(' vs ')[1] || '');
          const fs = mm ? mm.finalScore : (leg.finalScore || null);
          if (!mm && !home) return;
          const picks = String(leg.pick || '').split('/').map(s => pickMap[s.trim()]).filter(Boolean);
          if (picks.length === 0) return;
          const pick310 = String(leg.pick || ''); // 北单原生 310 记法展示(3=主胜/1=平/0=客胜, 玩法卡有对照)
          const hc = parseInt(leg.handicap, 10) || 0;
          const hcTxt = hc !== 0 ? '[让' + String(leg.handicap).replace(/^\+?(-?\d+)$/, (m, g) => (hc > 0 ? '+' : '') + g) + ']' : '';
          // 官方赛果(让球后 310)+结果 SP(leg.sp3=[胜,平,负]) → 判定列文本
          let dTxt = null;
          const s0 = parseScore(fs);
          let actual = null;
          if (s0) {
            const adjH0 = s0.home + hc;
            actual = adjH0 > s0.away ? '主胜' : adjH0 < s0.away ? '客胜' : '平';
            const r310 = revMap[actual];
            let spTxt = '';
            if (Array.isArray(leg.sp3)) {
              const idx = r310 === '3' ? 0 : r310 === '1' ? 1 : 2;
              if (leg.sp3[idx]) spTxt = ' @' + leg.sp3[idx];
            }
            dTxt = '赛果' + r310 + spTxt;
          }
          let d = null;
          if (leg.result === 'hit') d = 1;
          else if (leg.result === 'miss') d = 0;
          else if (leg.result === 'push') d = null; // 无效腿不计入
          else if (actual) d = picks.indexOf(actual) >= 0 ? 1 : 0;
          if (d !== null) { dir.score += d; dir.total += 1; }
          // leg.bdNum=北单官方对阵表场次号(2026-09-11 起, 用户拍板: 编号列显示北单号方便对照出票; 判定仍按 leg.match 前三位=竞彩号)
          if (showDay) list.push({ date: day.date, id: (leg.bdNum ? '北单' + leg.bdNum : num + '单'), league: lg, home, away,
            direction: pick310 + hcTxt, overUnder: '—', finalScore: fs || null, // SP 不显示(用户拍板 2026-09-09)
            score: [], scoreSp: null, d, o: null, b: null, dTxt });
        });
      }
    });
    list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)); // 日期倒序，同日保持原顺序
    return {
      direction: { score: dir.score, total: dir.total, rate: rate(dir) },
      overUnder: { score: ou.score, total: ou.total, rate: rate(ou) },
      score: { score: sc.score, total: sc.total, rate: rate(sc) },
      jcDirection: { score: jcDir.score, total: jcDir.total, rate: rate(jcDir) },
      plan,
      payout: { total: payoutTotal, count: payoutCount }, // 理论全中彩金累计(历史登记值, 仅供参考非实际中奖)
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

  // ---- 深夜快车专栏：下半夜至白天开赛场次（time < 18:00，即 00:00-17:59）单独累计 ----
  function isNightExpress(m) {
    if (!m) return false;
    const t = String(m.time || '').trim();
    return /^\d{2}:\d{2}$/.test(t) && t < '18:00';
  }

  function computeNightExpress(days) {
    const dir = { score: 0, total: 0 }, ou = { score: 0, total: 0 }, sc = { score: 0, total: 0 };
    const list = [];
    (days || []).forEach(day => {
      (day.matches || []).forEach(m => {
        if (!isNightExpress(m)) return;
        const d = judgeDirection(m.direction, m.finalScore);
        if (d !== null) { dir.score += d; dir.total += 1; }
        const o = judgeOverUnder(m.overUnder, m.finalScore);
        if (o !== null) { ou.score += o; ou.total += 1; }
        const b = judgeScore(m.score, m.finalScore);
        if (b !== null) { sc.score += b; sc.total += 1; }
        list.push({ date: day.date, id: m.id, league: m.league, time: m.time, home: m.home, away: m.away,
          direction: m.direction, overUnder: m.overUnder, finalScore: m.finalScore || null,
          score: m.score || [], scoreSp: m.scoreSp || null, d, o, b });
      });
    });
    // 日期倒序，同日保持原顺序（竞彩编号序天然按开赛时间排）
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

  // ---- 篮球专栏(2026-09-23 起)：竞彩篮球四池 + 官方/博彩两套盘口对照 ----
  // 与上面那四个足球专栏的**根本差别**：篮球还没有"预测→判定"层(尚未产出选场)，
  //   所以本函数不judge任何方向，只汇总**盘口事实**与两套盘的背离。
  //   判定层(方向/让分/大小/胜分差命中)待 `day.basketball.plan` 落地后再加 —— 那时才需要 judge 函数，
  //   且篮球的判定口径与足球方言无关(无平局、让分盘带线、胜分差 6+6 档)，不能复用 judgeDirection。
  // ★★ 已完赛场次**没有博彩盘**：数据层已把 `bk` 置 null(出奇的 books 对已完赛是滚球/结算值，
  //   见 docs/篮球推荐逻辑.md 附B)。本函数只当 null 处理，【绝不从别处补】博彩盘。
  function computeBasketball(days, selDate) {
    var COLS = ['hdc', 'hilo', 'mnl', 'wnm'];
    var pool = { hdc: 0, hilo: 0, mnl: 0, wnm: 0 };
    var nPlayed = 0, nUpcoming = 0, nTotal = 0, nNoOff = 0;
    var div = [];                       // 两套盘背离(仅两者都在的场次)
    var list = [];                      // 明细(选中日/最新期)
    var latest = null;
    (days || []).forEach(function (day) {
      var bb = day && day.basketball;
      if (!bb || !Array.isArray(bb.matches) || !bb.matches.length) return;
      if (latest === null || day.date > latest) latest = day.date;
    });
    (days || []).forEach(function (day) {
      var bb = day && day.basketball;
      if (!bb || !Array.isArray(bb.matches)) return;
      var showDay = selDate ? day.date === selDate : (latest === null || day.date === latest);
      bb.matches.forEach(function (m) {
        nTotal++;
        if (m.played) nPlayed++; else nUpcoming++;
        var anyOff = false;
        COLS.forEach(function (c) { if (m.off && m.off[c]) { pool[c] += 1; anyOff = true; } });
        // 官方完全未上架(如 9-23 三场: 竞彩还没开售) —— 与"上架但某池没开"要分开计
        if (!anyOff) nNoOff++;
        // 背离 = 官方让分 − 博彩盘中位。两套盘已统一成官方口径(负=主队让分)，
        //   ⇒ 差为正 = 官方比市场更看主队; 差为负 = 官方更看客队; 符号相反即"分歧场"。
        var gap = null;
        if (m.off && m.off.hdc && m.off.hdc.line != null &&
            m.bk && m.bk.ah && m.bk.ah.med != null) {
          gap = +(m.off.hdc.line - m.bk.ah.med).toFixed(1);
          div.push({ date: day.date, label: m.label, home: m.home, away: m.away,
                     off: m.off.hdc.line, med: m.bk.ah.med, gap: gap, n: m.bk.n });
        }
        if (showDay) {
          list.push({ date: day.date, label: m.label, tipoff: m.tipoff, home: m.home, away: m.away,
                      league: m.league, played: !!m.played, off: m.off || null, bk: m.bk || null,
                      bkNa: m.bkNa || null, bet: m.bet || null, hs: m.hs, as: m.as, gap: gap });
        }
      });
    });
    div.sort(function (a, b) { return Math.abs(b.gap) - Math.abs(a.gap); });   // 分歧最大的排前
    var sumAbs = 0, nAbs = 0, nFlip = 0;
    div.forEach(function (d) { sumAbs += Math.abs(d.gap); nAbs++; if (d.gap !== 0 && (d.off > 0) !== (d.med > 0)) nFlip++; });
    list.sort(function (a, b) { return a.tipoff < b.tipoff ? -1 : a.tipoff > b.tipoff ? 1 : 0; }); // 按真实开赛时间
    return {
      total: nTotal, played: nPlayed, upcoming: nUpcoming, noOff: nNoOff,
      pool: pool, latest: latest,
      div: { n: nAbs, avgAbs: nAbs ? +(sumAbs / nAbs).toFixed(1) : null, flip: nFlip, list: div },
      matches: list,
    };
  }

  return { parseScore, judgeDirection, judgeOverUnder, judgeScore, computeDayStats, computeOverall, computeTrend, planTypeOf, planStats, isBeidan, computeBeidan, isJK, computeJK, isEPL, computeEPL, isNightExpress, computeNightExpress, computeXinshui, computeBasketball };
});
