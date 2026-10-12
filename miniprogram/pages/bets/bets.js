/* pages/bets/bets.js — 我的投注
 * onShow: api.fetchBets → 成功渲染统计卡+列表并自动结算; 失败(404 表未建/网络异常)降级横幅+空列表不崩。
 * onShow / onPullDownRefresh / 「↻ 刷新比分」各跑一轮 load+结算; onHide / onUnload 停轮询。
 *
 * 结算实时化(不等整票全完场):
 *   一腿 miss → 串关一腿失即全失, 立即判"未中"(奖金 0)写库, 不等其余腿完场;
 *   无 miss 部分完场 → 仅腿级回写(result/finalScore), 票保持"待结算";
 *   已判死的票 → 剩余腿继续补更新展示, 但永不改 status/payout/profit/settled_at。
 *   取分: ESPN(死链联赛回退 prediction_days 当日 finalScore); 每轮按 bet_date|legKey 去重取分,
 *   ESPN 请求再按 URL 去重(boardCache) → 同联赛多腿只拉一次。
 *   乐观更新: 内存先改再 await 写库; 写库失败静默(界面已正确), 下轮 load 从库重读 → 指纹不等 → 自动重试。
 *
 * 轮询: 每 POLL_MS 静默跑一轮(pollTick), 仅当还有"未完场腿"注单才真发请求, 否则零请求;
 *   静默轮不置 loading/settling、不闪横幅, 失败下一轮自然重试。 */
const api = require('../../utils/api.js');
const settle = require('../../utils/settle.js');
const espn = require('../../utils/espn.js');
const cart = require('../../utils/cart.js');
const betEdit = require('../../utils/betEdit.js');
const slipCanvas = require('../../utils/slipCanvas.js');

const POLL_MS = 300000; // 自动结算轮询间隔(5 分钟)

const SRC = {
  jc: { label: '🎫 竞彩', cls: 'badge-red' },
  bd: { label: '🀄 北单', cls: 'badge-gold' },
  ah: { label: '🌏 亚盘', cls: 'badge-blue' },
};
const RESULT_MARK = {
  hit: { t: '✓', cls: 'judge-hit' },
  miss: { t: '✗', cls: 'judge-miss' },
  half: { t: '◐', cls: 'judge-half' },
  push: { t: '走', cls: 'judge-pending' },
};
const STATUS_CAPSULE = {
  pending: { t: '待结算', cls: 'cap-pending' },
  hit: { t: '全红', cls: 'cap-hit' },
  miss: { t: '未中', cls: 'cap-miss' },
  half: { t: '半红', cls: 'cap-half' },
};

function money(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '0.00';
  return (Math.round(v * 100) / 100).toFixed(2);
}

function errText(e) {
  const m = String((e && e.message) || e || '');
  if (/HTTP 404/.test(m)) return '登记表未就绪(bets 表未创建), 请先在 Supabase 执行 supabase/bets.sql';
  return '网络异常, 投注记录拉取失败, 请下拉重试';
}

/* 该腿能不能改 310 选项 —— 分派顺序**照抄 settle.settleLeg**(别看 leg.kind, 脏数据会错位):
   ① 有 handicap 字段 = 北单腿, pick 是纯 310 码 → 可编;
   ② 否则 pick 是"命名队+盘口"(亚盘) → 不是 310 选项, 不可编;
   ③ 其余 = 竞彩胜平负 / 竞彩让球('让-1 3') → 可编。 */
function canEditLeg(leg) {
  if (!leg) return false;
  if (leg.handicap !== undefined && leg.handicap !== null && leg.handicap !== '') return true;
  return !settle.isAhPick(leg.pick);
}

/* 在当日推荐 payload 里找这条腿的场次: 先全等 leg.id, 再退场次号后三位
   (与 autoSettle 的 payloadScore 同口径 —— 老票的 id 可能带/不带星期前缀) */
function pickMatch(p, leg) {
  const id = String((leg && leg.id) || '');
  if (!p || !Array.isArray(p.matches) || !id) return null;
  const tail = id.slice(-3);
  let i;
  for (i = 0; i < p.matches.length; i++) {
    if (p.matches[i] && String(p.matches[i].id || '') === id) return p.matches[i];
  }
  for (i = 0; i < p.matches.length; i++) {
    if (p.matches[i] && String(p.matches[i].id || '').slice(-3) === tail) return p.matches[i];
  }
  return null;
}

/* 编辑预览文案: 按当前勾选重算**整票**注数与投入(注数是各腿选项数的连乘, 不能只看这一腿)。
   口径照抄推荐页组串登记: amount = round2(stakes × unit), expect_payout 取 cart.calc 的值。
   ★别把 cart.calc 里 expectPayout 的 ×2 "顺手修正"成 ×unit —— 那是全项目既有约定。 */
