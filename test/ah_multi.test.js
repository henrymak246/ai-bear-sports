/* test/ah_multi.test.js — 三公司互证提取器回归测试(2026-11-16)
   夹具按 11-15 实盘快照还原四个关键场景(纯水存小数, 展示=+1):
   A=004 柏场(澳彩客低水/365平水/伟德主低水) → none(互证不足, 拦黑实证)
   B=008 芬兰场(三家客低水+365/伟德胜盘) → conflict 弃选级(拦黑实证)
   C=010 西班牙场(主低水2票+降盘2票) → soft 降权级
   D=003 樱花场(三家主低水) → strong 主(跟资金红实证) */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeSnap } = require('../tools/_ah_multi.js');

// 造快照: rows = [{ev, sup, line, home, away, initLine, initHome, initAway}]
function makeSnap(rows) {
  const odds = [], ah = [];
  let oid = 1000;
  for (const r of rows) {
    const instId = ++oid, initId = ++oid;
    odds.push([instId, 1, 0, r.ev, r.sup, null, 8199, 1, 784]);
    ah.push([instId, r.line, +(r.home - 1).toFixed(3), +(r.away - 1).toFixed(3), 0x110]);
    if (r.initLine != null) {
      odds.push([initId, 1, 0, r.ev, r.sup, null, 8199, 1, 784]);
      ah.push([initId, r.initLine, +((r.initHome || 1.9) - 1).toFixed(3), +((r.initAway || 1.9) - 1).toFixed(3), 0x130]);
    }
  }
  const p = path.join(os.tmpdir(), 'ah_multi_test_' + process.pid + '.json');
  fs.writeFileSync(p, JSON.stringify({ data: { odds: { data: odds }, 'odds.ah': { data: ah } } }));
  return p;
}

// A: 004 柏场 — 澳彩 半球 2.00/1.78(客低), 365 半球 1.90/1.90(平), 伟德 平/半 1.79/2.01(主低, 降盘)
const snapA = makeSnap([
  { ev: 1, sup: 2, line: 0.5, home: 2.00, away: 1.78, initLine: 0.5, initHome: 1.89, initAway: 1.89 },
  { ev: 1, sup: 5, line: 0.5, home: 1.90, away: 1.90, initLine: 0.5, initHome: 1.95, initAway: 1.85 },
  { ev: 1, sup: 26, line: 0.25, home: 1.79, away: 2.01, initLine: 0.5, initHome: 1.99, initAway: 1.76 },
]);
const cA = analyzeSnap(snapA, 1).consensus;
assert.strictEqual(cA.signal, 'none', '004 场应无互证信号');
assert.strictEqual(cA.fundSide, null);

// B: 008 芬兰场 — 三家客低水(2/1.8, 1.98/1.86, 1.95/1.88) + 365 升3.25→3.5 / 伟德 升3→3.5
const snapB = makeSnap([
  { ev: 2, sup: 2, line: 3.5, home: 1.98, away: 1.86, initLine: 3.5, initHome: 2.00, initAway: 1.84 },
  { ev: 2, sup: 5, line: 3.5, home: 2.00, away: 1.80, initLine: 3.25, initHome: 1.85, initAway: 1.95 },
  { ev: 2, sup: 26, line: 3.5, home: 1.95, away: 1.88, initLine: 3.0, initHome: 1.90, initAway: 1.93 },
]);
const cB = analyzeSnap(snapB, 2).consensus;
assert.strictEqual(cB.signal, 'conflict', '008 场应判升盘矛盾(弃选级)');
assert.strictEqual(cB.fundSide, '客');
assert.strictEqual(cB.fundStrength, 3);
assert.strictEqual(cB.lineMove, '升');
assert.strictEqual(cB.conflict, true);

// C: 010 西班牙场 — 主低水 2 票(365 1.87/1.97→wait 实为客低? 实盘: 365 0.75 1.97/1.87 客低)… 按实盘还原: 澳彩 0.5 1.84/2(主低), 365 0.75 1.97/1.87(客低), 伟德 0.5 1.81/2.03(主低), 降盘 2 票(365 1→0.75? 实盘 365 初 0.75; 澳彩 1→0.5, 伟德 1→0.5)
const snapC = makeSnap([
  { ev: 3, sup: 2, line: 0.5, home: 1.84, away: 2.00, initLine: 1.0, initHome: 1.90, initAway: 1.90 },
  { ev: 3, sup: 5, line: 0.75, home: 1.97, away: 1.87, initLine: 0.75, initHome: 1.92, initAway: 1.92 },
  { ev: 3, sup: 26, line: 0.5, home: 1.81, away: 2.03, initLine: 1.0, initHome: 1.91, initAway: 1.92 },
]);
const cC = analyzeSnap(snapC, 3).consensus;
assert.strictEqual(cC.fundSide, '主');
assert.strictEqual(cC.fundStrength, 2);
assert.strictEqual(cC.lineMove, '降');
assert.strictEqual(cC.signal, 'soft', '010 场应判降盘矛盾(降权级)');

// D: 003 樱花场 — 三家主低水(受让方主队低水: 1.82/1.97, 1.74/2.04, 1.76/2.05)
const snapD = makeSnap([
  { ev: 4, sup: 2, line: -0.25, home: 1.74, away: 2.04, initLine: -0.25 },
  { ev: 4, sup: 5, line: -0.25, home: 1.82, away: 1.97, initLine: -0.25 },
  { ev: 4, sup: 26, line: -0.25, home: 1.76, away: 2.05, initLine: -0.25 },
]);
const cD = analyzeSnap(snapD, 4).consensus;
assert.strictEqual(cD.signal, 'strong', '003 场应判互证强信号');
assert.strictEqual(cD.fundSide, '主');
assert.strictEqual(cD.fundStrength, 3);

[snapA, snapB, snapC, snapD].forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });
console.log('ah_multi.test.js 全部通过 ✓');
