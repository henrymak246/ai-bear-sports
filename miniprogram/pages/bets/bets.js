/* pages/bets/bets.js — 我的投注
 * onShow: api.fetchBets → 成功渲染统计卡+列表并自动结算 pending 注单;
 *   失败(404 表未建/网络异常)降级横幅+空列表不崩。
 * 自动结算: pending 注单逐腿 fetchScoreForLeg(ESPN, 死链回退 prediction_days 当日
 *   finalScore) → 全腿完场 settleBet → api.updateBet 回写 → 刷新; 部分完场仅腿级
 *   result 就地展示不写库。「↻ 刷新比分」手动重跑一轮。 */
const api = require('../../utils/api.js');
const settle = require('../../utils/settle.js');

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

/* bet → 视图模型(展示字符串在此预拼接, WXML 只做插值) */
function decorateBet(bet) {
  const src = SRC[bet.source] || { label: bet.source || '?', cls: 'badge-gray' };
  const legRows = (bet.legs || []).map(function (leg) {
    const mark = RESULT_MARK[leg.result] || { t: '待', cls: 'judge-pending' };
    return {
      matchText: leg.match || ((leg.home || '') + ' vs ' + (leg.away || '')),
      finalScore: leg.finalScore || '',
      pickText: leg.pick || '',
      oddsText: leg.odds !== undefined && leg.odds !== null ? String(leg.odds) : '',
      bdNumText: leg.bdNum ? '北单' + leg.bdNum : '',
      mark: mark.t,
      markCls: mark.cls,
    };
  });
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

Page({
  data: {
    loading: true,
    settling: false,
    errMsg: '',
    bets: [],
    stats: null,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load();
  },

  /* 「↻ 刷新比分」手动重跑一轮(重拉登记表+自动结算) */
  refreshScores() {
    this.load();
  },

  load() {
    this.setData({ loading: true, errMsg: '' });
    return api
      .fetchBets()
      .then((bets) => {
        const list = Array.isArray(bets) ? bets : [];
        this.setData({ bets: list.map(decorateBet), stats: settle.calcStats(list), loading: false });
        this.stopPull();
        return this.autoSettle(list);
      })
      .catch((e) => {
        this.setData({
          loading: false,
          errMsg: errText(e),
          bets: [],
          stats: settle.calcStats([]),
        });
        this.stopPull();
      });
  },

  /* pending 注单自动结算一轮; 有回写/腿级变化则刷新视图 */
  autoSettle(bets) {
    const self = this;
    const pendings = (bets || []).filter(function (b) { return b.status === 'pending'; });
    if (!pendings.length) return Promise.resolve();
    this.setData({ settling: true });
    const payloadByDate = {}; // bet_date → payload | null(已查过)
    let changed = false;

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
      return settle.fetchScoreForLeg(leg, bet.bet_date).then(function (fs) {
        if (fs) return fs;
        return payloadScore(bet.bet_date, key); // 死链联赛/未命中回退当日推荐 finalScore
      });
    }

    let chain = Promise.resolve();
    pendings.forEach(function (bet) {
      chain = chain.then(function () {
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
            const scoreOf = function (k) { return k in scores ? scores[k] : null; };
            const res = settle.settleBet(bet, scoreOf);
            if (res) {
              return api
                .updateBet(bet.id, {
                  status: res.status,
                  actual_payout: res.actual_payout,
                  profit: res.profit,
                  settled_at: res.settled_at,
                  legs: res.legs,
                })
                .then(function () {
                  Object.assign(bet, res);
                  changed = true;
                });
            }
            // 部分完场: 腿级 result 就地展示, 不写库
            bet.legs = legs.map(function (leg) {
              const key = settle.legKey(leg);
              const fs = key in scores ? scores[key] : null;
              const r = settle.settleLeg(leg, fs);
              return Object.assign({}, leg, {
                finalScore: fs || leg.finalScore || '',
                result: r || leg.result || null,
              });
            });
            changed = true;
          })
          .catch(function () { /* 单注结算失败不阻断其他注单 */ });
      });
    });

    return chain.then(function () {
      if (changed) self.setData({ bets: bets.map(decorateBet), stats: settle.calcStats(bets) });
      self.setData({ settling: false });
    });
  },

  stopPull() {
    try {
      wx.stopPullDownRefresh();
    } catch (e) { /* 非下拉触发时调用无害 */ }
  },
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { decorateBet, errText };
}
