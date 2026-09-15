/* live-odds.js — 竞彩官方实时赔率(网站侧, 2026-09-15 新增)。
 * ★要解决的问题与小程序 utils/jc.js 完全相同: data/predictions.js 里每场的 sp/hhad/spHandicap,
 *   以及 hc7/max7 两个方案块的 legs[].odds + totalOdds, 都是**每天构建那一刻**从体彩官方抓的快照
 *   (tools/_fetch_jc.js → tools/_build<MMDD>.js), 之后官方一路浮动, 页面永远停在构建值。
 *   2026-09-15 实测: 用户实拍的官方足球计算器 8 关票里, 8 条腿的赔率与站点快照**只有 1 条一致**。
 * 取数通道: 浏览器直连 webapi.sporttery.cn(实测响应头带 Access-Control-Allow-Origin: *, 可跨域),
 *   故网站不需要云函数、不需要中转 —— 与小程序那条通道相互独立。
 * ★方案块的 totalOdds 一律**重算成页面上那列腿赔率的连乘**, 并在括号里写明依据 ——
 *   构建时的原文是手写字面量(不是从腿算的), 腿一实时化它就成了自相矛盾的旧数。
 *   腿赔率的映射口径由 tools/_smoke_live_odds.js 用**冻结赔率反算构建时字符串**自证(重建得出一模一样才算对)。
 * ★fail-safe: 任何一步失败(网络/解析/结构不符)都原样返回入参, 页面显示构建时快照 ——
 *   赔率取不到绝不能让页面变白, 更不能把已完场的结算行改掉(带 result 的腿一律不碰)。
 */