function previewOf(bet, li, leg, opts) {
  if (!bet || !leg) return '';
  const cs = (opts || []).filter(function (o) { return o.on; });
  if (!cs.length) return '至少保留一个选项';
  const by = {};
  (opts || []).forEach(function (o) { by[o.code] = o.odds; });
  const newLeg = cart.applyPicks(leg, cs.map(function (o) { return o.code; }), by);
  if (!newLeg) return '';
  const legs = (bet.legs || []).map(function (l, i) { return i === li ? newLeg : l; });
  const c = cart.calc(legs);
  const amount = Math.round(c.stakes * (parseFloat(bet.unit) || 2) * 100) / 100;
  const head = '注数 ' + c.stakes + ' · 投入 ' + money(amount) + ' 元 · 理论奖金 ' + money(c.expectPayout) + ' 元';
  const oldS = parseInt(bet.stakes, 10) || 0;
  return c.stakes === oldS ? head : head + ' (原 ' + oldS + '注/' + money(bet.amount) + '元)';
}

/* 单条腿 → 腿行视图模型。decorateBet 与「修改模式」草稿共用同一份(两处渲染的字段必须一致,
   否则删完腿重建行会闪字段) */
function legRowOf(leg) {
  const mark = RESULT_MARK[leg.result] || { t: '待', cls: 'judge-pending' };
  return {
    matchText: leg.match || ((leg.home || '') + ' vs ' + (leg.away || '')),
    finalScore: leg.finalScore || '',
    pickText: leg.pick || '',
    oddsText: leg.odds !== undefined && leg.odds !== null ? String(leg.odds) : '',
    bdNumText: leg.bdNum ? '北单' + leg.bdNum : '',
    mark: mark.t,
    markCls: mark.cls,
    canEdit: canEditLeg(leg),
  };
}

/* 统计卡下的「当日累计」一行: 当日 = 列表里最新 bet_date(不是日历日 —— 场次多在当晚~次日凌晨,
   跨零点按日历日会显示 0 元)。金额口径 = Σ amount, 与 stats.totalAmount 同源。 */
function todayLineOf(bets) {
  const t = betEdit.todaySum(bets);
  if (!t.date) return '';
  return t.date.slice(5) + ' 当日投注 ' + money(t.amount) + ' 元 · ' + t.count + ' 单';
}

/* 修改模式的金额行(展示字符串在此预拼接, 与 bet-foot 的写法一致) */
function slipMoneyLine(m, mult) {
  return m.stakes + '注 · 单注 ' + money(m.unit) + '元' +
    (mult > 1 ? ' ×' + mult + '倍' : '') + ' · 投入 ' + money(m.amount) + '元';
}

/* bet → 视图模型(展示字符串在此预拼接, WXML 只做插值) */
function decorateBet(bet) {
  const src = SRC[bet.source] || { label: bet.source || '?', cls: 'badge-gray' };
  const legRows = (bet.legs || []).map(legRowOf);
  const cap = STATUS_CAPSULE[bet.status] || STATUS_CAPSULE.pending;
  const profit = parseFloat(bet.profit) || 0;
  return Object.assign({}, bet, {
    srcLabel: src.label,
    srcCls: src.cls,
    legRows: legRows,
    capText: cap.t,
    capCls: cap.cls,
    amountText: money(bet.amount),
    payoutText: money(bet.actual_payout),
    expectText: bet.expect_payout ? money(bet.expect_payout) : '',
    profitText: (profit > 0 ? '+' : '') + money(profit),
    profitCls: profit > 0 ? 'pos' : profit < 0 ? 'neg' : '',
  });
}

/* 腿结果指纹: result+finalScore 保序拼接(undefined 与 '' 等价) → "只写变化"判据, 无新信息零写库 */
function legsStamp(legs) {
  return (legs || []).map(function (leg) {
    return ((leg && leg.result) || '') + ':' + ((leg && leg.finalScore) || '');
  }).join('|');
}

