const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const catalog = require('../ledger-task-catalog.js');
const model = require('../ledger-task-model.js');

const acceptedAt = '2026-10-19T20:00:00Z'; // Oct 20, 05:00 JST; next full day starts Oct 21.
const endedAt = '2026-10-23T20:00:00Z'; // Oct 24, 05:00 JST.
function offered(taskId, worldId = 'sacramento', attempt = 'attempt-one') {
  return model.normalize({ batchId: catalog.batchId,
    offer: { taskId, attemptId: attempt, read: { [worldId]: catalog.stories[worldId][taskId].lines.length } } });
}
function active(taskId, worldId = 'sacramento', attempt = 'attempt-one') {
  const result = model.accept(offered(taskId, worldId, attempt), worldId, acceptedAt, attempt);
  assert.equal(result.ok, true);
  return result.state;
}
function financial(days) {
  return { accounts: { chinaSavings: { balance: 1234 } }, expenseBooks: [
    { id: 'book1', records: days.map(([date, income]) => ({ date, type: 'income', amount: income })) },
    { id: 'book2', records: days.map(([date, , amount]) => ({ date, type: 'expense', amount })) }
  ] };
}
function checked(state, wallet = {}, when = endedAt) {
  for (const row of model.progress(state, wallet, when).rows) {
    const response = model.check(state, row.key, wallet, when, state.active.attemptId);
    assert.equal(response.ok, true);
    assert.equal(response.failed, undefined);
    state = response.state;
  }
  return state;
}

test('one shared batch has eleven exact conditions and four complete, distinct story skins', () => {
  assert.equal(catalog.tasks.length, 11);
  assert.equal(new Set(catalog.tasks.map(task => task.id)).size, 11);
  assert.deepEqual(catalog.worlds, ['sacramento', 'palace', 'fox', 'heist']);
  assert.equal(catalog.stories.meta, undefined);
  for (const world of catalog.worlds) {
    assert.deepEqual(Object.keys(catalog.stories[world]).sort(), catalog.tasks.map(task => task.id).sort());
    for (const task of catalog.tasks) {
      const story = catalog.stories[world][task.id];
      assert.equal(story.lines.length, 4);
      assert.ok(story.lines.every(line => typeof line.speaker === 'string' && line.text.length > 0));
      assert.equal(Object.hasOwn(story, 'condition'), false, 'worlds cannot override a task condition');
    }
  }
  assert.deepEqual(catalog.tasks.slice(0, 2).map(task => [task.days, task.limit]), [[3, 2000], [3, 7000]]);
  assert.match(catalog.stories.sacramento.budget2000.lines[0].text, /预算整包不见/);
  assert.match(catalog.stories.palace.listNine.lines[0].text, /笼络人情/);
  assert.match(catalog.stories.heist.dailyPositive.lines[0].text, /太顺利的时候会失利/);
  assert.match(catalog.stories.heist.cashSort.lines[0].text, /收购一家银行/);
});

test('Japan 04:00 dates, calendar validation and leap-day arithmetic are consistent', () => {
  assert.equal(model.dayKey('2026-10-20T18:59:59Z'), '2026-10-20');
  assert.equal(model.dayKey('2026-10-20T19:00:00Z'), '2026-10-21');
  assert.equal(model.addDay('2028-02-28', 1), '2028-02-29');
  assert.equal(model.addDay('2026-12-31', 1), '2027-01-01');
  assert.equal(model.validDay('2026-02-29'), false);
  assert.equal(model.validDay('2026-02-31'), false);
});

test('dialogue gates accepting separately for each world and survives serialization', () => {
  let state = model.choose(null, 0, 'dialogue');
  assert.equal(state.offer.taskId, 'budget2000');
  assert.equal(model.accept(state, 'sacramento', acceptedAt, 'dialogue').reason, 'unread');
  for (let index = 0; index < 4; index++) state = model.advance(state, 'sacramento', 'dialogue').state;
  state = model.normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(model.accept(state, 'fox', acceptedAt, 'dialogue').reason, 'unread');
  assert.equal(model.accept(state, 'meta', acceptedAt, 'dialogue').ok, false);
  assert.equal(model.advance(state, 'sacramento', 'stale-id').ok, false);
  const response = model.accept(state, 'sacramento', acceptedAt, 'dialogue');
  assert.equal(response.ok, true);
  assert.equal(response.state.active.startsOn, '2026-10-21');
  assert.equal(response.state.offer, null);
  assert.equal(model.accept(response.state, 'fox', acceptedAt, 'dialogue').ok, false);
});

