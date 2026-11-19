const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../diet-calorie-model.js');
const now = Date.parse('2026-11-19T15:00:00+09:00');

test('budget balance and energy difference use separate formulas, including steps once', () => {
  const log = M.savePlan({ version: 1, records: [
    { date: '2026-11-19', type: 'intake', kcal: 1400 }, { date: '2026-11-19', type: 'intake', kcal: 300 },
    { date: '2026-11-19', type: 'burn', kcal: 150, source: 'wechat_steps' }, { date: '2026-11-19', type: 'burn', kcal: 200 },
    { date: '2026-11-18', type: 'intake', kcal: 9999 }
  ] }, { startDate: '2026-11-19', dailyBudget: '1500', basalKcal: '1400' }, now);
  const stats = M.summary(log, '2026-11-19');
  assert.equal(stats.intake, 1700); assert.equal(stats.burn, 350);
  assert.equal(stats.remaining, -200); assert.equal(stats.difference, -50);
  const removed = { ...log, records: log.records.filter(x => x.kcal !== 300) };
  assert.equal(M.summary(removed, '2026-11-19').remaining, 100);
  assert.equal(M.summary(removed, '2026-11-19').difference, -350);
});
test('unset values stay unknown; independent budget and metabolism can be cleared', () => {
  const blank = { records: [] };
  assert.equal(M.summary(blank, '2026-11-19').remaining, null);
  assert.equal(M.summary(blank, '2026-11-19').difference, null);
  const target = M.savePlan(blank, { startDate: '2026-11-19', dailyBudget: 1800 }, now);
  assert.equal(M.summary(target, '2026-11-19').remaining, 1800);
  assert.equal(M.summary(target, '2026-11-19').difference, null);
  const cleared = M.savePlan(target, { startDate: '2026-11-19', dailyBudget: '', basalKcal: 1300 }, now);
  assert.equal(M.summary(cleared, '2026-11-19').remaining, null);
  assert.equal(M.summary(cleared, '2026-11-19').difference, -1300);
});
test('effective-date plans preserve earlier days, records, archive boundaries and unrelated fields', () => {
  const original = { version: 1, records: [{ id: 'old', date: '2026-11-10', kcal: 1000 }], recordPeriodStarts: ['2026-11-08'], other: { keep: true } };
  const before = JSON.stringify(original);
  let log = M.savePlan(original, { startDate: '2026-11-10', dailyBudget: 1800, basalKcal: 1300 }, now);
  log = M.savePlan(log, { startDate: '2026-11-19', dailyBudget: 1600, basalKcal: 1350 }, now);
  assert.equal(M.summary(log, '2026-11-18').dailyBudget, 1800);
  assert.equal(M.summary(log, '2026-11-19').dailyBudget, 1600);
  assert.equal(M.summary(log, '2026-11-09').dailyBudget, null);
  assert.deepEqual(log.records, original.records); assert.deepEqual(log.recordPeriodStarts, original.recordPeriodStarts); assert.deepEqual(log.other, original.other);
  assert.equal(JSON.stringify(original), before);
  log = M.savePlan(log, { startDate: '2026-11-10', dailyBudget: 1750, basalKcal: 1300 }, now);
  assert.equal(log.caloriePlans.length, 2); assert.equal(M.summary(log, '2026-11-19').dailyBudget, 1600);
});
test('04:00 JST rollover is independent of the computer timezone', () => {
  assert.equal(M.workday('2026-11-19T03:59:59+09:00'), '2026-11-18');
  assert.equal(M.workday('2026-11-19T04:00:00+09:00'), '2026-11-19');
});
test('invalid dates and numbers cannot change a saved plan; malformed calories do not poison totals', () => {
  for (const input of [{ startDate: '2026-02-30' }, { startDate: '2026-11-20' }, { startDate: '2026-11-19', dailyBudget: -1 }, { startDate: '2026-11-19', basalKcal: 1.2 }, { startDate: '2026-11-19', dailyBudget: Infinity }]) assert.throws(() => M.savePlan({ records: [] }, input, now));
  assert.equal(M.summary({ records: [null, { date: '2026-11-19', kcal: Infinity }, { date: '2026-11-19', kcal: -1 }, { date: '2026-11-19', kcal: 20 }] }, '2026-11-19').intake, 20);
});