Page({
  data: {
    loading: true,
    settling: false,
    errMsg: '',
    bets: [],
    stats: null,
    slipCanvasH: 600,
    // 编辑选项抽屉
    editOpen: false,
    editId: '',
    editLi: -1,
    editTitle: '',
    editOpts: [],
    editPreview: '',
    editSaving: false,
    // 整单修改模式(左滑删腿 + 倍数 + 金额累计) —— 与上面的抽屉是两套独立状态, 键名刻意不共用
    slipEditId: '',   // 正在修改的注单 id('' = 不在修改模式)
    slipLegs: [],     // 草稿腿(带 dx/dragging); 增删只动这里, 未保存前 _bets 原样不动
    slipMult: 1,      // 整单一个倍数(1~99)
    slipBase: 2,      // 单注(倍数作用在它身上 → unit = slipBase × slipMult)
    slipMoney: '',    // 草稿重算的金额行(注数 · 单注 · 投入, JS 预拼好字符串)
    slipSaving: false,
    todayLine: '',    // 统计卡下的「当日累计」一行
  },

  onShow() {
    this.load();
    this.startPoll();
  },

  onHide() {
    this.stopPoll();
    if (this.data.editOpen) this.closeEdit(); // 抽屉会跨 tab 存活, 离开时收起来
    if (this.data.slipEditId) this.cancelEdit(); // 修改模式同理(草稿不写库, 直接丢)
  },

  onUnload() {
    this.stopPoll();
  },

  onPullDownRefresh() {
    this.load();
  },

  /* 「↻ 刷新比分」手动重跑一轮(重拉登记表+自动结算) */
  refreshScores() {
    this.load();
  },

  /* 拉列表+渲染+自动结算; silent=true(轮询)时不置 loading/不闪横幅, 失败静默留给下一轮。
     ★_seq 版本号: 每重拉一次自增, 并透传给 autoSettle —— 在飞的旧轮次发现自己不再是"最新版本"
       就放弃全部回写。没有这道闸, "轮询拿到旧 legs → 卡在取分 2~5 秒 → 用户编辑保存 → 旧链子
       跑完用旧 legs 覆盖写库"(mini_update_bet 是无条件赋值, 无 WHERE 保护)会把编辑结果静默抹掉。 */
  load(silent) {
    if (!silent) this.setData({ loading: true, errMsg: '' });
    const seq = (this._seq = (this._seq || 0) + 1);
    return api
      .fetchBets()
      .then((bets) => {
        const list = Array.isArray(bets) ? bets : [];
        this._bets = list; // 原始数据(未 decorate), 供 pollTick 判"是否还有未完场腿"
        this.setData({
          bets: list.map(decorateBet),
          stats: settle.calcStats(list),
          todayLine: todayLineOf(list),
          loading: false,
        });
        this.stopPull();
        return this.autoSettle(list, silent, seq);
      })
      .catch((e) => {
        if (silent) return; // 静默轮失败不改视图, 下一轮自然重试
        this.setData({
          loading: false,
          errMsg: errText(e),
          bets: [],
          stats: settle.calcStats([]),
          todayLine: '',
        });
        this.stopPull();
      });
  },

  /* 自动结算一轮: 目标 = 还需查腿的注单(betNeedsPoll, 已判死的票也要继续补腿)。
     silent=true(轮询)时不动 settling 按钮态。_autoBusy 防与 onShow/下拉/轮询并发重复写库。
     seq: 本轮对应的 load 版本号(省略则取当前值); 期间重拉过列表 → 本轮快照作废, 全部回写放弃。
     _autoQueued: 被 _autoBusy 挡下的调用记一笔, 本轮收尾后立刻补跑(否则"编辑保存后要干等 5 分钟"
     才重判)。有界: 补跑前先清零, 不会自激。 */
  autoSettle(bets, silent, seq) {
    const self = this;
    const my = seq === undefined ? this._seq : seq;
    if (this._autoBusy) {
      this._autoQueued = true;
      return Promise.resolve();
    }
    const targets = (bets || []).filter(settle.betNeedsPoll);
    if (!targets.length) return Promise.resolve();
    this._autoBusy = true;
    if (!silent) this.setData({ settling: true });
    const payloadByDate = {}; // bet_date → payload | null(已查过)
    const scoreCache = {};    // bet_date|legKey → Promise<score|null>(同轮跨票去重)
    const boardCache = {};    // url → Promise<rows>(ESPN URL 级去重: 同联赛多腿只拉一次)
    let changed = false;

    /* URL 级去重取板器(espn.makeBoardFetcher): 同轮同联赛多腿只拉一次, 失败同样缓存
       ( fetchScoreForLeg 内部 try/catch 已吞)。★通道由 espn 内部决定(真机走云函数),
       这里**不能**自己包 defaultFetcher —— 那会绕过云通道回到真机必失败的直连。 */
    const boardFetcher = espn.makeBoardFetcher(boardCache);

    function payloadScore(betDate, key) {
      if (!(betDate in payloadByDate)) {
        return api.fetchPayloadByDate(betDate).catch(function () { return null; }).then(function (p) {
          payloadByDate[betDate] = p;
          return payloadScore(betDate, key);
        });
      }
      const p = payloadByDate[betDate];
      if (!p || !Array.isArray(p.matches)) return null;
      const m = p.matches.find(function (x) { return x && String(x.id || '').slice(-3) === key; });
      return (m && m.finalScore) || null;
    }

    function legScore(bet, leg) {
      const key = settle.legKey(leg);
      const dk = (bet.bet_date || '') + '|' + key;
      if (!(dk in scoreCache)) {
        // ★payload 优先(2026-10-12 起): prediction_days 由服务器每小时回填同步,
        //   完场比分既快又稳(真机 ESPN 云链断/慢时不用干等超时);
        //   服务端还没有比分(未完场/掉出两天窗口)→ 再走 ESPN 即时通道兜底。
        //   Promise.resolve 必须包: payloadScore 缓存命中路径返回裸字符串(非 Promise),
        //   直接 .then 会 TypeError 并被链上 catch 静默吞掉(整票永无回写)。
        scoreCache[dk] = Promise.resolve(payloadScore(bet.bet_date, key)).then(function (fs) {
          if (fs) return fs;
          return settle.fetchScoreForLeg(leg, bet.bet_date, boardFetcher);
        });
      }
      return scoreCache[dk];
    }

    let chain = Promise.resolve();
    targets.forEach(function (bet) {
      chain = chain.then(function () {
        // 版本号守卫: 这**一行**同时罩住下面两个写库分支(整票回写 / 腿级回写)。
        // 也顺带覆盖"慢 ESPN 撞下拉刷新"这一整类竞态。
        if (my !== self._seq) return;
        const legs = bet.legs || [];
        const scores = {};
        return legs
          .reduce(function (p, leg) {
            return p.then(function () {
              const key = settle.legKey(leg);
              if (settle.settleLeg(leg, leg.finalScore || null)) { scores[key] = leg.finalScore || null; return; }
              return legScore(bet, leg).then(function (fs) { scores[key] = fs; });
            });
          }, Promise.resolve())
          .then(function () {
            // ★版本号守卫(第二道, 必须有): 上面那道只在取分**之前**检查, 挡不住"已经过了闸门、
            //   卡在取分 2~5 秒"的链子 —— 而那正是"轮询拿到旧 legs → 用户编辑保存 → 旧链子跑完
            //   覆盖写库"的路径。写库前再查一次, 两道合起来才真正罩住两个写库分支。
            if (my !== self._seq) return;
            const scoreOf = function (k) { return k in scores ? scores[k] : null; };
            const res = settle.settleBet(bet, scoreOf);
            const unsettled = !bet.status || bet.status === 'pending';
            const nextLegs = legs.map(function (leg) {
              const key = settle.legKey(leg);
              const fs = key in scores ? scores[key] : null;
              const r = settle.settleLeg(leg, fs);
              return Object.assign({}, leg, {
                finalScore: fs || leg.finalScore || '',
                result: r || leg.result || null,
              });
            });

            /* 未结算票拿到结果(含"一腿 miss 提前判死") → 整票 5 字段回写 */
            if (unsettled && res) {
              Object.assign(bet, res); // 乐观更新先于 await
              changed = true;
              return api
                .updateBet(bet.id, {
                  status: res.status,
                  actual_payout: res.actual_payout,
                  profit: res.profit,
                  settled_at: res.settled_at,
                  legs: res.legs,
                })
                .catch(function () { /* 写库失败静默: 界面已正确, 下轮重读→指纹不等→自动重试 */ });
            }

            /* 腿级回写: 已判死票补腿 / 无 miss 部分完场。
               指纹不变(无新信息) → 零写库; 快照 4 原值随腿上送(SQL 是无条件赋值, 缺参数会写 NULL)。 */
            if (legsStamp(nextLegs) === legsStamp(bet.legs)) return;
            const snap = {
              status: bet.status,
              actual_payout: bet.actual_payout,
              profit: bet.profit,
              settled_at: bet.settled_at,
            };
            bet.legs = nextLegs; // 乐观更新先于 await
            changed = true;
            return api
              .updateBetLegs(bet.id, nextLegs, snap)
              .catch(function () { /* 写库失败静默, 同上 */ });
          })
          .catch(function () { /* 单注结算失败不阻断其他注单 */ });
      });
    });

    return chain
      .then(function () {
        if (changed) self.setData({ bets: bets.map(decorateBet), stats: settle.calcStats(bets) });
      })
      .catch(function () { /* 兜底: 视图刷新异常不锁死 _autoBusy */ })
      .then(function () {
        self._autoBusy = false;
        if (!silent) self.setData({ settling: false });
        if (self._autoQueued) { // 本轮期间被挡下的调用(编辑保存后的重判) → 立刻补跑
          self._autoQueued = false;
          self.autoSettle(self._bets, true, self._seq);
        }
      });
  },

  /* ---- 自动轮询(每 POLL_MS 静默结算一轮) ---- */
  startPoll() {
    this.stopPoll(); // 幂等: 重复 onShow 不叠加定时器
    // 仅在真实小程序环境启动(node 冒烟无 wx.request, 不启动防真实网络请求)
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') return;
    const self = this;
    this._pollTimer = setInterval(function () { self.pollTick(); }, POLL_MS);
    // node 冒烟环境: unref 防止定时器挂住进程(小程序 setInterval 返回数字, 无 unref)
    if (this._pollTimer && typeof this._pollTimer.unref === 'function') this._pollTimer.unref();
  },

  stopPoll() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  },

  /* 一轮轮询: 列表里没有"未完场腿"注单 → 一个请求都不发; 有则静默重拉+结算。
     返回 Promise(冒烟可 await 断言请求次数), 定时器回调忽略返回值。 */
  pollTick() {
    if (this._pollBusy) return Promise.resolve();
    const list = this._bets || [];
    if (!list.some(settle.betNeedsPoll)) return Promise.resolve();
    this._pollBusy = true;
    const self = this;
    return this.load(true).then(
      function () { self._pollBusy = false; },
      function () { self._pollBusy = false; }
    );
  },

  /* 按 uuid 找**原始** bet(未 decorate)。★一律用 id 而不是下标:
     data.bets 会被 load()/pollTick 整数组替换, 撞上这个窗口用下标会操作到别的票(删除不可逆);
     id 找不到就是无操作, 绝不会错行。 */
  findBet(id) {
    if (!id) return null;
    const list = this._bets || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  },

  /* 注卡「🖼 投注图」: 对该注单腿重出投注参考图并预览(真机长按保存/转发);
     _slipBusy 闸门防连点并发(共用 canvas 节点, 并发会互清缓冲出空白图) */
  previewSlip(e) {
    if (this._slipBusy) return;
    const bet = this.findBet((e.currentTarget.dataset || {}).id);
    if (!bet) return;
    this._slipBusy = true;
    const release = () => { this._slipBusy = false; };
    slipCanvas.renderSlip({ page: this, canvasId: 'slipCanvas', legs: bet.legs || [], unit: bet.unit || 2 })
      .then((p) => wx.previewImage({
        urls: [p],
        fail: () => wx.showToast({ title: '图片已生成, 预览失败', icon: 'none' }),
        complete: release, // 预览打开即释放, 不等用户关闭
      }))
      .catch(() => { wx.showToast({ title: '出图失败', icon: 'none' }); release(); });
  },

  /* ---- 编辑腿的 310 选项 ---- */

  /* 腿行「✎」: 打开底部抽屉。
     有码缺赔率(如登记时该场 SP 还没出, 或想"加"一个当时没选的码)→ 回拉当日推荐按 leg.id 补 sp/hhad。
     回拉后**当前已选项**仍有缺赔率的 → 拒绝开层(toast, 不开); 只有未选项缺 → 照开, 那些码置灰。
     拒绝的理由比"看起来不对"硬: 赔率空会让 legSpFactor 返回 0 → 整票照样判'hit' 但
     actual_payout=0、profit=-amount, 界面当下完全看不出坏, 而票已写成"命中/回收 0.00"、
     betNeedsPoll 又不会再碰它 —— 坏账几天后才暴露。 */
  openEdit(e) {
    const self = this;
    const ds = e.currentTarget.dataset || {};
    const bet = this.findBet(ds.id);
    const li = parseInt(ds.li, 10);
    if (!bet || !(li >= 0) || !Array.isArray(bet.legs) || !bet.legs[li]) return;
    const leg = bet.legs[li];
    if (!canEditLeg(leg)) return; // wxml 已用 canEdit 挡住, 这里再挡一道
    const seq = (this._editSeq = (this._editSeq || 0) + 1); // 令牌: 关层/重开 → 在飞回拉作废
    const title = leg.match || ((leg.home || '') + ' vs ' + (leg.away || ''));
    const noOdds = function (os) { return os.some(function (o) { return o.on && !o.odds; }); };

    const show = function (opts) {
      if (seq !== self._editSeq) return;
      self._editBet = bet;
      self._editLi = li;
      self._editLeg = leg;
      self.setData({
        editOpen: true, editId: bet.id, editLi: li, editTitle: title,
        editOpts: opts, editSaving: false, editPreview: previewOf(bet, li, leg, opts),
      });
    };
    const deny = function () {
      wx.showToast({ title: '赔率取不到, 暂不能改选项', icon: 'none' });
    };

    const opts = cart.optionsOf(leg, null);
    if (!opts.some(function (o) { return !o.odds; })) return show(opts); // 三档齐全 → 零网络
    // 北单腿不查 payload(matches 里没有北单场次), 只能靠腿自带 sp3
    const isBd = leg.handicap !== undefined && leg.handicap !== null && leg.handicap !== '';
    if (isBd) {
      if (noOdds(opts)) return deny();
      return show(opts);
    }
    api.fetchPayloadByDate(bet.bet_date).then(function (p) {
      if (seq !== self._editSeq) return;
      const opts2 = cart.optionsOf(leg, pickMatch(p, leg));
      if (noOdds(opts2)) return deny();
      show(opts2);
    }).catch(function () {
      if (seq !== self._editSeq) return;
      // 回拉失败但已选项赔率齐 → 仍可编辑(只是"加"不了缺赔率的码)
      if (noOdds(opts)) return deny();
      show(opts);
    });
  },

  /* 勾选/取消一个 310 选项(至少保留一个) */
  toggleOpt(e) {
    const code = (e.currentTarget.dataset || {}).code;
    const opts = this.data.editOpts || [];
    let idx = -1;
    for (let i = 0; i < opts.length; i++) if (opts[i].code === code) idx = i;
    if (idx < 0) return;
    const cur = opts[idx];
    if (cur.disabled) {
      wx.showToast({ title: '该选项暂无赔率, 不能选', icon: 'none' });
      return;
    }
    const on = !cur.on;
    let onCount = 0;
    opts.forEach(function (o) { if (o.on) onCount++; });
    if (!on && onCount <= 1) {
      wx.showToast({ title: '至少保留一个选项', icon: 'none' });
      return;
    }
    const next = opts.map(function (o, i) { return i === idx ? Object.assign({}, o, { on: on }) : o; });
    this.setData({ editOpts: next, editPreview: previewOf(this._editBet, this._editLi, this._editLeg, next) });
  },

  closeEdit() {
    if (this.data.editSaving) return; // 保存中不许关, 否则结果无处落地
    this._editSeq = (this._editSeq || 0) + 1; // 作废在飞的赔率回拉
    this._editBet = null;
    this._editLi = -1;
    this._editLeg = null;
    this.setData({ editOpen: false, editOpts: [], editTitle: '', editPreview: '', editSaving: false });
  },

  /* 保存: 重建这一腿 → 重算整票注数/投入/理论奖金 → mini_edit_bet(SQL 侧顺带重置为待结算)。
     ★腿取自 this._bets 的**当前**对象而非开层时的快照: 抽屉开着时轮询可能刚补进 finalScore,
       用快照会把它丢掉(而这正是"改完立刻按已有比分重判"的依据)。
     不做"选项没变就早退": 历史 jcHhad 误判票要靠这个功能重存一次来修正。 */
  saveEdit() {
    if (this.data.editSaving) return;
    const self = this;
    const bet = this.findBet(this.data.editId);
    const li = this.data.editLi;
    if (!bet || !(li >= 0) || !Array.isArray(bet.legs) || !bet.legs[li]) {
      wx.showToast({ title: '注单已不存在, 请下拉刷新', icon: 'none' });
      this.closeEdit();
      return;
    }
    const opts = this.data.editOpts || [];
    const codes = opts.filter(function (o) { return o.on; }).map(function (o) { return o.code; });
    if (!codes.length) {
      wx.showToast({ title: '至少选一个选项', icon: 'none' });
      return;
    }
    const by = {};
    opts.forEach(function (o) { by[o.code] = o.odds; });
    const leg = bet.legs[li];
    const newLeg = cart.applyPicks(leg, codes, by);
    if (!newLeg) {
      wx.showToast({ title: '选项无效, 请重开', icon: 'none' });
      return;
    }
    const newLegs = bet.legs.map(function (l, i) { return i === li ? newLeg : l; });
    const c = cart.calc(newLegs);
    const amount = Math.round(c.stakes * (parseFloat(bet.unit) || 2) * 100) / 100;
    this.setData({ editSaving: true });
    // 返回 promise 便于冒烟 await(bindtap 回调忽略返回值, 无副作用)
    return api.editBet(bet.id, { legs: newLegs, stakes: c.stakes, amount: amount, expect_payout: c.expectPayout })
      .then(function () {
        self._editSeq = (self._editSeq || 0) + 1;
        self._editBet = null;
        self._editLi = -1;
        self._editLeg = null;
        self.setData({ editSaving: false, editOpen: false, editOpts: [], editTitle: '', editPreview: '' });
        wx.showToast({ title: '已更新', icon: 'success' });
        // 静默重拉: 顺带用 _seq 作废在飞的旧结算回写, 并按新选项立即重判(改完回到待结算)
        self.load(true);
      })
      .catch(function (err) {
        self.setData({ editSaving: false }); // 一定要复位, 否则保存按钮永久禁用
        wx.showToast({ title: '保存失败: ' + errText(err).slice(0, 24), icon: 'none' });
      });
  },

  /* ---- 整单修改模式: 左滑删腿 + 倍数 + 金额累计 ----
     状态: 草稿(_slip:{id,bet,legs,baseUnit,mult}) + data.slipXxx(纯渲染镜像)。
     ★草稿必须放在 _slip/this._slipLegs 而不是 data.bets[i] 里 —— load()/pollTick 会把 data.bets
       整数组换成新对象(带 decorate 字段), 草稿混在里面会被轮询覆盖掉用户刚删的腿。 */

  /* 注卡「✏ 修改」: 进修改模式。同一时刻只允许一张票 —— 换票即丢弃上一张的草稿(未写库, 无损)。 */
  startEdit(e) {
    const id = (e.currentTarget.dataset || {}).id;
    const bet = this.findBet(id);
    if (!bet || !Array.isArray(bet.legs) || !bet.legs.length) return;
    if (this.data.slipSaving) return;
    if (this.data.editOpen) this.closeEdit(); // 与「改选项」抽屉互斥(都改同一张票, 同开必打架)
    const bu = betEdit.baseUnitOf(bet.unit);
    this._slip = { id: id, bet: bet, legs: bet.legs.slice(), baseUnit: bu.baseUnit, mult: bu.mult };
    const m = betEdit.moneyOf(this._slip.legs, bu.baseUnit, bu.mult);
    this.setData({
      slipEditId: id,
      slipLegs: this._slipRows(),
      slipBase: bu.baseUnit,
      slipMult: bu.mult,
      slipMoney: slipMoneyLine(m, bu.mult),
      slipSaving: false,
    });
  },

  /* 草稿腿 → 视图行(dx 归零: 删完一条后别的行不该还挂着「删除」) */
  _slipRows() {
    const legs = (this._slip && this._slip.legs) || [];
    return legs.map(function (l) {
      return Object.assign(legRowOf(l), { dx: 0, dragging: false });
    });
  },

  /* 草稿结构性变更(删腿)后: 重建行 + 重算金额 */
  _slipApply() {
    const s = this._slip;
    if (!s) return;
    const m = betEdit.moneyOf(s.legs, s.baseUnit, s.mult);
    this.setData({ slipLegs: this._slipRows(), slipMoney: slipMoneyLine(m, s.mult) });
  },

  /* 「取消」: 草稿直接丢, 库里的票一个字节都没动(删错腿的兜底) */
  cancelEdit() {
    if (this.data.slipSaving) return; // 保存中不许退, 否则结果无处落地
    this._slip = null;
    this._sw = null;
    this.setData({
      slipEditId: '', slipLegs: [], slipMult: 1, slipBase: betEdit.DEF_UNIT,
      slipMoney: '', slipSaving: false,
    });
  },

  /* 倍数 ±(整单一个倍数, 1~99) —— 只改单注金额 unit, 不动 expect_payout 的 ×2 口径 */
  stepMult(e) {
    const s = this._slip;
    if (!s || this.data.slipSaving) return;
    const next = betEdit.stepMult(s.mult, (e.currentTarget.dataset || {}).d);
    if (next === s.mult) {
      wx.showToast({ title: next >= betEdit.MAX_MULT ? '倍数上限 ' + betEdit.MAX_MULT : '倍数下限 ' + betEdit.MIN_MULT, icon: 'none' });
      return;
    }
    s.mult = next;
    const m = betEdit.moneyOf(s.legs, s.baseUnit, next);
    this.setData({ slipMult: next, slipMoney: slipMoneyLine(m, next) });
  },

  /* 左滑露出的「删除」被点: 删掉这条腿(只在草稿里; 保存前不写库)。
     删空 = 作废, 该走整单「🗑 删除」→ 拒绝并提示, 不静默存一张空票。 */
  delLegTap(e) {
    const s = this._slip;
    if (!s || this.data.slipSaving) return;
    const li = parseInt((e.currentTarget.dataset || {}).li, 10);
    const next = betEdit.delLeg(s.legs, li);
    if (!next) {
      wx.showToast({ title: '至少保留一关, 想作废请用「🗑 删除」', icon: 'none' });
      return;
    }
    s.legs = next;
    this._slipApply();
  },

  /* ---- 左滑手势(项目里无先例, 手写) ----
     小程序 touchmove 没有 preventDefault, 只能靠"不响应"给页面滚动让路: 方向锁判定竖向就完全不接管,
     确认横向才 setData 跟随。松手过半吸附出「删除」, 否则弹回。 */
  legTouchStart(e) {
    if (!this._slip || this.data.slipSaving) return;
    const t = (e.touches && e.touches[0]) || {};
    const li = parseInt((e.currentTarget.dataset || {}).li, 10);
    if (!(li >= 0)) return;
    const row = (this.data.slipLegs || [])[li] || {};
    this._sw = { li: li, x: t.clientX || 0, y: t.clientY || 0, dx0: row.dx || 0, dir: '' };
  },

  legTouchMove(e) {
    const sw = this._sw;
    if (!sw || !this._slip || this.data.slipSaving) return;
    const t = (e.touches && e.touches[0]) || {};
    const dx = (t.clientX || 0) - sw.x;
    const dy = (t.clientY || 0) - sw.y;
    if (!sw.dir) {
      sw.dir = betEdit.lockDir(dx, dy);
      if (sw.dir !== 'h') return; // 竖向/未定 → 放给页面滚动
      // 拖动中关掉过渡, 否则跟随有粘滞感; 松手时再打开做吸附动画
      this.setData({ ['slipLegs[' + sw.li + '].dragging']: true });
    }
    if (sw.dir !== 'h') return;
    const v = betEdit.clampDx(sw.dx0 + dx);
    const cur = ((this.data.slipLegs || [])[sw.li] || {}).dx || 0;
    if (Math.abs(v - cur) < 2) return; // 位移不足 2rpx 不 setData(高频事件省渲染)
    this.setData({ ['slipLegs[' + sw.li + '].dx']: v });
  },

  legTouchEnd() {
    const sw = this._sw;
    this._sw = null;
    if (!sw || !this._slip || sw.dir !== 'h') return;
    const row = (this.data.slipLegs || [])[sw.li] || {};
    const v = betEdit.snapDx(row.dx || 0);
    const patch = { ['slipLegs[' + sw.li + '].dragging']: false };
    if (v !== (row.dx || 0)) patch['slipLegs[' + sw.li + '].dx'] = v;
    this.setData(patch);
  },

  /* 「保存」: 草稿腿 → 重算注数/投入 → mini_edit_bet(倍数折进 unit) → 弹本单金额+当日累计 → 静默重拉。
     ★unit 只在真改了倍数时才送上: p_unit 是后加的尾参, 老库没升级时不送 → 其余路径零感知;
       真改了倍数却没升级 → RPC 404, 这里明确告知, 绝不会写出"金额三倍、奖金一倍"的坏账。
     ★单注/倍数口径: unit = slipBase × slipMult; settle.js 结算就是 acc = unit × ∏legSpFactor。 */
  saveSlip() {
    const self = this;
    const s = this._slip;
    if (!s || this.data.slipSaving) return;
    const bet = this.findBet(s.id) || s.bet;
    if (!bet || !Array.isArray(s.legs) || !s.legs.length) {
      wx.showToast({ title: '注单已不存在, 请下拉刷新', icon: 'none' });
      this.cancelEdit();
      return;
    }
    const c = cart.calc(s.legs);
    const m = betEdit.moneyOf(s.legs, s.baseUnit, s.mult);
    const oldUnit = Math.round((parseFloat(bet.unit) || betEdit.DEF_UNIT) * 100) / 100;
    const patch = { legs: s.legs, stakes: c.stakes, amount: m.amount, expect_payout: c.expectPayout };
    if (m.unit !== oldUnit) patch.unit = m.unit;
    this.setData({ slipSaving: true });
    // 返回 promise 便于冒烟 await(bindtap 回调忽略返回值, 无副作用)
    return api.editBet(s.id, patch)
      .then(function () {
        // 就地更新本地这张票 → 弹窗里的"当日累计"、统计卡、列表立刻是新数, 不等 load 回来
        const local = self.findBet(s.id);
        if (local) {
          local.legs = s.legs;
          local.stakes = c.stakes;
          local.unit = m.unit;
          local.amount = m.amount;
          local.expect_payout = c.expectPayout;
          local.status = 'pending'; // 与 SQL 侧一致(改完重来)
          local.actual_payout = 0;
          local.profit = 0;
          local.settled_at = null;
        }
        const list = self._bets || [];
        const t = betEdit.todaySum(list);
        self._slip = null;
        self._sw = null;
        self.setData({
          bets: list.map(decorateBet),
          stats: settle.calcStats(list),
          todayLine: todayLineOf(list),
          slipEditId: '', slipLegs: [], slipMult: 1, slipBase: betEdit.DEF_UNIT,
          slipMoney: '', slipSaving: false,
        });
        wx.showModal({
          title: '已保存',
          content: '本单金额 ' + money(m.amount) + ' 元' +
            (m.unit !== oldUnit ? '(单注 ' + money(m.unit) + ' 元' + (s.mult > 1 ? ' · ' + s.mult + ' 倍' : '') + ')' : '') +
            '\n' + (t.date ? t.date.slice(5) + ' 当日累计 ' + money(t.amount) + ' 元 · ' + t.count + ' 单' : ''),
          showCancel: false,
          confirmText: '好',
        });
        // 静默重拉: 顺带用 _seq 作废在飞的旧结算回写, 并按新腿立即重判(改完回到待结算)
        self.load(true);
      })
      .catch(function (err) {
        self.setData({ slipSaving: false }); // 一定要复位, 否则保存按钮永久禁用
        const msg = String((err && err.message) || err || '');
        if (/HTTP 404|PGRST202/.test(msg)) {
          wx.showModal({
            title: '本次修改没有写入',
            content: '改倍数要先更新数据库函数 mini_edit_bet(见 supabase/mini_rpc.sql), 在 Supabase SQL 编辑器整段重跑一次即可。',
            showCancel: false,
            confirmText: '好',
          });
          return;
        }
        wx.showToast({ title: '保存失败: ' + errText(err).slice(0, 24), icon: 'none' });
      });
  },

  /* 「🗑 删除」: 确认弹窗 → 库里真删 → 本地同步(_bets + bets + stats 一起改,
     否则 pollTick 还会为已删票发请求) */
  removeBet(e) {
    const self = this;
    const id = (e.currentTarget.dataset || {}).id;
    const bet = this.findBet(id);
    if (!bet) return;
    wx.showModal({
      title: '删除注单',
      content: '删除后不可恢复(' + (bet.bet_date || '') + ' ' + (parseInt(bet.stakes, 10) || 0) +
        '注 · 投入' + money(bet.amount) + '元), 确认删除?',
      confirmText: '删除',
      cancelText: '取消',
      confirmColor: '#F25C5C',
      success: function (m) {
        if (!m.confirm) return;
        if (self._delBusy) return;
        self._delBusy = true;
        api.deleteBet(id)
          .then(function () {
            self._delBusy = false;
            self._bets = (self._bets || []).filter(function (b) { return !b || b.id !== id; });
            self.setData({
              bets: self._bets.map(decorateBet),
              stats: settle.calcStats(self._bets),
              todayLine: todayLineOf(self._bets),
            });
            wx.showToast({ title: '已删除', icon: 'success' });
          })
          .catch(function (err) {
            self._delBusy = false;
            // 必须 toast: 真机"忘了 redeploy 云函数"的表现就是这里静默无反应
            wx.showToast({ title: '删除失败: ' + errText(err).slice(0, 24), icon: 'none' });
          });
      },
    });
  },

  stopPull() {
    try {
      wx.stopPullDownRefresh();
    } catch (e) { /* 非下拉触发时调用无害 */ }
  },
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decorateBet, errText, canEditLeg, pickMatch, previewOf, legRowOf, todayLineOf };
}
