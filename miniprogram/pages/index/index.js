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
const slipCanvas = require('../../utils/slipCanvas.js');
const jc = require('../../utils/jc.js');

const BADGE_CLASS = { '胆': 'badge-gold', '单选': 'badge-red', '双选': 'badge-blue', '弃选': 'badge-gray', '让球': 'badge-rang' };
const JUDGE_LABEL = { hit: '✓', miss: '✗', push: '走' };
const JUDGE_CLASS = { hit: 'judge-hit', miss: 'judge-miss', push: 'judge-pending' };

/* 方向词转官方口径(2026-09-15 用户拿体彩足球计算器截图拍板; 站点 index.html offDir 同款):
   数据里的 '主胜'/'客胜' 只是内部字段, 卡片上写官方的 胜/平/负 —— 官方从不写"主客"
   (胜/负 本身就是相对主队说的), 让球盘写 让球胜/让球平/让球负(图里 009=让球胜(1.68)/013=让球负(2.10))。 */
const DIR_OFF = { '主胜': '胜', '客胜': '负', '平': '平' };
function offDir(direction, hhadK) {
  return String(direction || '').split('/').map((s) => {
    const t = DIR_OFF[s.trim()];
    if (!t) return s; // 认不出的词(弃选/文字方向)原样保留, 不硬改
    return hhadK ? (t === '平' ? '让球平' : '让球' + t) : t;
  }).join('/');
}

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
    const hcapText = '让' + (hcap > 0 ? '+' + hcap : hcap);
    /* 官方只开了让球、没开胜平负(见 utils/jc.js noHadOf): 卡片上原本顶着一个**投不了的**
       胜平负方向(2026-09-15 用户拿 013 埃尔切vs皇马 指出)。改成让球口径: 徽章换「让球」,
       方向前缀让球线 + 官方口径词 —— '让+2 让球负'。 */
    const noHad = jc.noHadOf(m);
    const dir = m.direction || '';
    const playable = hhadText; // 有让球SP 才谈得上"可投的是让球"
    // 弃选场不抢 弃选 徽章(那是更强的判断); 其余让球-only 场把徽章换成「让球」
    const badge = noHad && playable && m.dirTag !== '弃选' ? '让球' : (m.dirTag || '');
    const hhadDir = noHad && playable; // 让球-only 场: 方向走让球口径(让球胜/让球负)
    const spTxt = fmt.fmtSp(m.sp);
    return {
      id: m.id || '',
      league: m.league || '',
      time: m.time || '',
      home: m.home || '',
      away: m.away || '',
      noHad,
      direction: dir ? (hhadDir ? hcapText + ' ' + offDir(dir, true) : offDir(dir, false)) : dir,
      dirTag: badge,
      badgeClass: BADGE_CLASS[badge] || 'badge-gray',
      // 让球-only 才有的一句提醒; WXML 只做插值(本文件既有约定), 整串文案在这里拼好
      //   (用户截图里 013 选的正是"让球负" —— 上面那个方向本身就是可投的那一注, 不是"投不了")
      noHadTip: noHad && playable
        ? '※ 官方未开胜平负: 可投的就是「' + (offDir(dir, true) || '让球') + '」(下行让球胜负)'
        : '',
      stars: fmt.fmtStars(m.confidence),
      // 两个盘各写一行(2026-09-15 用户拍板, 照体彩计算器的两行盘口): 胜负 / 让球胜负(盘口)
      spText: spTxt,
      spLine: '胜负 ' + (spTxt || (noHad && playable ? '无(官方未开)' : '未开售')),
      spBlank: !spTxt, // WXML 用它把"无/未开售"挂成灰字(od-nohad), 有赔率时不挂
      hhadText,
      hhadLine: hhadText ? '让球胜负(' + hcapText + ') ' + hhadText : '',
      overUnder: m.overUnder || '',
      ttgSp: m.ttgSp || '',
      scoreText: (m.score || []).join(' / '),
      note: m.note || '',
      liveScore: '', // Wave2 槽位, 恒空, 模板显示 {{liveScore || time}}
      // 竞彩赔率时效(见 utils/jc.js): sp/hhad 是构建时快照, 官方之后还会浮动;
      // 拉不到实时值(离线/未部署)时 oddsLive 为假, 页面照旧显示快照, 只是不打"官方实时"角标。
      oddsLive: !!m.oddsLive,
      oddsClosed: !!m.oddsClosed, // 不在官方实时池里 = 已过销售截止被下架 → 禁投
      oddsUpd: m.oddsUpd || '',
      // WXML 只做插值(本文件既有约定): 时效行的整串文案在这里拼好
      oddsTip: m.oddsClosed ? '已停售 · 官方已下架'
        : (m.oddsLive ? '赔率官方实时' + (m.oddsUpd ? ' ' + m.oddsUpd : '') : ''),
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
    slipCanvasH: 600, // 投注图 canvas CSS 高(renderSlip 动态覆写)
    lastSlipPath: '', // 最近出图 tempFilePath(验收断言用)
    cartAmount: 0, // stakes × cartUnit(本期倍数=1)
    sourceBadge: '', // bd / ah / jc
    jcKindMap: {}, // match.id → 'had' | 'hhad'(⇄ 切换, 默认 had)
    oddsStatus: '', // 赔率口径角标: '官方实时' / '实时取数失败' / ''(非今日, 不显示)
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
      .catch((e) => {
        const reason = '拉取失败: ' + ((e && e.message) || e || '未知错误');
        let cache = null;
        try {
          cache = wx.getStorageSync('payloadCache');
        } catch (e2) { /* ignore */ }
        if (cache) {
          this.renderPayload(cache, '推荐数据拉取失败,显示缓存 (' + reason + ')');
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
            errMsg: reason,
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
    this.refreshLiveOdds(payload);
  },

  /* 竞彩赔率实时化(见 utils/jc.js): **先把构建时快照渲染出去**(首屏不等网络),
     再后台拉官方实时值叠加; 拉到就原地换成实时数, 拉不到就保持快照 + 顶部标注,
     绝不让一次网络失败把页面变白或把赔率清空。
     _liveSeq 防串: 快速下拉两次会同时有两个请求在飞, 先发的后到会把新数据盖成旧数据。 */
  refreshLiveOdds(payload) {
    if (!jc.isToday(payload && payload.date)) return; // 补看历史某天: 官方池里当然没有那些场次, 不叠加
    if (typeof wx === 'undefined' || !wx.cloud) return; // node 冒烟环境不发网络
    const seq = (this._liveSeq || 0) + 1;
    this._liveSeq = seq;
    const self = this;
    jc.fetchAndOverlay(payload)
      .then((r) => {
        if (self._liveSeq !== seq) return; // 已有更新的加载在飞, 丢弃这次结果
        if (r.error || !r.live) {
          self.setData({ oddsStatus: '实时取数失败, 显示构建时快照' });
          return;
        }
        const next = Object.assign({}, payload, { matches: r.matches });
        // 方案块与方案卡大号倍数跟着走(见 jc.planPatch): 只刷场次卡而不动 '≈858倍',
        // 卡片上就是"一列新赔率配一个旧倍数", 用户一乘就说不对
        const pp = jc.planPatch(payload, r.matches);
        if (pp) Object.assign(next, { plan: pp.plan, hc7: pp.hc7, max7: pp.max7, combo7: pp.combo7 });
        const groups = buildGroups(next, judge);
        // buildGroups 会把 liveScore 清空, 而比分轮询是按下标增量写 groups.jc 的 ——
        // 这里把已滚出来的比分按 id 搬回来, 免得每次叠加赔率都把场上比分闪没一下
        const old = self.data.groups.jc || [];
        groups.jc.forEach((g) => {
          const p = old.find((x) => x.id === g.id);
          if (p && p.liveScore) { g.liveScore = p.liveScore; g.liveSt = p.liveSt; }
        });
        const patch = { payload: next, groups, oddsStatus: '官方实时' };
        // planJc/planBd 是从 payload.plan 过滤出来的副本, 大号倍数换了这里必须同步重取
        if (pp) {
          patch.planJc = (pp.plan || []).filter((p) => p.market === 'jc');
          patch.planBd = (pp.plan || []).filter((p) => p.market === 'bd');
        }
        self.setData(patch);
      })
      .catch(() => { if (self._liveSeq === seq) self.setData({ oddsStatus: '实时取数失败, 显示构建时快照' }); });
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
    // 实时池里没有该场 = 官方已过销售截止并下架(2026-09-15 的 001/002/003 就是这样)。
    // 快照里 sp 还在, 但**投不了** —— 放进去等于让用户登记一张买不到的单。
    if (m.oddsClosed) {
      if (typeof wx !== 'undefined' && wx.showToast) {
        wx.showToast({ title: '该场已过销售截止, 官方已下架', icon: 'none' });
      }
      return null;
    }
    if (d.type === 'ah') return cart.buildLeg(m, 'ah');
    // ★让球-only 场(官方没开胜平负, 见 utils/jc.js noHadOf): 只有让球腿可投 ——
    //   默认腿型是 jcHad, 不拦就会往票里塞一条 odds 为空、奖金算成 0 的"买不到的单"
    const useHad = this.data.jcKindMap[d.id] !== 'hhad' && !jc.noHadOf(m);
    return cart.buildLeg(m, useHad ? 'jcHad' : 'jcHhad');
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
      if (m && m.oddsClosed) {
        // 勾选之后官方才下架(实时刷新拿到的): 腿必须从票里撤掉, 不能留着一张买不到的单
        const sel = Object.assign({}, this.data.cartSel);
        delete sel[key];
        if (typeof wx !== 'undefined' && wx.showToast) {
          wx.showToast({ title: '该场已下架, 已从票中移除', icon: 'none' });
        }
        this.commitCart(sel);
        return;
      }
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
      unit: unit,
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
        self.previewSlip(legs); // 出投注参考图
      })
      .catch(() => {
        try { wx.setStorageSync('betDraft', bet); } catch (e) { /* ignore */ }
        wx.showToast({ title: '保存失败已存草稿', icon: 'none' });
      });
  },

  /* 保存登记成功后: 渲染投注参考图并全屏预览(真机长按保存/转发);
     出图失败仅提示, 不影响已落库注单。
     _slipBusy 闸门防连点并发(共用 canvas 节点, 并发会互清缓冲出空白图) */
  previewSlip(legs) {
    if (this._slipBusy) return;
    const ls = (legs || this.data.cartLegs || []).filter(Boolean);
    if (!ls.length) return;
    const unit = parseFloat(this.data.cartUnit) || 2;
    this._slipBusy = true;
    const release = () => { this._slipBusy = false; };
    slipCanvas.renderSlip({ page: this, canvasId: 'slipCanvas', legs: ls, unit: unit })
      .then((p) => {
        this.setData({ lastSlipPath: p });
        wx.previewImage({
          urls: [p],
          fail: () => wx.showToast({ title: '图片已生成, 预览失败', icon: 'none' }),
          complete: release, // 预览打开即释放, 不等用户关闭
        });
      })
      .catch(() => { wx.showToast({ title: '已登记成功, 出图失败', icon: 'none' }); release(); });
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