test('only ended task dates accept daily check-ins, including delayed backfill and undo', () => {
  const state = active('noSnacks');
  assert.equal(model.check(state, '2026-10-20', {}, endedAt, 'attempt-one').ok, false);
  assert.equal(model.check(state, '2026-10-21', {}, '2026-10-21T18:59:00Z', 'attempt-one').reason, 'not-ended');
  const response = model.check(state, '2026-10-21', {}, '2026-10-21T19:00:00Z', 'attempt-one');
  assert.equal(response.ok, true);
  assert.equal(response.state.active.checks['2026-10-21'], true);
  assert.equal(state.active.checks['2026-10-21'], undefined, 'operations do not mutate the old state');
  const undone = model.check(response.state, '2026-10-21', {}, endedAt, 'attempt-one');
  assert.equal(undone.state.active.checks['2026-10-21'], undefined);
  assert.equal(model.progress(checked(state, {}, '2027-01-01T20:00:00Z'), {}, endedAt).ready, true);
});

test('two thousand yen means total expenditure across three days, never per day or net spending', () => {
  const wallet = financial([['2026-10-21', 5000, 800], ['2026-10-22', 5000, 700], ['2026-10-23', 5000, 500]]);
  wallet.expenseBooks[0].records.push({ date: '2026-10-20', type: 'expense', amount: 999999 });
  const snapshot = JSON.stringify(wallet);
  let state = checked(active('budget2000'), wallet);
  assert.equal(model.progress(state, wallet, endedAt).totals.spent, 2000);
  const complete = model.finish(state, wallet, endedAt, 'attempt-one');
  assert.equal(complete.reason, 'completed');
  assert.equal(model.points(complete.state, 'sacramento'), 10);
  assert.equal(JSON.stringify(wallet), snapshot, 'task actions never change finances');
  wallet.expenseBooks[1].records[2].amount = 501;
  const failure = model.finish(state, wallet, endedAt, 'attempt-one');
  assert.equal(failure.failed, true);
  assert.equal(failure.state.active, null);
  assert.equal(model.points(failure.state, 'sacramento'), 0);
});

test('a checked overspend returns the attempt to the hidden pool, preserving prior points', () => {
  let state = active('budget2000');
  state.receipts['previous/rollbahnFive'] = { worldId: 'palace', points: 10, finishedOn: '2026-10-10', attemptId: 'old' };
  const response = model.check(state, '2026-10-21', financial([['2026-10-21', 10000, 2001]]), endedAt, 'attempt-one');
  assert.equal(response.failed, true);
  assert.equal(response.state.active, null);
  assert.equal(response.state.lastReturnedId, 'budget2000');
  assert.equal(model.completed(response.state, 'budget2000'), false);
  assert.equal(model.points(response.state, 'palace'), 10);
  const next = model.choose(response.state, 0, 'next');
  assert.notEqual(next.offer.taskId, 'budget2000');
  const returnedAgain = model.returnToPool(next, 'next').state;
  assert.equal(model.choose(returnedAgain, 0, 'retry').offer.taskId, 'budget2000', 'failed tasks can be offered again');
});

test('seven thousand is the cumulative net, allows a negative day and is rechecked at finish', () => {
  const wallet = financial([['2026-10-21', 0, 500], ['2026-10-22', 10000, 2000], ['2026-10-23', 0, 500]]);
  const state = checked(active('surplus7000'), wallet);
  assert.equal(model.finish(state, wallet, endedAt, 'attempt-one').reason, 'completed');
  wallet.expenseBooks[1].records[2].amount = 501;
  assert.equal(model.finish(state, wallet, endedAt, 'attempt-one').failed, true);
});

test('income higher than spending is required on every date and equality fails', () => {
  const good = financial([['2026-10-21', 2, 1], ['2026-10-22', 2, 1], ['2026-10-23', 2, 1]]);
  const state = checked(active('dailyPositive'), good);
  assert.equal(model.finish(state, good, endedAt, 'attempt-one').ok, true);
  good.expenseBooks[0].records[1].amount = 1;
  const equal = model.check(active('dailyPositive'), '2026-10-22', good, endedAt, 'attempt-one');
  assert.equal(equal.failed, true);
  assert.equal(model.finish(state, good, endedAt, 'attempt-one').failed, true);
});

test('manual duties do not pretend to classify food, snacks or marketplace listings from the ledger', () => {
  const wallet = financial([['2026-10-21', 0, 99999], ['2026-10-22', 0, 99999], ['2026-10-23', 0, 99999]]);
  for (const id of ['pantry', 'listNine', 'noSnacks', 'food1500']) {
    const state = checked(active(id), wallet);
    assert.equal(model.finish(state, wallet, endedAt, 'attempt-one').reason, 'completed');
  }
  assert.equal(model.task('food1500').condition, '连续三天，每天饭钱不超过 1,500 円');
  assert.equal(model.task('listNine').condition, '连续三天，每天挂出三件物品');
});

test('single duties start immediately, have no artificial deadline and still require explicit completion', () => {
  for (const id of ['cnBalances', 'rollbahnFive', 'reconcile', 'cashSort']) {
    const initial = active(id, 'fox');
    assert.equal(initial.active.startsOn, '2026-10-20');
    assert.equal(model.finish(initial, {}, acceptedAt, 'attempt-one').reason, 'incomplete');
    const state = checked(initial, {}, acceptedAt);
    const completed = model.finish(state, {}, acceptedAt, 'attempt-one');
    assert.equal(completed.ok, true);
    assert.equal(model.points(completed.state, 'fox'), 10);
  }
});

