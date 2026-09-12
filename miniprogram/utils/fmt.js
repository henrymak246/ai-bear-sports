/* fmt.js — 展示格式化小工具(微信小程序 / Node 双环境)
 * fmtStars(n): 信心星级, n=1..5 → '★★★'; 非法/0/缺 → ''
 * fmtSp(arr): SP 数组拼接, [4.07,3.65,1.64] → '4.07/3.65/1.64';
 *   非数组/空数组/全空 → ''(数据里 sp 常整体为 null, 调用方直接插值即可)
 */

function fmtStars(n) {
  const k = parseInt(n, 10);
  if (!k || k < 1) return '';
  return '★'.repeat(k);
}

function fmtSp(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  return arr
    .filter((x) => x !== null && x !== undefined && x !== '')
    .join('/');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fmtStars, fmtSp };
}
