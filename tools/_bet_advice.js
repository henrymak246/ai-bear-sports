/* 💰 投注建议卡生成器(2026-10-02, 依据 docs/投资策略研究_20261002.md 的三层策略)
   输入: day 对象 + 全量 days(算近 7 天北单次数); 输出: plan 块对象(result 恒 null, 不参与判定统计)。
   规则:
     稳定层 = combo7/max7 key 腿(或首腿) SP≤1.5 才打, 固定 10 元; 无胆/超赔/放弃清单=空仓;
     增强层 = asian7 有腿 → 2 元娱乐仓;
     彩票层 = beidan310 块, 近 7 天(含今日)≤2 次 且 cost≤128 → 可打(只用盈利出); 超次/超支=⛔;
     休市日(无投注块且 match.sp 全 null) = ⛔ 停手卡。
   用法: const { betAdviceCard } = require("./_bet_advice.js"); plan.push(betAdviceCard(day, days)); */
const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };

function betAdviceCard(day, days) {
  const danSrc = day.combo7 || day.max7;
  const danLeg = danSrc && (danSrc.legs || []).length ? (danSrc.legs.find(l => l.key) || danSrc.legs[0]) : null;
  const asianLegs = (day.asian7 && day.asian7.legs) || [];
  const bd = day.beidan310 && (day.beidan310.legs || []).length ? day.beidan310 : null;
  const hasBet = !!(danLeg || asianLegs.length || bd || ((day.matches || []).some(m => Array.isArray(m.sp))));

  /* 休市停手卡: 无任何投注产品(含 sp 全 null 的纯分析日) */
  if (!hasBet) {
    return {
      market: "jc", name: "💰 投注建议", pct: "策略卡",
      text: "⛔ **今日停手**(休市/无投注产品) —— 策略卡三层(稳定层胆 10 元 / 增强层 2 元 / 彩票层北单)全部空仓。观点连载仅供观赛, 恢复销售后按卡执行。",
      detail: "【策略卡铁律】稳定层=胆 SP≤1.5 每日 10 元(无胆空仓); 增强层=亚盘串 2 元娱乐仓; 彩票层=北单小复式 ≤128 元、每周 ≤2 次、**只用盈利出不动本金**; dream7/score3/双选跟单已证伪, 停止。依据 docs/投资策略研究_20261002.md。",
      result: null,
    };
  }

  /* 先定各层金额(2026-10-02 用户拍板: 细分规则暂放开, 有腿即列入; 唯一限制=总金额 ≤138 元) */
  const CAP = 138;
  let danAmt = danLeg ? 10 : 0;
  let asianAmt = asianLegs.length ? 2 : 0;
  let bdAmt = bd ? (num(bd.cost) || 0) : 0;
  /* 总金额裁剪: 超额按 彩票层→增强层 顺序砍 */
  let cutNote = "";
  if (danAmt + asianAmt + bdAmt > CAP) {
    if (bdAmt > 0) { cutNote += `, 砍彩票层 ${bdAmt} 元`; bdAmt = 0; }
    if (danAmt + asianAmt + bdAmt > CAP && asianAmt > 0) { cutNote += `, 砍增强层 ${asianAmt} 元`; asianAmt = 0; }
  }
  const total = danAmt + asianAmt + bdAmt;

  /* 再生成文本(金额与文本一致) */
  const danLine = !danLeg ? "🛡 稳定层: ▫️ 今日无胆腿"
    : `🛡 稳定层: ✅ **10 元单关** → ${danLeg.match} ${danLeg.pick}@${danLeg.odds}`;
  const asianLine = !asianLegs.length ? "🎲 增强层: ▫️ 今日无亚盘串腿"
    : asianAmt === 0 ? `🎲 增强层: ✂️ 已裁剪(总金额超限) —— asian7 ${asianLegs.length} 关只看不买`
    : `🎲 增强层: ✅ **2 元一注** → asian7 ${asianLegs.length} 关(${asianLegs.map(l => l.pick).join("/")})`;
  /* 北单腿清单(供卡片列出具体腿): "075 里昂vs水晶宫 3/1" */
  const bdLegList = bd ? bd.legs.map(l => {
    const m = String(l.match || "").replace(/^\d{3}\s*/, "").replace(/\s+/g, "");
    return (l.bdNum ? l.bdNum + " " : "") + m + " " + (l.pick || "?");
  }).join(" ｜ ") : "";
  const bdLine = !bd ? "🎫 彩票层: ▫️ 今日无北单块"
    : bdAmt === 0 ? `🎫 彩票层: ✂️ 已裁剪(总金额超限) —— 北单 ${bd.legs.length} 腿复式只看不买(${bdLegList})`
    : `🎫 彩票层: ✅ **${bdAmt} 元**(${bd.stakes || "?"}注×2元) → 北单 ${bd.legs.length} 腿复式\n   ▪ ${bdLegList}\n   ▪ 口径: 3=主胜 / 1=平 / 0=客胜(全部让球=0 直盘; 双选腿两档皆可, 单注 2 元 × 2^5=32 注)`;

  const sumLine = total > 0
    ? `💵 **今日方案合计 ${total} 元**(总金额上限 ${CAP} 元${cutNote ? "; 已超限裁剪" + cutNote : ""})`
    : "💵 今日方案: **三层全空仓, 休息** —— 休息也是策略";

  return {
    market: "jc", name: "💰 投注建议", pct: total > 0 ? `方案 ${total} 元` : "今日空仓",
    text: `${danLine}\n${asianLine}\n${bdLine}\n${sumLine}`,
    detail: "【策略卡口径(2026-10-02 修订)】暂只限制总金额: 每日方案合计 ≤138 元, 超额按 彩票层→增强层 顺序裁剪; 胆单关 10 元 / asian7 2 元 / 北单按实际成本, 有腿即列入; 细分规则(胆 SP 门槛/北单周次数/只花盈利)暂不执行, 保留在研究报告中(docs/投资策略研究_20261002.md)备用; 休市日停手。",
    result: null,
  };
}

module.exports = { betAdviceCard };
