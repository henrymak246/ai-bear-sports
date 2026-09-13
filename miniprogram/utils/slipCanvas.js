/* slipCanvas.js — 投注参考图 Canvas 2D 绘制(小程序侧, 不可 node 测)。
 * renderSlip({ page, canvasId, legs, unit }) → Promise<tempFilePath>。
 * 流程: setData 同步 CSS 高 → 取节点 → 缓冲=逻辑×dpr → ctx.scale(dpr) 绘制
 * → wx.canvasToTempFilePath 按逻辑尺寸导出高清图。 */
const slip = require('./slip.js');

const RED = '#E4393C'; // 官方金额红
const GRAY = '#999999';
const LINE = '#EBEBEB';

function getNode(page, canvasId) {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().in(page).select('#' + canvasId)
      .fields({ node: true, size: true })
      .exec((res) => {
        const r = res && res[0];
        if (r && r.node) resolve(r);
        else reject(new Error('canvas 节点未找到: ' + canvasId));
      });
  });
}

function dprOf() {
  try {
    if (wx.getWindowInfo) return wx.getWindowInfo().pixelRatio || 2;
    return (wx.getSystemInfoSync().pixelRatio) || 2;
  } catch (e) { return 2; }
}

/* 分段文本(黑标签+红数值)居中绘制一行 */
function drawCenteredParts(ctx, cx, y, parts) {
  let w = 0;
  parts.forEach((p) => { ctx.font = p.font; w += ctx.measureText(p.text).width; });
  let x = cx - w / 2;
  parts.forEach((p) => {
    ctx.font = p.font;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
    x += ctx.measureText(p.text).width;
  });
}

function drawAll(ctx, W, H, legs, unit) {
  const rows = slip.slipRows(legs);
  const totals = slip.slipTotals(legs, unit);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle';

  // 头部: 过关方式
  let y = 36;
  ctx.fillStyle = '#222222';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('过关方式: ' + totals.legCount + '关', 30, y + 20);
  y += 74;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

  // 腿行: 标题居中黑 / 选项居中灰 / 分隔线(每腿 116 = slipHeight 口径)
  ctx.textAlign = 'center';
  rows.forEach((r) => {
    y += 20;
    ctx.fillStyle = '#222222';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(r.title, W / 2, y + 15);
    y += 48;
    ctx.fillStyle = GRAY;
    ctx.font = '28px sans-serif';
    ctx.fillText(r.options, W / 2, y + 14);
    y += 48;
    ctx.strokeStyle = LINE;
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(W - 20, y); ctx.stroke();
  });

  // 金额区
  y += 26;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#666666';
  ctx.font = '28px sans-serif';
  ctx.fillText('1倍 · 注数 ' + totals.stakes + ' 注', 30, y + 14);
  y += 52;
  drawCenteredParts(ctx, W / 2, y + 16, [
    { text: '投注金额: ', font: '30px sans-serif', color: '#333333' },
    { text: String(totals.amount), font: 'bold 36px sans-serif', color: RED },
    { text: ' 元', font: '30px sans-serif', color: '#333333' },
  ]);
  y += 56;
  drawCenteredParts(ctx, W / 2, y + 16, [
    { text: '理论最高奖金: ', font: '30px sans-serif', color: '#333333' },
    { text: String(totals.maxPayout), font: 'bold 38px sans-serif', color: RED },
    { text: ' 元', font: '30px sans-serif', color: '#333333' },
  ]);
}

async function renderSlip(opts) {
  const page = opts && opts.page;
  const canvasId = (opts && opts.canvasId) || 'slipCanvas';
  const legs = ((opts && opts.legs) || []).filter(Boolean);
  if (!page) throw new Error('renderSlip 需要 page');
  if (!legs.length) throw new Error('无腿可出图');
  const unit = (opts && opts.unit) || 2;
  const W = 750;
  const H = slip.slipHeight(legs.length);
  // CSS 尺寸与缓冲逻辑尺寸对齐(防拉伸), setData 回调后取节点
  await new Promise((resolve) => page.setData({ slipCanvasH: H }, resolve));
  const r = await getNode(page, canvasId);
  const node = r.node;
  const dpr = dprOf();
  const bw = Math.round(W * dpr);
  const bh = Math.round(H * dpr);
  node.width = bw;
  node.height = bh;
  const ctx = node.getContext('2d');
  ctx.scale(dpr, dpr);
  drawAll(ctx, W, H, legs, unit);
  return await new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas: node, x: 0, y: 0, width: W, height: H, destWidth: bw, destHeight: bh,
      success: (res) => resolve(res.tempFilePath),
      fail: (err) => reject(new Error((err && err.errMsg) || 'canvasToTempFilePath 失败')),
    });
  });
}

module.exports = { renderSlip };