test('switching skins preserves the single attempt and reward goes to its accepting world once', () => {
  const state = checked(active('rollbahnFive', 'palace'));
  const before = JSON.stringify(state);
  assert.deepEqual(model.choose(state, 0.9, 'ignored'), state);
  assert.equal(JSON.stringify(state), before);
  const response = model.finish(state, {}, endedAt, 'attempt-one');
  assert.equal(model.points(response.state, 'palace'), 10);
  assert.equal(model.points(response.state, 'heist'), 0);
  assert.equal(model.finish(response.state, {}, endedAt, 'attempt-one').ok, false);
  const offeredNext = model.choose(response.state, 0.99, 'new-attempt');
  assert.notEqual(offeredNext.offer.taskId, 'rollbahnFive');
  assert.equal(model.check(offeredNext, 'once', {}, endedAt, 'attempt-one').ok, false);
});

test('all completed tasks exhaust this batch and previous batches keep their world points', () => {
  let state = model.normalize(null);
  for (const task of catalog.tasks) state.receipts[catalog.batchId + '/' + task.id] = { worldId: 'heist', points: 10, finishedOn: '2026-10-20', attemptId: task.id };
  state = model.choose(state, 0.5, 'none-left');
  assert.equal(state.offer, null);
  assert.equal(model.points(state, 'heist'), 110);
  const previous = model.normalize({ batchId: 'previous', receipts: { 'previous/task': { worldId: 'heist', points: 10, finishedOn: '2026-10-20' } }, active: active('noSnacks').active });
  assert.equal(previous.active, null);
  assert.equal(model.points(previous, 'heist'), 10);
});

test('malformed saves, invalid dates and stale attempt actions cannot mint points or resurrect progress', () => {
  const state = model.normalize({ batchId: catalog.batchId, offer: { taskId: 'unknown', attemptId: 'x' },
    active: { ...active('pantry').active, startsOn: '2026-02-31' },
    receipts: { 'x/y': { worldId: 'meta', points: 10, finishedOn: '2026-10-20' },
      'x/z': { worldId: 'fox', points: Infinity, finishedOn: '2026-10-20' } } });
  assert.equal(state.active, null);
  assert.equal(state.offer, null);
  assert.deepEqual(state.receipts, {});
  assert.equal(model.check(active('noSnacks'), '2026-10-21', {}, endedAt, 'stale').ok, false);
  assert.equal(model.returnToPool(active('noSnacks'), 'stale').ok, false);
  assert.equal(model.accept(offered('noSnacks'), 'sacramento', 'not-a-date', 'attempt-one').ok, false);
  const wallet = financial([['2026-10-21', 10, 5]]);
  wallet.expenseBooks[0].records.push({ date: '2026-10-21', type: 'income', amount: Infinity });
  assert.deepEqual(model.stats(wallet, '2026-10-21', '2026-10-21'), { income: 10, spent: 5, net: 5 });
});

test('the new task store is routed through cloud, backup and page refresh separately from money', () => {
  const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
  const page = fs.readFileSync('ledger.html', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');
  const ui = fs.readFileSync('ledger-tasks.js', 'utf8');
  assert.match(cloud, /const STATE_KEYS = \[[\s\S]*?'ledger_world_tasks_v1'/);
  assert.match(cloud, /'ledger.html': \['wallet_accounts_v1', 'ledger_world_tasks_v1', 'omniverse_world_context'\]/);
  assert.match(backup, /key:'ledger_world_tasks_v1'/);
  assert.match(page, /event.key===window.LedgerTasks.storageKey/);
  assert.match(page, /ledger-task-catalog.js[\s\S]*ledger-task-model.js[\s\S]*ledger-tasks.js[\s\S]*wallet-assets.js/);
  assert.doesNotMatch(ui, /setItem\(['"]wallet_accounts_v1|setItem\(['"]wallet_db/);
});

test('financial checks follow the same six-book and legacy normalization rules as the displayed ledger', () => {
  const wallet = { expenseBooks: [
    { id: 'unknown', records: [{ date: '2026-10-21', amount: 99999 }] },
    { id: 'book1', records: [{ date: '2026-10-21', type: 'income', amount: '2000' },
      { date: '2026-10-21', type: 'old-direction', amount: '100' },
      { date: '2026-10-21', amount: true }, { date: '2026-10-21', amount: '' },
      { date: '2026-10-21', amount: -1 }, { date: '2026-10-21', amount: 3.5 }] },
    { id: 'book1', records: [{ date: '2026-10-21', amount: 99999 }] }
  ] };
  assert.deepEqual(model.stats(wallet, '2026-10-21', '2026-10-21'), { income: 2000, spent: 100, net: 1900 });
});
