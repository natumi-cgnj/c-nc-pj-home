const assert = require('node:assert/strict');
const test = require('node:test');
const recurring = require('./wallet-recurring.js');

function bank(balance, rules) {
  return { id: 'bank', title: '银行账户', balance, confirmedAt: '2026-10-01', monthlyDebits: rules };
}
function rule(id, day, amount, nextDueOn) {
  return { id, title: id, day, amount, nextDueOn };
}

test('monthly deductions use the date in Japan across the UTC boundary', () => {
  assert.equal(recurring.today(new Date('2026-10-18T14:59:59Z')), '2026-10-18');
  assert.equal(recurring.today(new Date('2026-10-18T15:00:00Z')), '2026-10-19');
});

test('nothing is charged early, each due month is counted once and the source remains unchanged', () => {
  const source = bank(100000, [rule('insurance', 27, 5000, '2026-10-27')]);
  const original = JSON.stringify(source);
  assert.equal(recurring.applyItem(source, '2026-10-26').balance, 100000);
  const due = recurring.applyItem(source, '2026-10-27');
  assert.equal(due.balance, 95000);
  assert.equal(due.monthlyDebits[0].nextDueOn, '2026-11-27');
  assert.deepEqual(recurring.applyItem(due, '2026-10-27'), due);
  assert.deepEqual(recurring.applyItem(due, '2026-11-26'), due);
  assert.equal(JSON.stringify(source), original);
});

test('opening after several months catches up separate payments without creating transactions', () => {
  const source = bank(100000, [
    rule('insurance', 27, 5000, '2026-10-27'),
    rule('management', 15, 9400, '2026-11-15')
  ]);
  const result = recurring.applyItem(source, '2027-01-15');
  assert.equal(result.balance, 56800);
  assert.equal(result.monthlyDebits[0].nextDueOn, '2027-01-27');
  assert.equal(result.monthlyDebits[1].nextDueOn, '2027-02-15');
  assert.equal(result.confirmedAt, source.confirmedAt);
  assert.equal(result.transactions, undefined);
});

test('the 31st falls on a short month end and returns to the 31st in March', () => {
  const source = bank(1000, [rule('fee', 31, 100, '2027-01-31')]);
  const february = recurring.applyItem(source, '2027-02-28');
  assert.equal(february.balance, 800);
  assert.equal(february.monthlyDebits[0].nextDueOn, '2027-03-31');
  assert.equal(recurring.applyItem(february, '2027-03-30').balance, 800);
  assert.equal(recurring.applyItem(february, '2027-03-31').balance, 700);
});

test('leap years honor February 29 and new rules start at the upcoming occurrence', () => {
  const source = bank(1000, [rule('fee', 31, 100, '2028-01-31')]);
  assert.equal(recurring.applyItem(source, '2028-02-28').balance, 900);
  assert.equal(recurring.applyItem(source, '2028-02-29').balance, 800);
  assert.equal(recurring.nextDue(31, '2028-02-10'), '2028-02-29');
  assert.equal(recurring.nextDue(27, '2026-10-27'), '2026-10-27');
  assert.equal(recurring.nextDue(27, '2026-10-28'), '2026-11-27');
});

test('changing a payment date cannot charge the same rule again in an already paid month', () => {
  const paid = recurring.applyItem(bank(10000, [rule('fee', 27, 1000, '2026-10-27')]), '2026-10-27');
  const next = recurring.reschedule(paid.monthlyDebits[0], 28, '2026-10-27');
  assert.equal(next, '2026-11-28');
  paid.monthlyDebits[0] = { ...paid.monthlyDebits[0], day: 28, nextDueOn: next };
  assert.equal(recurring.applyItem(paid, '2026-10-28').balance, 9000);
  assert.equal(recurring.applyItem(paid, '2026-11-28').balance, 8000);
});

test('two devices deriving from the same snapshot agree, and synced snapshots are not charged twice', () => {
  const source = bank(50000, [rule('fee', 10, 2000, '2026-10-10')]);
  const first = recurring.applyItem(source, '2026-12-10');
  const second = recurring.applyItem(JSON.parse(JSON.stringify(source)), '2026-12-10');
  assert.deepEqual(first, second);
  assert.deepEqual(recurring.applyItem(JSON.parse(JSON.stringify(first)), '2026-12-10'), first);
  const adjusted = { ...first, balance: 42000 };
  assert.equal(recurring.applyItem(adjusted, '2026-12-11').balance, 42000);
});

test('unknown balances stay unknown, invalid rules are ignored and negative balances are retained', () => {
  const fee = rule('fee', 27, 1000, '2026-10-27');
  assert.equal(recurring.applyItem(bank(null, [fee]), '2026-11-27').balance, null);
  assert.equal(recurring.applyItem(bank(100, [fee]), '2026-10-27').balance, -900);
  const invalid = [rule('zero', 27, 0, ''), rule('bad-day', 32, 1000, ''), rule('decimal', 27, 0.5, '')];
  assert.deepEqual(recurring.normalizeRules(invalid, '2026-10-19'), []);
  assert.equal(recurring.applyItem(bank(1000, []), '2026-12-31').balance, 1000);
});