(function (global) {
  'use strict';

  var HOST = 'https://webapi.sporttery.cn';
  var POOLS = ['had', 'hhad']; // ★官方接口一次只回一个彩池, 两个都得打, 见 fetchLive

  /* 北京时间今天的 'YYYY-MM-DD'(与小程序 utils/jc.js 同口径) */
  function todayBj() {
    var d = new Date(Date.now() + 8 * 3600 * 1000);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }

  function num(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* 官方池 → { 场次号: {sp, hhad, goalLine, st, upd} }; 场次号形如 '周二010' */
  function fetchPool(pool) {
    var url = HOST + '/gateway/jc/football/getMatchCalculatorV1.qry?poolCode=' + pool + '&channel=c';
    return fetch(url, { headers: { 'Accept': 'application/json, text/plain, */*' } })
      .then(function (r) {
        if (!r.ok) throw new Error('竞彩 ' + pool + ' HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        var out = {};
        ((j.value || {}).matchInfoList || []).forEach(function (g) {
          (g.subMatchList || []).forEach(function (m) {
            var o = m[pool] || {};
            if (num(o.h) === null) return;
            out[m.matchNumStr] = {
              sp: [num(o.h), num(o.d), num(o.a)],
              goalLine: num(o.goalLine),
              st: m.matchStatus,
              upd: o.updateTime || '',
            };
          });
        });
        return out;
      });
  }

  /* ★两个彩池必须都打再合并: poolCode=had 时返回体的 hhad 字段是空的(反之亦然),
     只想省一次请求会静默丢掉整个让球盘 —— 让球 7 关会整块停在旧值。 */
  function fetchLive() {
    return Promise.all(POOLS.map(fetchPool)).then(function (res) {
      var rows = {};
      function put(pool, id, v) {
        var r = rows[id] || (rows[id] = { sp: null, hhad: null, goalLine: null, st: '', upd: '' });
        if (pool === 'had') { r.sp = v.sp; r.st = v.st; r.upd = v.upd; }
        else { r.hhad = v.sp; r.goalLine = v.goalLine; if (!r.st) { r.st = v.st; r.upd = v.upd; } }
      }
      POOLS.forEach(function (p, i) {
        Object.keys(res[i]).forEach(function (id) { put(p, id, res[i][id]); });
      });
      return rows;
    });
  }

  /* '010 米堡(-1) vs 米尔沃尔' / '010 米堡 vs 米尔沃尔' → '010' */
  function legNum(matchStr) { return String(matchStr || '').slice(0, 3); }

  /* 这场是不是「官方只开了让球、没开胜平负」(让球-only)?
     ★2026-09-15 用户拿 013 埃尔切vs皇马 指出: 官方只开了 让+2, 没有 310(胜平负)通道 ——
       而页面还在卡片上顶着一个胜平负口径的方向「客胜」, 那是个**投不了的盘**。
     判据: 官方 had 池里没有它、hhad 池里有它(overlay 拿得到实时池时以官方为准, set noHad);
       拿不到实时值(历史日/取数失败)就按快照推: sp 为空而 hhad 是三个数 —— 构建脚本也是这么来的。
     与小程序 utils/jc.js 同名同义(改一处必须改另一处, 由 tools/_smoke_parity.js 卡)。 */
  function noHadOf(m) {
    if (!m) return false;
    if (m.noHad !== undefined) return !!m.noHad;
    return !m.sp && Array.isArray(m.hhad) && m.hhad.length === 3;
  }

  /* 站点场次: id 形如 '周二010' → 后三位 '010' */
  var id3 = function (m) { return String((m && m.id) || '').slice(-3); };

  /* 今日所有让球-only 的场: [{id:'013', ch:['埃','皇']}](场次号 + 主客队名首字, 按场次号排序)。
     ch 是给下面 noHadNote 认"正文有没有在写这场"用的 —— 只凭三位数字认, 撞号撞得厉害。 */
  function noHadList(matches) {
    return (matches || []).filter(noHadOf).map(function (m) {
      return { id: id3(m), ch: [String((m && m.home) || '').charAt(0), String((m && m.away) || '').charAt(0)] };
    }).sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
  }

  /* 方案卡正文里把让球-only 的场**当胜平负写方向**了吗? 是则返回该卡该挂的口径说明, 否则 ''。
     ★识别只看正文自己怎么引用这场: 场次号后面**紧跟主客队名的首字** ——
       双选方向卡里的 '013皇马' / '009阿贾克斯' 命中;
       '013让+2负'(后面是'让', 本来就是让球口径, 不用提醒) /
       '013:0-2'(比分口径, 与310无关) / '1013'(前一位是数字) 都不算。
     ★为什么非要用队名首字而不是"后面跟中文字": 场次号是**各彩种各自的编号**,
       北单卡的正文写的是北单官方编号('003叻武里场'), 拿竞彩的 003 去认就会错挂一句
       (2026-09-15 tools/_smoke_parity.js ⑤ 实测撞上过)。名字对得上才是同一场。
     ★仍是字符串匹配, 认不出语义: 正文写别名/'主队'这类泛称就会漏挂。但挂不挂是**算出来的**,
       由"今天哪几场没开310"和正文自己决定 —— 构建脚本不用管, 卡名改版也不会失效。 */
  function noHadNote(text, list) {
    var s = String(text || '');
    var hits = (list || []).filter(function (x) {
      for (var i = s.indexOf(x.id); i !== -1; i = s.indexOf(x.id, i + 1)) {
        if (i > 0 && /\d/.test(s.charAt(i - 1))) continue;
        var rest = s.slice(i + x.id.length);
        if (x.ch[0] && rest.indexOf(x.ch[0]) === 0) return true;
        if (x.ch[1] && rest.indexOf(x.ch[1]) === 0) return true;
      }
      return false;
    }).map(function (x) { return x.id; });
    if (!hits.length) return '';
    return '⚠ 其中 ' + hits.join(' / ') + ' 官方只开让球、没开胜平负, 正文那串胜平负方向投不了;'
      + ' 可投的是场次卡上的「让球胜负」';
  }

  /* 方案腿的选项 → 赔率下标。
     ★必须**整词匹配**, 不能按'胜'/'负'单字判: 「客胜」含'胜'字, 单字判会把它归到主胜(下标 0),
       于是客胜腿拿到主胜的赔率 —— 2026-09-15 自证时 012 伊普斯「客胜」就反算出 8.5(主胜) 而非 1.22。 */
  function pickIdx(pick) {
    var p = String(pick || '').trim();
    if (p === '主胜' || p === '让胜') return 0;
    if (p === '平' || p === '让平') return 1;
    if (p === '客胜' || p === '让负') return 2;
    // 兜底(整词没命中时的近似): 含'主'=主胜, 含'客'/'负'=客胜, 含'平'=平
    if (p.indexOf('主') !== -1) return 0;
    if (p.indexOf('客') !== -1 || p.indexOf('负') !== -1) return 2;
    if (p.indexOf('平') !== -1) return 1;
    return -1;
  }

  /* 单腿赔率刷新; 拿不到/不适用返回 null(调用方保留原值)。
     ★带 result 的腿是已结算的历史记录, 一律不碰 —— 改它等于篡改战绩。 */
  function legOdds(leg, byId3, arrKey) {
    if (!leg || leg.result) return null;
    var picks = String(leg.pick || '').split('/');
    var odds = String(leg.odds || '').split('/');
    if (picks.length !== odds.length) return null; // 结构不符(如「胆/双选」混排) → 不猜, 保留原值
    var m = byId3[legNum(leg.match)];
    if (!m) return null;
    var arr = m[arrKey];
    if (!Array.isArray(arr)) return null;
    var out = picks.map(function (pk) {
      var i = pickIdx(pk);
      var v = i < 0 ? null : arr[i];
      if (v === null || v === undefined || !isFinite(Number(v))) return null;
      // 构建脚本把方案腿赔率写成 2 位小数字符串('2.20'/'3.58'), 这里同口径,
      // 免得实时值一来同一列变成 '2.2' 与相邻腿的 '3.58' 高低不齐
      return Number(v).toFixed(2);
    });
    return out.indexOf(null) !== -1 ? null : out.join('/');
  }

  /* 连乘口径(与构建脚本一致): >=100 取整, 否则留 1 位小数 */
  function product(oddsList) {
    var p = 1;
    var ok = oddsList.every(function (o) {
      var v = parseFloat(String(o).split('/')[0]);
      if (!isFinite(v) || v <= 0) return false;
      p *= v;
      return true;
    });
    if (!ok) return null;
    return p >= 100 ? String(Math.round(p)) : p.toFixed(1);
  }

  /* '7关全中约858倍' → '7关全中约871倍(按当前实时赔率连乘)'。
     ★totalOdds 在构建脚本里是**手写的字面量**(tools/_build<MMDD>.js 里直接写 "7关全中约858倍"),
       不是从腿赔率算出来的 —— 拿历史数据反算过: 73 个方案块里只有 39 个能被连乘重建,
       其余差到 3 倍(2026-08-24 hc7 写 13000 而连乘只有 4804)。所以这里**不敢装作能复刻构建口径**。
       只在原文恰好只有一个「约N倍」段(今日的 hc7/max7 都是这种)时替换, 并把依据写进括号。
       多段字符串(如 '胆拖主串3串1(007×008×006)约3.5倍;7关全串约26倍')一律不碰 —— 猜错哪一段就是假数。
       括号要落在「倍」**后面**('约6.2倍(按…连乘)'), 不能插在数字和「倍」中间。 */
  const TOTAL_NUM_RE = /[\d.]+(?=\s*倍)/g;
  function substTotal(orig, newVal, label) {
    var s = String(orig || '');
    if (newVal === null) return orig;
    if ((s.match(TOTAL_NUM_RE) || []).length !== 1) return orig;
    return s.replace(/[\d.]+(\s*倍)/, newVal + '$1(' + label + ')');
  }

  /* '7关全中约858倍' → '858'; 不唯一(多段倍数)时返回 '', 交给调用方放弃替换 */
  function totalNum(s) {
    var m = String(s || '').match(TOTAL_NUM_RE);
    return m && m.length === 1 ? m[0] : '';
  }

  /* 方案卡上的大号数字(pct, 形如 '≈858倍')与 hc7/max7 的 totalOdds 是**同一个数**
     (构建脚本同源写两处)。不跟着换的话, 同一页上"方案卡 858 倍"和"让球7关面板 705 倍"会当面对不上。
     ★只做**同值替换**: 原文里数字串与旧 totalOdds 的数字完全相等才换 —— 不按方案名猜
       (名字改过好几轮), 相等即同源, 不等一律不碰。 */
  function substPct(pct, pairs) {
    var s = String(pct || '');
    for (var i = 0; i < pairs.length; i++) {
      // 数字后面必须**确实跟着「倍」**才是同一个口径(如 '≈18万倍级' 里的 18 就不是);
      // 标注同样落在「倍」后面, 不能插进数字和「倍」中间
      var re = new RegExp(String(pairs[i][0]).replace(/\./g, '\\.') + '(\\s*倍)');
      var m = s.match(re);
      if (!m) continue;
      return s.replace(re, pairs[i][1] + '$1(' + pairs[i][2] + ')');
    }
    return pct;
  }

  /* 一个方案块(hc7/max7): 刷 legs[].odds, 并把 totalOdds 重算成**页面实际显示**的那几条腿的连乘。
     ★为什么必须重算而不是沿用原文: 2026-09-15 实测 hc7 的腿已漂到连乘 705 倍, 页面却还印着
       构建时的 858 倍 —— 用户拿计算器一乘就会说"不对"。腿实时化了, 总数就不能停在旧字面量上。
     ★这里只承诺一件事: 总数 = 页面上那列腿赔率的连乘(与显示同源, 可复核), 括号里写清依据:
       全刷新 → '按当前实时赔率连乘'; 有腿没刷到 → '按页面显示赔率连乘' + 停售/未刷新腿数。
       只有**连乘都算不出来**(有腿赔率读不出数)时才原样保留总数字面量。 */
  function overlayPlan(plan, byId3, arrKey, closedIds) {
    if (!plan || !Array.isArray(plan.legs) || !plan.legs.length) return plan;
    var legs = [];
    var stale = 0, closed = 0, settled = 0;
    plan.legs.forEach(function (l) {
      if (l && l.result) settled++; // 已结算腿: 这关的成败已成事实, "全中约N倍"不再是可谈的价格
      var v = legOdds(l, byId3, arrKey);
      if (v === null) {
        stale++;
        // 已停售腿单独计数: 它不只是"没刷到", 而是官方已经下架、这张关本身就买不成了
        if (closedIds && closedIds[legNum(l.match)]) closed++;
        legs.push(l);
      } else {
        legs.push(Object.assign({}, l, { odds: v }));
      }
    });
    var next = Object.assign({}, plan, { legs: legs });
    // 已结算腿 / 有腿读不出数 → 连乘不可信, 总数保持原字面量(腿照刷, 那是页面显示的事)
    // 此时**不设 oddsBasis**, 调用方据此放弃同步方案卡上的大号数字
    if (settled) return next;
    var total = product(legs.map(function (l) { return l.odds; }));
    if (total === null) return next;
    next.oddsBasis = !stale ? 'live' : (closed ? 'closed' : 'partial');
    next.oddsStale = stale;
    next.oddsClosedLegs = closed;
    next.totalOdds = substTotal(plan.totalOdds, total, !stale ? '按当前实时赔率连乘'
      : '按页面显示赔率连乘, 含 ' + (closed || stale) + ' 条' + (closed ? '已停售' : '未刷新') + '腿构建值');
    return next;
  }

  /* day + 实时池 → 新的 day(纯函数, 不改入参); 非今日/取不到实时值 → 原样返回 */
  function overlayDay(day, rows) {
    if (!day || !rows || day.date !== todayBj()) return day;
    var byId3 = {};
    (day.matches || []).forEach(function (m) { byId3[id3(m)] = m; });

    var live = {};
    var matches = (day.matches || []).map(function (m) {
      var r = rows[m.id];
      var next = Object.assign({}, m);
      if (!r) {
        // 不在官方实时池 = 已过销售截止被下架; 赔率保留构建值供回顾, 只打标记
        next.oddsLive = true;
        next.oddsClosed = true;
        return next;
      }
      if (r.sp) next.sp = r.sp.slice();
      if (r.hhad) next.hhad = r.hhad.slice();
      if (r.goalLine !== null && r.goalLine !== undefined) next.spHandicap = r.goalLine;
      next.oddsLive = true;
      next.oddsClosed = false;
      next.oddsUpd = r.upd || '';
      // 官方池里只有让球、没有胜平负 → 让球-only。显式 set(而不是留给快照推断):
      // 构建时开着 310、临场却关掉的那种, 只有官方池说了算。见 noHadOf
      next.noHad = !r.sp && !!r.hhad;
      live[id3(m)] = next;
      return next;
    });

    // 方案块按**叠加后**的场次取赔率(与页面显示同源, 否则方案倍数和上面的 SP 会对不上)
    var byId3Live = {};
    var closedIds = {};
    matches.forEach(function (m) {
      if (m.oddsClosed) closedIds[id3(m)] = true;   // 停售场不给实时值(下架了没有可投价), 但要让方案块知道它停售
      else byId3Live[id3(m)] = m;
    });

    var hc7 = overlayPlan(day.hc7, byId3Live, 'hhad', closedIds);
    var max7 = overlayPlan(day.max7, byId3Live, 'sp', closedIds);
    var nhList = noHadList(matches); // 让球-only 的场(见 noHadNote)

    // 方案卡的大号数字跟着同步(同值才换, 见 substPct)
    var pairs = [];
    [[day.hc7, hc7], [day.max7, max7]].forEach(function (pr) {
      var o = pr[0], n = pr[1];
      if (!o || !n || !n.oddsBasis) return;
      var a = totalNum(o.totalOdds), b = totalNum(n.totalOdds);
      if (!a || !b) return;
      pairs.push([a, b, n.oddsBasis === 'live' ? '实时连乘'
        : (n.oddsBasis === 'closed' ? '含' + n.oddsClosedLegs + '条停售腿' : '含' + n.oddsStale + '条未刷新腿')]);
    });
    var patch = {
      matches: matches,
      oddsLive: true,
      oddsAt: new Date().toISOString(),
      hc7: hc7,
      max7: max7,
    };
    if (Array.isArray(day.plan)) {
      // 让球-only 场次在正文里被当胜平负写了的那几张卡, 挂一句口径说明(见 noHadNote)
      patch.plan = day.plan.map(function (p) {
        var q = substPct(p.pct, pairs);
        var note = noHadNote(p.text, nhList);
        if (q === p.pct && !note) return p;
        var o = Object.assign({}, p);
        if (q !== p.pct) o.pct = q;
        if (note) o.noHadNote = note;
        return o;
      });
    }

    return Object.assign({}, day, patch);
  }

  /* 页面入口: 拉实时值并只叠加最新一天(days[0])。任何失败 → 原样返回, 页面退回快照。 */
  function refreshDays(days) {
    if (!Array.isArray(days) || !days.length) return Promise.resolve(days);
    var today = days[0];
    if (!today || today.date !== todayBj()) return Promise.resolve(days); // 补看历史: 官方池里没有那些场次
    return fetchLive()
      .then(function (rows) {
        var d2 = overlayDay(today, rows);
        if (d2 === today) return days;
        var out = days.slice();
        out[0] = d2;
        return out;
      })
      .catch(function () { return days; });
  }

  /* 顶部一行的时效说明; 没叠加过(非今日/取数失败)返回 '' —— 调用方直接拼即可。
     时间取各场 oddsUpd 的最大值, 那是**官方自己的更新时间**, 比本站的拉取时刻更有意义。 */
  function note(day) {
    if (!day || !day.oddsLive) return '';
    var at = '';
    (day.matches || []).forEach(function (m) {
      if (m.oddsUpd && m.oddsUpd > at) at = m.oddsUpd;
    });
    var closed = (day.matches || []).filter(function (m) { return m.oddsClosed; }).length;
    return ' · 竞彩赔率官方实时' + (at ? ' ' + at : '') + (closed ? ' · ' + closed + ' 场已停售' : '');
  }

  global.LiveOdds = {
    todayBj: todayBj, fetchLive: fetchLive, overlayDay: overlayDay, refreshDays: refreshDays, note: note,
    // 渲染器要用: 卡片该按胜平负口径还是让球口径显示, 由它判(见 index.html 的 matchTable)
    noHadOf: noHadOf,
    // 导出面与小程序 utils/jc.js 的 module.exports 一一对应(见 tools/_smoke_parity.js),
    // 内部用得上却没导出的函数就没法被跨端对齐 —— id3/legNum 这类"截几位"的口径尤其容易悄悄漂
    _internals: { pickIdx: pickIdx, legNum: legNum, id3: id3, noHadOf: noHadOf, noHadList: noHadList, noHadNote: noHadNote,
      legOdds: legOdds, product: product,
      substTotal: substTotal, totalNum: totalNum, substPct: substPct, overlayPlan: overlayPlan },
  };
})(typeof window !== 'undefined' ? window : this);
