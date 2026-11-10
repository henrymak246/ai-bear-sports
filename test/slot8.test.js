'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { slotOf, makeAsian, makeBeidan, validateSlot8 } = require('../tools/_slot8.js');

test('三时段边界: 05:59深夜/06:00早场/17:59早场/18:00夜场/23:59夜场/00:00深夜', () => {
  assert.equal(slotOf('05:59'), 'late');
  assert.equal(slotOf('06:00'), 'early');
  assert.equal(slotOf('17:59'), 'early');
  assert.equal(slotOf('18:00'), 'night');
  assert.equal(slotOf('23:59'), 'night');
  assert.equal(slotOf('00:00'), 'late');
});

test('北单注数按双选数计算, 让球场禁单选', () => {
  const b = makeBeidan('26113', [
    { bdNum: '001', pick: '3', handicap: '0' },
    { bdNum: '002', pick: '3/1', handicap: '-1' },
    { bdNum: '003', pick: '1/0', handicap: '+1' },
  ]);
  assert.equal(b.stakes, 4); assert.equal(b.cost, 8);
  assert.throws(() => makeBeidan('26113', [{ bdNum: '001', pick: '3', handicap: '-1' }]), /禁单选/);
});

test('缺大小赔率不虚构总倍数', () => {
  const a = makeAsian([{ odds: '1.80' }, { odds: '—' }]);
  assert.equal(a.totalOdds, '待补'); assert.equal(a.cost, 2);
});

test('validateSlot8抓时段错位和北单注数错误', () => {
  const day = { matches: [{ id: '周日001', time: '13:00' }], slot8: {} };
  for (const slot of ['early', 'night', 'late']) day.slot8[slot] = { asian: { legs: [] }, beidan: { legs: [], stakes: 1, cost: 2 } };
  assert.deepEqual(validateSlot8(day), []);
  day.slot8.late.asian.legs.push({ id: '周日001' });
  day.slot8.late.beidan = { legs: [{ bdNum: '002', pick: '3/1', handicap: '-1' }], stakes: 1, cost: 2 };
  const errors = validateSlot8(day);
  assert(errors.some(e => e.includes('时段错误')));
  assert(errors.some(e => e.includes('注数/金额错误')));
});

test('同一张混编票同一场不得同时有让球和大小球', () => {
  const day = { matches: [{ id: '周日001', time: '13:00' }], slot8: {} };
  for (const slot of ['early', 'night', 'late']) day.slot8[slot] = { asian: { legs: [] }, beidan: { legs: [], stakes: 1, cost: 2 } };
  day.slot8.early.asian.legs = [
    { id: '周日001', play: '亚盘', pick: '客队-0.25' },
    { id: '周日001', play: '大小球', pick: '小2.5' },
  ];
  const errors = validateSlot8(day);
  assert(errors.some(e => e.includes('同一场重复') && e.includes('周日001')));
});

test('三时段结算复用亚盘/大小球/北单权威判定', () => {
  const { settleSlot8 } = require('../tools/_slot8.js');
  const day = { matches: [{ id: '周日001', time: '13:00', home: '主队', away: '客队', finalScore: '1-1' }], slot8: {} };
  for (const slot of ['early', 'night', 'late']) day.slot8[slot] = { asian: { legs: [] }, beidan: { legs: [] } };
  day.slot8.early.asian.legs = [
    { id: '周日001', pick: '客队-0.25', result: null },
    { id: '周日001', pick: '小2.5', result: null },
  ];
  day.slot8.early.beidan.legs = [{ bdNum: '001', match: '001 主队 vs 客队', pick: '3/1', handicap: '0', result: null }];
  assert.equal(settleSlot8(day), 3);
  assert.equal(day.slot8.early.asian.legs[0].result, 'loseHalf');
  assert.equal(day.slot8.early.asian.legs[1].result, 'win');
  assert.equal(day.slot8.early.beidan.legs[0].result, 'hit');
  assert.equal(day.slot8.early.asian.result, 'miss');
  assert.equal(day.slot8.early.beidan.result, 'hit');
  assert.equal(settleSlot8(day), 0);
});

test('大阪队名按亚盘结算, 不被当成大小球', () => {
  const { settleSlot8 } = require('../tools/_slot8.js');
  const day = { matches: [{ id: '周日004', time: '14:00', home: '大阪钢巴', away: '大阪樱花', finalScore: '2-3' }], slot8: {} };
  for (const slot of ['early', 'night', 'late']) day.slot8[slot] = { asian: { legs: [] }, beidan: { legs: [] } };
  day.slot8.early.asian.legs = [{ id: '周日004', pick: '大阪钢巴-0.25', result: null }];
  assert.equal(settleSlot8(day), 1);
  assert.equal(day.slot8.early.asian.legs[0].result, 'lose');
});
