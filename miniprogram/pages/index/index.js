/* pages/index/index.js — 推荐页(三 Tab: 🎫竞彩 / 🀄北单 / 🌏亚盘)
 * 数据流: onShow/onPullDownRefresh → api.fetchTodayPayload → 成功渲染+写缓存;
 *   失败读 payloadCache 缓存渲染+错误横幅, 无缓存则提示下拉重试。
 * 分组逻辑抽成纯函数 buildGroups(payload, judge) 并经 module.exports 导出,
 * 供 node 冒烟(tools/_smoke_mini_page.js)直接断言。 */
const api = require('../../utils/api.js');
const judge = require('../../utils/judge.js');
const fmt = require('../../utils/fmt.js');
const scorePoller = require('../../utils/scorePoller.js');
const cart = require('../../utils/cart.js');

const BADGE_CLASS = { '胆': 'badge-gold', '单选': 'badge-red', '双选': 'badge-blue', '弃选': 'badge-gray' };
const JUDGE_LABEL = { hit: '✓', miss: '✗', push: '走' };
const JUDGE_CLASS = { hit: 'judge-hit', miss: 'judge-miss', push: 'judge-pending' };

function nowText() {
  const d = new Date();
  const p = (n) => (n < 10 ? '0' : '') + n;
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/* 纯函数: payload → 三 Tab 视图组(展示字符串在此预拼接, WXML 只做插值) */
function buildGroups(payload, judgeLib) {
  const J = judgeLib || judge;
  const groups = { jc: [], bd: [], ah: [] };
  if (!payload) return groups;
  const matches = payload.matches || [];

  // 北单腿按 leg.match 前三位 ↔ match.id 后三位找当日 finalScore
  const scoreById3 = {};
  matches.forEach((m) => {
    if (m && m.id) scoreById3[String(m.id).slice(-3)] = m.finalScore || null;
  });

  // 🎫 竞彩组: 全部场次
  groups.jc = matches.map((m) => {
    const hhadText = fmt.fmtSp(m.hhad);
    const hcap = m.spHandicap;
    return {
      id: m.id || '',
      league: m.league || '',
      time: m.time || '',
      home: m.home || '',
      away: m.away || '',
      direction: m.direction || '',
      dirTag: m.dirTag || '',
      badgeClass: BADGE_CLASS[m.dirTag] || 'badge-gray',
      stars: fmt.fmtStars(m.confidence),
      spText: fmt.fmtSp(m.sp),
      hhadText: hhadText ? '让' + (hcap > 0 ? '+' + hcap : hcap) + ' ' + hhadText : '',
      overUnder: m.overUnder || '',
      ttgSp: m.ttgSp || '',
      scoreText: (m.score || []).join(' / '),
      note: m.note || '',
      liveScore: '', // Wave2 槽位, 恒空, 模板显示 {{liveScore || time}}
    };
  });

  // 🀄 北单组: beidan310.legs 逐腿(含判定)
  const bd = payload.beidan310;
  if (bd && Array.isArray(bd.legs)) {
    groups.bd = bd.legs.map((leg) => {
      const matchStr = String(leg.match || '');
      const id3 = matchStr.slice(0, 3);
      const parts = matchStr.split(/\s+vs\s+/);
      const finalScore = scoreById3[id3] || leg.finalScore || null;
      const r = J.judgeBd310(leg.pick, leg.handicap, finalScore, leg.result);
      return {
        bdNum: leg.bdNum || id3,
        home: parts[0] ? parts[0].replace(/^\d+\s*/, '') : matchStr,
        away: parts[1] || '',
        handicap: leg.handicap || '0',
        pick: leg.pick || '',
        odds: leg.odds || '',
        sp3: leg.sp3 || [],
        reason: leg.reason || '',
        finalScore: finalScore || '',
        judge: r,
        judgeLabel: r ? JUDGE_LABEL[r] : '待赛',
        judgeClass: r ? JUDGE_CLASS[r] : 'judge-pending',
      };
    });
  }

  // 🌏 亚盘组: 仅 ahPick 非空的场(V3.3 收紧口径, 无信号场不显示)
  groups.ah = matches
    .filter((m) => m && m.ahPick)
    .map((m) => ({
      id: m.id || '',
      league: m.league || '',
      time: m.time || '',
      home: m.home || '',
      away: m.away || '',
      ahPick: m.ahPick || '',
      ahStars: fmt.fmtStars(m.ahConf),
      ouPick: m.ouPick || '',
      ouStars: m.ouPick ? fmt.fmtStars(m.ouConf) : '',
      ahName: m.ah ? m.ah.name : '',
      ahHome: m.ah ? m.ah.home : '',
      ahAway: m.ah ? m.ah.away : '',
      ouName: m.ouOdds ? m.ouOdds.name : '',
      ouOver: m.ouOdds ? m.ouOdds.over : '',
      ouUnder: m.ouOdds ? m.ouOdds.under : '',
    }));

  return groups;
}

Page({
  data: {
    tab: 'jc', // jc | bd | ah
    payload: null,
    errMsg: '',
    loading: true,
    lastUpdated: '',
    groups: { jc: [], bd: [], ah: [] },
    // 以下为渲染派生字段(renderPayload 时一并写入)
    planJc: [],
    planBd: [],
    bdNote: '',
    bdDisabled: true,
    dailyTitle: '',
    noteMap: {}, // 备注展开状态, key=match.id
    scoreStatus: '', // 比分轮询状态: 滚动更新中 / 已暂停
    // 组串登记
    cartMode: false, // 勾选态
    cartOpen: false, // 组串抽屉
    cartSel: {}, // key → leg; key='jc:'+id / 'bd:'+bdNum / 'ah:'+id
    cartLegs: [], // cartSel 的数组形态(带 _key)
    cartCount: 0,
    cartCalc: { stakes: 0, expectPayout: 0 },
    cartUnit: 2, // 单注金额输入(默认 2 元)
    cartAmount: 0, // stakes × cartUnit(本期倍数=1)
    sourceBadge: '', // bd / ah / jc
    jcKindMap: {}, // match.id → 'had' | 'hhad'(⇄ 切换, 默认 had)
  },

  onShow() {
    this.load();
    this.checkBetDraft();
  },

  onHide() {
    this.stopScores();
  },

  onUnload() {
    this.stopScores();
  },

  onPullDownRefresh() {
    this.load();
  },

  load() {
    this.setData({ loading: true, errMsg: '' });
    api
      .fetchTodayPayload()
      .then((payload) => {
        if (!payload) throw new Error('empty payload');
        try {
          wx.setStorageSync('payloadCache', payload);
        } catch (e) { /* 缓存写失败不阻塞 */ }
        this.renderPayload(payload, '');
      })
      .catch(() => {
        let cache = null;
        try {
          cache = wx.getStorageSync('payloadCache');
        } catch (e) { /* ignore */ }
        if (cache) {
          this.renderPayload(cache, '推荐数据拉取失败,显示缓存');
        } else {
          this.setData({
            loading: false,
            payload: null,
            groups: { jc: [], bd: [], ah: [] },
            planJc: [],
            planBd: [],
            bdNote: '',
            bdDisabled: true,
            dailyTitle: '',
            errMsg: '请检查网络后下拉重试',
          });
          this.stopPullDown();
        }
      });
  },

  renderPayload(payload, errMsg) {
    const plan = payload.plan || [];
    const bd = payload.beidan310;
    this.setData({
      payload,
      groups: buildGroups(payload, judge),
      planJc: plan.filter((p) => p.market === 'jc'),
      planBd: plan.filter((p) => p.market === 'bd'),
      bdNote: (bd && bd.note) || '',
      bdDisabled: !(bd && Array.isArray(bd.legs) && bd.legs.length),
      dailyTitle: (payload.dailyPost && payload.dailyPost.title) || '',
      errMsg,
      loading: false,
      lastUpdated: nowText(),
    });
    this.stopPullDown();
    this.startScores();
  },

  /* ---- 比分轮询 ---- */
  startScores() {
    this.stopScores(true); // 静默停旧轮询
    const payload = this.data.payload;
    if (!payload || !Array.isArray(payload.matches) || !payload.matches.length) return;
    // 仅在真实小程序环境启动(node 冒烟无 wx.request, 不启动防真实网络请求)
    if (typeof wx === 'undefined' || typeof wx.request !== 'function') return;
    this._pollMatches = payload.matches.map((m) => ({
      id: m.id || '',
      league: m.league || '',
      home: m.home || '',
      away: m.away || '',
      finalScore: m.finalScore || '',
      liveScore: '',
      liveSt: '',
    }));
    const self = this;
    this._poller = scorePoller.createScorePoller({
      getMatches: () => self._pollMatches || [],
      onUpdate: (changed) => self.applyScores(changed),
    });
    this._poller.start();
    this.setData({ scoreStatus: '滚动更新中' });
  },

  /* 仅更新变化场(按 groups.jc 下标路径 setData, 不全量替换) */
  applyScores(changed) {
    const list = this.data.groups.jc;
    const patch = {};
    (changed || []).forEach((m) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === m.id) {
          patch['groups.jc[' + i + '].liveScore'] = m.liveScore;
          patch['groups.jc[' + i + '].liveSt'] = m.liveSt;
          break;
        }
      }
    });
    if (Object.keys(patch).length) this.setData(patch);
  },

  stopScores(silent) {
    if (this._poller) {
      this._poller.stop();
      this._poller = null;
    }
    if (!silent && this.data.scoreStatus) this.setData({ scoreStatus: '已暂停' });
  },

  /* ---- 组串登记 ---- */
  toggleCartMode() {
    this.setData({ cartMode: !this.data.cartMode, cartOpen: false });
  },

  openCart() {
    if (!this.data.cartCount) {
      wx.showToast({ title: '先勾选场次再组串', icon: 'none' });
      return;
    }
    this.setData({ cartOpen: true });
  },

  closeCart() {
    this.setData({ cartOpen: false });
  },

  toggleCart(e) {
    const d = e.currentTarget.dataset;
    const sel = Object.assign({}, this.data.cartSel);
    if (sel[d.key]) {
      delete sel[d.key];
    } else {
      const leg = this.makeLeg(d);
      if (!leg) return;
      sel[d.key] = leg;
    }
    this.commitCart(sel);
  },

  makeLeg(d) {
    const payload = this.data.payload || {};
    if (d.type === 'bd') {
      const legs = (payload.beidan310 && payload.beidan310.legs) || [];
      const raw = legs.find((l) => String(l.bdNum || '') === String(d.bdnum));
      return raw ? cart.buildLeg(raw, 'bd') : null;
    }
    const m = (payload.matches || []).find((x) => x.id === d.id);
    if (!m) return null;
    if (d.type === 'ah') return cart.buildLeg(m, 'ah');
    const kind = this.data.jcKindMap[d.id] === 'hhad' ? 'jcHhad' : 'jcHad';
    return cart.buildLeg(m, kind);
  },

  /* ⇄ 切换竞彩腿 had/hhad; 已勾选则按新腿型重建 */
  switchJcKind(e) {
    const id = e.currentTarget.dataset.id;
    const map = Object.assign({}, this.data.jcKindMap);
    map[id] = map[id] === 'hhad' ? 'had' : 'hhad';
    this.setData({ jcKindMap: map });
    const key = 'jc:' + id;
    if (this.data.cartSel[key]) {
      const m = ((this.data.payload || {}).matches || []).find((x) => x.id === id);
      if (m) {
        const sel = Object.assign({}, this.data.cartSel);
        sel[key] = cart.buildLeg(m, map[id] === 'hhad' ? 'jcHhad' : 'jcHad');
        this.commitCart(sel);
      }
    }
  },

  removeLeg(e) {
    const key = e.currentTarget.dataset.key;
    const sel = Object.assign({}, this.data.cartSel);
    delete sel[key];
    this.commitCart(sel);
  },

  /* 选中集 → 派生字段(腿数组/计数/注数/理论奖金/来源/金额) */
  commitCart(sel) {
    const legs = Object.keys(sel).map((k) => Object.assign({ _key: k }, sel[k]));
    const c = cart.calc(legs);
    const unit = parseFloat(this.data.cartUnit) || 2;
    this.setData({
      cartSel: sel,
      cartLegs: legs,
      cartCount: legs.length,
      cartCalc: c,
      cartAmount: c.stakes * unit,
      sourceBadge: legs.length ? cart.detectSource(legs) : '',
    });
  },

  onCartUnitInput(e) {
    const v = e.detail.value;
    const unit = parseFloat(v) || 2;
    this.setData({ cartUnit: v, cartAmount: this.data.cartCalc.stakes * unit });
  },

  saveCart() {
    if (!this.data.cartLegs.length) {
      wx.showToast({ title: '请先勾选场次', icon: 'none' });
      return;
    }
    const c = this.data.cartCalc;
    const unit = parseFloat(this.data.cartUnit) || 2;
    const legs = this.data.cartLegs.map((l) => {
      const x = Object.assign({}, l);
      delete x._key;
      return x;
    });
    const bet = {
      bet_date: (this.data.payload && this.data.payload.date) || '',
      source: cart.detectSource(legs),
      legs,
      stakes: c.stakes,
      unit: 2,
      amount: Math.round(c.stakes * unit * 100) / 100, // 本期倍数=1
      expect_payout: c.expectPayout,
    };
    const self = this;
    api.saveBet(bet)
      .then(() => {
        try { wx.removeStorageSync('betDraft'); } catch (e) { /* ignore */ }
        wx.showToast({ title: '已登记', icon: 'success' });
        self.commitCart({});
        self.setData({ cartOpen: false, cartMode: false });
      })
      .catch(() => {
        try { wx.setStorageSync('betDraft', bet); } catch (e) { /* ignore */ }
        wx.showToast({ title: '保存失败已存草稿', icon: 'none' });
      });
  },

  /* onShow 检测未保存草稿, 弹窗一键重试(每次会话只提示一次) */
  checkBetDraft() {
    if (this._draftPrompted) return;
    let draft = null;
    try { draft = wx.getStorageSync('betDraft'); } catch (e) { /* ignore */ }
    if (!draft) return;
    this._draftPrompted = true;
    wx.showModal({
      title: '投注草稿',
      content: '存在未保存的组串登记(' + (draft.bet_date || '未知日期') + '), 是否一键重试?',
      confirmText: '重试',
      cancelText: '忽略',
      success(m) {
        if (!m.confirm) return;
        api.saveBet(draft)
          .then(() => {
            try { wx.removeStorageSync('betDraft'); } catch (e) { /* ignore */ }
            wx.showToast({ title: '已登记', icon: 'success' });
          })
          .catch(() => {
            wx.showToast({ title: '仍失败,草稿已保留', icon: 'none' });
          });
      },
    });
  },

  stopPullDown() {
    try {
      wx.stopPullDownRefresh();
    } catch (e) { /* 非下拉触发时调用无害 */ }
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'bd' && this.data.bdDisabled) return;
    this.setData({ tab });
  },

  toggleNote(e) {
    const id = e.currentTarget.dataset.id;
    const noteMap = Object.assign({}, this.data.noteMap);
    noteMap[id] = !noteMap[id];
    this.setData({ noteMap });
  },
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { buildGroups };
}
