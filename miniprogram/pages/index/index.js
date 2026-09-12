/* pages/index/index.js — 推荐页(三 Tab: 🎫竞彩 / 🀄北单 / 🌏亚盘)
 * 数据流: onShow/onPullDownRefresh → api.fetchTodayPayload → 成功渲染+写缓存;
 *   失败读 payloadCache 缓存渲染+错误横幅, 无缓存则提示下拉重试。
 * 分组逻辑抽成纯函数 buildGroups(payload, judge) 并经 module.exports 导出,
 * 供 node 冒烟(tools/_smoke_mini_page.js)直接断言。 */
const api = require('../../utils/api.js');
const judge = require('../../utils/judge.js');
const fmt = require('../../utils/fmt.js');

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
  },

  onShow() {
    this.load();
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
