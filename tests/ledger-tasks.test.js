const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const catalog = require('../ledger-task-catalog.js');
const model = require('../ledger-task-model.js');

const acceptedAt = '2026-10-19T20:00:00Z'; // Oct 20, 05:00 JST.
const endedAt = '2026-10-23T20:00:00Z'; // Oct 24, 05:00 JST.
const worldState = (state, id = 'sacramento') => state.worlds[id];
function offered(taskId, id = 'sacramento', attempt = 'attempt-one', value = null) {
  const state = model.normalize(value);
  state.worlds[id].offer = { taskId, attemptId: attempt, revision: catalog.storyRevision, read: catalog.stories[id][taskId].lines.length };
  return model.normalize(state);
}
function active(taskId, id = 'sacramento', attempt = 'attempt-one', value = null) {
  const response = model.accept(offered(taskId, id, attempt, value), id, acceptedAt, attempt);
  assert.equal(response.ok, true);
  return response.state;
}
function financial(days) {
  return { accounts: { chinaSavings: { balance: 1234 } }, expenseBooks: [
    { id: 'book1', records: days.map(([date, income]) => ({ date, type: 'income', amount: income })) },
    { id: 'book2', records: days.map(([date, , amount]) => ({ date, type: 'expense', amount })) }
  ] };
}
function checked(state, wallet = {}, when = endedAt, id = 'sacramento') {
  for (const row of model.progress(state, id, wallet, when).rows) {
    const response = model.check(state, id, row.key, wallet, when, worldState(state, id).active.attemptId);
    assert.equal(response.ok, true);
    assert.equal(response.failed, undefined);
    state = response.state;
  }
  return state;
}

test('twelve common conditions have four complete event catalogs and META remains empty', () => {
  assert.equal(catalog.tasks.length, 12);
  assert.equal(new Set(catalog.tasks.map(task => task.id)).size, 12);
  assert.deepEqual(catalog.worlds, ['sacramento', 'palace', 'fox', 'heist']);
  assert.equal(catalog.stories.meta, undefined);
  const lengths = new Set();
  for (const id of catalog.worlds) {
    assert.deepEqual(Object.keys(catalog.stories[id]).sort(), catalog.tasks.map(task => task.id).sort());
    for (const task of catalog.tasks) {
      const story = catalog.stories[id][task.id];
      assert.ok(story.lines.length > 0);
      lengths.add(story.lines.length);
      assert.ok(story.lines.every(line => typeof line.speaker === 'string' && line.text.length > 0));
      assert.equal(Object.hasOwn(story, 'condition'), false);
    }
  }
  assert.ok(lengths.size > 1, 'events are not forced into a four-line template');
  assert.deepEqual(catalog.tasks.slice(0, 2).map(task => [task.days, task.limit]), [[3, 2000], [3, 7000]]);
});

test('event narration addresses the player as you and leaves task mechanics in the separate brief', () => {
  for (const [id, stories] of Object.entries(catalog.stories)) {
    for (const [taskId, story] of Object.entries(stories)) {
      assert.ok(story.lines.some(line => line.speaker === '你'), id + '/' + taskId);
      for (const line of story.lines) {
        assert.notEqual(line.speaker, '我');
        if (!line.speaker) assert.doesNotMatch(line.text, /^(我|朕)[^们]/);
        assert.doesNotMatch(line.text, /差额|任务|打卡|挑战|给自己.{0,8}(安排|玩法)|见证狐|独立项目|两千撑三天|七千差额/);
      }
    }
  }
  const text = (id, taskId) => catalog.stories[id][taskId].lines.map(line => line.text).join('');
  assert.match(text('sacramento', 'budget2000'), /预算的信封/);
  assert.match(text('sacramento', 'surplus7000'), /自掏腰包.*好茶/);
  assert.match(text('sacramento', 'pantry'), /快到期/);
  assert.match(text('sacramento', 'cnBalances'), /涨工资/);
  assert.match(text('palace', 'listNine'), /笼络/);
  assert.match(text('palace', 'rollbahnFive'), /藏书阁晒书/);
  assert.match(text('fox', 'noSnacks'), /零食箱/);
  assert.match(text('fox', 'reconcile'), /工资/);
  assert.match(text('fox', 'food1500'), /新宠物零食/);
  assert.match(text('heist', 'dailyPositive'), /太顺利的时候会失利/);
  assert.match(text('heist', 'cashSort'), /收购这家银行/);
});

test('Japan 04:00 dates, calendar validation and leap-day arithmetic remain consistent', () => {
  assert.equal(model.dayKey('2026-10-20T18:59:59Z'), '2026-10-20');
  assert.equal(model.dayKey('2026-10-20T19:00:00Z'), '2026-10-21');
  assert.equal(model.addDay('2028-02-28', 1), '2028-02-29');
  assert.equal(model.addDay('2026-12-31', 1), '2027-01-01');
  assert.equal(model.validDay('2026-02-29'), false);
  assert.equal(model.validDay('2026-02-31'), false);
});

test('worlds draw independently without replacing another world offer or reading position', () => {
  let state = model.choose(null, 'sacramento', 0, 'sac-offer');
  state = model.advance(state, 'sacramento', 'sac-offer').state;
  const savedSac = JSON.stringify(worldState(state));
  state = model.choose(state, 'palace', 0.5, 'palace-offer');
  state = model.choose(state, 'fox', 0.9, 'fox-offer');
  state = model.choose(state, 'heist', 0.3, 'heist-offer');
  assert.equal(JSON.stringify(worldState(state)), savedSac);
  assert.notEqual(worldState(state).offer.taskId, worldState(state, 'palace').offer.taskId);
  assert.notEqual(worldState(state, 'fox').offer.taskId, worldState(state, 'heist').offer.taskId);
  assert.equal(worldState(state, 'palace').offer.read, 0);
  assert.deepEqual(model.choose(state, 'sacramento', 0.99, 'ignored'), state);
  assert.deepEqual(model.normalize(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(model.choose(state, 'meta', 0.5, 'none'), state);
});

test('dialogue accepts only after the entire current world event, including variable scene length', () => {
  for (const id of catalog.worlds) {
    let state = model.choose(null, id, 0, 'dialogue');
    const length = catalog.stories[id][worldState(state, id).offer.taskId].lines.length;
    for (let index = 0; index < length; index++) {
      assert.equal(model.accept(state, id, acceptedAt, 'dialogue').reason, 'unread');
      state = model.advance(state, id, 'dialogue').state;
    }
    state = model.normalize(JSON.parse(JSON.stringify(state)));
    const response = model.accept(state, id, acceptedAt, 'dialogue');
    assert.equal(response.ok, true);
    assert.equal(worldState(response.state, id).active.startsOn, '2026-10-21');
    assert.equal(worldState(response.state, id).offer, null);
    assert.equal(model.advance(state, id, 'stale-id').ok, false);
    assert.equal(model.accept(state, 'meta', acceptedAt, 'dialogue').ok, false);
  }
});

test('accepting and checking parallel world tasks preserve the other world attempt', () => {
  let state = active('noSnacks', 'sacramento', 'sac-active');
  state = active('dollsSix', 'fox', 'fox-active', state);
  const savedSac = JSON.stringify(worldState(state));
  assert.equal(model.progress(state, 'fox', {}, acceptedAt).task.id, 'dollsSix');
  assert.equal(model.check(state, 'fox', 'once', {}, acceptedAt, 'sac-active').ok, false);
  const complete = model.finish(checked(state, {}, acceptedAt, 'fox'), 'fox', {}, acceptedAt, 'fox-active');
  assert.equal(complete.reason, 'completed');
  assert.equal(JSON.stringify(worldState(complete.state)), savedSac);
  assert.equal(model.points(complete.state, 'fox'), 10);
  assert.equal(model.points(complete.state, 'sacramento'), 0);
  assert.equal(worldState(complete.state, 'fox').active, null);
});

test('a completion blocks only that world and the same task can complete once in every other world', () => {
  let state = active('dollsSix', 'sacramento', 'sac-dolls');
  state = model.finish(checked(state, {}, acceptedAt), 'sacramento', {}, acceptedAt, 'sac-dolls').state;
  assert.equal(model.completed(state, 'sacramento', 'dollsSix'), true);
  assert.equal(model.completed(state, 'palace', 'dollsSix'), false);
  assert.equal(model.finish(state, 'sacramento', {}, acceptedAt, 'sac-dolls').ok, false);
  state = active('dollsSix', 'palace', 'palace-dolls', state);
  state = model.finish(checked(state, {}, acceptedAt, 'palace'), 'palace', {}, acceptedAt, 'palace-dolls').state;
  assert.equal(model.points(state, 'palace'), 10);
  assert.equal(model.points(state, 'sacramento'), 10);
  assert.equal(model.points(state, 'fox'), 0);
  const next = model.choose(state, 'sacramento', 0.999, 'next');
  assert.notEqual(worldState(next).offer.taskId, 'dollsSix');
});

test('only ended dates accept daily check-ins, with delayed backfill and undo', () => {
  const state = active('noSnacks');
  assert.equal(model.check(state, 'sacramento', '2026-10-20', {}, endedAt, 'attempt-one').ok, false);
  assert.equal(model.check(state, 'sacramento', '2026-10-21', {}, '2026-10-21T18:59:00Z', 'attempt-one').reason, 'not-ended');
  const response = model.check(state, 'sacramento', '2026-10-21', {}, '2026-10-21T19:00:00Z', 'attempt-one');
  assert.equal(response.ok, true);
  assert.equal(worldState(response.state).active.checks['2026-10-21'], true);
  assert.equal(worldState(state).active.checks['2026-10-21'], undefined);
  const undone = model.check(response.state, 'sacramento', '2026-10-21', {}, endedAt, 'attempt-one');
  assert.equal(worldState(undone.state).active.checks['2026-10-21'], undefined);
  assert.equal(model.progress(checked(state, {}, '2027-01-01T20:00:00Z'), 'sacramento', {}, endedAt).ready, true);
});

test('daily listings start on acceptance day in every world and support same-day check and undo', () => {
  for (const id of catalog.worlds) {
    const initial = active('listNine', id);
    const summary = model.progress(initial, id, {}, acceptedAt);
    assert.equal(summary.startsOn, '2026-10-20');
    assert.equal(summary.endsOn, '2026-10-22');
    assert.deepEqual(summary.rows.map(row => row.checkable), [true, false, false]);
    assert.equal(summary.rows[0].ended, false);
    assert.equal(model.check(initial, id, '2026-10-21', {}, acceptedAt, 'attempt-one').ok, false);
    const response = model.check(initial, id, '2026-10-20', {}, acceptedAt, 'attempt-one');
    assert.equal(response.ok, true);
    assert.equal(worldState(response.state, id).active.checks['2026-10-20'], true);
    assert.equal(model.finish(response.state, id, {}, acceptedAt, 'attempt-one').reason, 'incomplete');
    const undone = model.check(response.state, id, '2026-10-20', {}, acceptedAt, 'attempt-one');
    assert.equal(undone.ok, true);
    assert.deepEqual(worldState(undone.state, id).active.checks, {});
    assert.equal(worldState(model.normalize(undone.state), id).active.startsOn, '2026-10-20');
  }
});

test('the screenshot save is repaired on read and persists only after a successful check-in', () => {
  const now = '2026-10-22T12:17:00Z'; // Oct 22, 21:17 JST, matching the screenshot.
  const state = model.accept(offered('listNine', 'fox'), 'fox', now, 'attempt-one').state;
  const old = worldState(state, 'fox').active;
  old.startsOn = '2026-10-23';
  delete old.checkInVersion;
  state.worlds.palace = worldState(active('noSnacks', 'palace'), 'palace');
  state.worlds.heist.receipts['earlier/task'] = { worldId: 'heist', points: 10, finishedOn: '2026-10-20' };
  const original = JSON.stringify(state);
  const summary = model.progress(state, 'fox', {}, now);
  assert.equal(summary.startsOn, '2026-10-22');
  assert.equal(summary.endsOn, '2026-10-24');
  assert.deepEqual(summary.rows.map(row => row.checkable), [true, false, false]);
  assert.equal(JSON.stringify(state), original, 'reading must not modify the saved object');
  const response = model.check(state, 'fox', '2026-10-22', {}, now, 'attempt-one');
  assert.equal(response.ok, true);
  assert.equal(worldState(response.state, 'fox').active.startsOn, '2026-10-22');
  assert.equal(worldState(response.state, 'fox').active.checks['2026-10-22'], true);
  assert.deepEqual(worldState(response.state, 'palace'), worldState(state, 'palace'));
  assert.equal(model.points(response.state, 'heist'), 10);
  assert.deepEqual(model.normalize(JSON.parse(JSON.stringify(response.state))), response.state);
});

test('old listing check dates stay fixed even if the only previous check is undone', () => {
  const initial = active('listNine', 'fox');
  const old = worldState(initial, 'fox').active;
  old.startsOn = '2026-10-21';
  old.checks['2026-10-21'] = true;
  delete old.checkInVersion;
  const migrated = model.normalize(initial);
  assert.equal(worldState(migrated, 'fox').active.startsOn, '2026-10-21');
  assert.equal(worldState(migrated, 'fox').active.checks['2026-10-21'], true);
  const undone = model.check(migrated, 'fox', '2026-10-21', {}, endedAt, 'attempt-one');
  assert.equal(undone.ok, true);
  assert.equal(worldState(model.normalize(undone.state), 'fox').active.startsOn, '2026-10-21');
  assert.deepEqual(worldState(model.normalize(undone.state), 'fox').active.checks, {});
});

test('listing dates roll over at Japan 04:00 and the third completed day can settle immediately', () => {
  const state = model.accept(offered('listNine'), 'sacramento', '2026-10-20T18:59:59Z', 'attempt-one').state;
  assert.equal(worldState(state).active.startsOn, '2026-10-20');
  assert.equal(model.check(state, 'sacramento', '2026-10-21', {}, '2026-10-20T18:59:59Z', 'attempt-one').ok, false);
  assert.equal(model.check(state, 'sacramento', '2026-10-21', {}, '2026-10-20T19:00:00Z', 'attempt-one').ok, true);
  const finalDay = '2026-10-22T12:00:00Z';
  const ready = checked(state, {}, finalDay);
  assert.equal(model.progress(ready, 'sacramento', {}, finalDay).ready, true);
  assert.equal(model.progress(ready, 'sacramento', {}, finalDay).rows[2].ended, false);
  const response = model.finish(ready, 'sacramento', {}, finalDay, 'attempt-one');
  assert.equal(response.ok, true);
  assert.equal(model.points(response.state, 'sacramento'), 10);
  assert.equal(model.finish(response.state, 'sacramento', {}, finalDay, 'attempt-one').ok, false);
  for (const id of ['budget2000', 'surplus7000', 'dailyPositive', 'noSnacks', 'food1500', 'pantry']) {
    const fullDay = active(id);
    const summary = model.progress(fullDay, 'sacramento', {}, '2026-10-21T12:00:00Z');
    assert.equal(summary.startsOn, '2026-10-21');
    assert.equal(summary.rows[0].checkable, false, id + ' still requires the full day');
    assert.equal(model.check(fullDay, 'sacramento', '2026-10-21', {}, '2026-10-21T12:00:00Z', 'attempt-one').reason, 'not-ended');
  }
});

test('the listing page enables today and a click saves the repaired date and check without touching money', () => {
  const now = new Date('2026-10-22T12:17:00Z').getTime();
  const state = model.accept(offered('listNine', 'fox'), 'fox', now, 'attempt-one').state;
  state.worlds.fox.active.startsOn = '2026-10-23';
  delete state.worlds.fox.active.checkInVersion;
  const original = JSON.stringify(state), money = JSON.stringify({ accounts: { mercari: { balance: 1234 } } });
  const data = new Map([[model.storageKey, original], ['wallet_accounts_v1', money]]), writes = [];
  const target = { classList: { add() {} }, innerHTML: '', contains() { return true; } };
  const storage = { getItem(key) { return data.has(key) ? data.get(key) : null; }, setItem(key, value) { writes.push(key); data.set(key, value); } };
  const win = { LedgerTaskModel: model, LedgerTaskCatalog: catalog, localStorage: storage };
  class FixedDate extends Date { static now() { return now; } }
  vm.runInNewContext(fs.readFileSync('ledger-tasks.js', 'utf8'), { window: win, Date: FixedDate, document: { getElementById() { return target; } } });
  const context = { worldId: 'fox', wallet: { stage: { worlds: [] } } };
  win.LedgerTasks.render(context);
  assert.deepEqual(writes, [], 'rendering cannot write repaired data to storage');
  assert.equal(data.get(model.storageKey), original);
  const todayButton = target.innerHTML.match(/<button[^>]*data-task-key="2026-10-22"[^>]*>/)[0];
  const futureButton = target.innerHTML.match(/<button[^>]*data-task-key="2026-10-23"[^>]*>/)[0];
  assert.doesNotMatch(todayButton, / disabled/);
  assert.match(futureButton, / disabled/);
  const attrs = { 'data-task-action': 'check', 'data-task-key': '2026-10-22', 'data-task-attempt': 'attempt-one', 'data-task-world': 'fox' };
  const control = { disabled: false, getAttribute(name) { return attrs[name]; } };
  target.onclick({ target: { closest() { return control; } } });
  assert.deepEqual(writes, [model.storageKey]);
  const saved = JSON.parse(data.get(model.storageKey));
  assert.equal(saved.worlds.fox.active.startsOn, '2026-10-22');
  assert.equal(saved.worlds.fox.active.checks['2026-10-22'], true);
  assert.equal(data.get('wallet_accounts_v1'), money);
  assert.match(target.innerHTML, /data-task-key="2026-10-22"[^>]*aria-pressed="true"/);
});

test('two thousand means total expenditure across three days, never per day or net spending', () => {
  const wallet = financial([['2026-10-21', 5000, 800], ['2026-10-22', 5000, 700], ['2026-10-23', 5000, 500]]);
  wallet.expenseBooks[0].records.push({ date: '2026-10-20', type: 'expense', amount: 999999 });
  const snapshot = JSON.stringify(wallet);
  const state = checked(active('budget2000'), wallet);
  assert.equal(model.progress(state, 'sacramento', wallet, endedAt).totals.spent, 2000);
  const complete = model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one');
  assert.equal(complete.reason, 'completed');
  assert.equal(model.points(complete.state, 'sacramento'), 10);
  assert.equal(JSON.stringify(wallet), snapshot);
  wallet.expenseBooks[1].records[2].amount = 501;
  const failure = model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one');
  assert.equal(failure.failed, true);
  assert.equal(worldState(failure.state).active, null);
  assert.equal(model.points(failure.state, 'sacramento'), 0);
});

test('failure or postponement returns only that world task and preserves all existing points', () => {
  let state = active('budget2000');
  state = active('pantry', 'palace', 'palace-active', state);
  state.worlds.fox.receipts['previous/rollbahnFive'] = { worldId: 'fox', points: 10, finishedOn: '2026-10-10', attemptId: 'old' };
  const other = JSON.stringify(worldState(state, 'palace'));
  const response = model.check(state, 'sacramento', '2026-10-21', financial([['2026-10-21', 10000, 2001]]), endedAt, 'attempt-one');
  assert.equal(response.failed, true);
  assert.equal(worldState(response.state).active, null);
  assert.equal(worldState(response.state).lastReturnedId, 'budget2000');
  assert.equal(model.completed(response.state, 'sacramento', 'budget2000'), false);
  assert.equal(model.points(response.state, 'fox'), 10);
  assert.equal(JSON.stringify(worldState(response.state, 'palace')), other);
  const next = model.choose(response.state, 'sacramento', 0, 'next');
  assert.notEqual(worldState(next).offer.taskId, 'budget2000');
  const returnedAgain = model.returnToPool(next, 'sacramento', 'next').state;
  assert.equal(model.choose(returnedAgain, 'sacramento', 0, 'retry').worlds.sacramento.offer.taskId, 'budget2000');
  assert.equal(JSON.stringify(worldState(returnedAgain, 'palace')), other);
});

test('seven thousand is cumulative net, permits a negative day and rechecks at finish', () => {
  const wallet = financial([['2026-10-21', 0, 500], ['2026-10-22', 10000, 2000], ['2026-10-23', 0, 500]]);
  const state = checked(active('surplus7000'), wallet);
  assert.equal(model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one').reason, 'completed');
  wallet.expenseBooks[1].records[2].amount = 501;
  assert.equal(model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one').failed, true);
});

test('income must be strictly higher on every task date and equality fails', () => {
  const wallet = financial([['2026-10-21', 2, 1], ['2026-10-22', 2, 1], ['2026-10-23', 2, 1]]);
  const state = checked(active('dailyPositive'), wallet);
  assert.equal(model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one').ok, true);
  wallet.expenseBooks[0].records[1].amount = 1;
  assert.equal(model.check(active('dailyPositive'), 'sacramento', '2026-10-22', wallet, endedAt, 'attempt-one').failed, true);
  assert.equal(model.finish(state, 'sacramento', wallet, endedAt, 'attempt-one').failed, true);
});

test('manual duties do not falsely infer food, snacks or listings from mixed expense books', () => {
  const wallet = financial([['2026-10-21', 0, 99999], ['2026-10-22', 0, 99999], ['2026-10-23', 0, 99999]]);
  for (const id of ['pantry', 'listNine', 'noSnacks', 'food1500']) {
    assert.equal(model.finish(checked(active(id), wallet), 'sacramento', wallet, endedAt, 'attempt-one').reason, 'completed');
  }
  assert.equal(model.task('food1500').condition, '连续三天，每天饭钱不超过 1,500 円');
  assert.equal(model.task('listNine').condition, '连续三天，每天挂出三件物品');
});

test('one-off duties have no invented deadline and still need explicit check-in and completion', () => {
  for (const id of ['cnBalances', 'rollbahnFive', 'reconcile', 'cashSort', 'dollsSix']) {
    const initial = active(id, 'fox');
    assert.equal(worldState(initial, 'fox').active.startsOn, '2026-10-20');
    assert.equal(model.finish(initial, 'fox', {}, acceptedAt, 'attempt-one').reason, 'incomplete');
    const response = model.finish(checked(initial, {}, acceptedAt, 'fox'), 'fox', {}, acceptedAt, 'attempt-one');
    assert.equal(response.ok, true);
    assert.equal(model.points(response.state, 'fox'), 10);
  }
});

test('finishing all twelve in one world neither exhausts another pool nor removes previous batch points', () => {
  let state = model.normalize(null);
  for (const task of catalog.tasks) state.worlds.heist.receipts[catalog.batchId + '/' + task.id] = { worldId: 'heist', points: 10, finishedOn: '2026-10-20', attemptId: task.id };
  state = model.choose(state, 'heist', 0.5, 'none-left');
  assert.equal(worldState(state, 'heist').offer, null);
  assert.equal(model.points(state, 'heist'), 120);
  assert.ok(model.choose(state, 'fox', 0.5, 'fox-next').worlds.fox.offer);
  const previous = model.normalize({ version: 2, batchId: 'previous', worlds: { heist: {
    receipts: { 'previous/task': { worldId: 'heist', points: 10, finishedOn: '2026-10-20' } }, active: worldState(active('noSnacks', 'heist'), 'heist').active } } });
  assert.equal(worldState(previous, 'heist').active, null);
  assert.equal(model.points(previous, 'heist'), 10);
});

test('V1 shared saves migrate each receipt and the accepted attempt into only their recorded worlds', () => {
  const oldActive = worldState(active('food1500', 'fox'), 'fox').active;
  oldActive.checks['2026-10-21'] = true;
  const original = { version: 1, batchId: catalog.batchId, active: oldActive, offer: null, receipts: {
    [catalog.batchId + '/rollbahnFive']: { worldId: 'palace', points: 10, finishedOn: '2026-10-20', attemptId: 'old-complete' },
    'earlier/task': { worldId: 'heist', points: 20, finishedOn: '2026-10-10', attemptId: 'earlier' }
  } };
  const snapshot = JSON.stringify(original);
  const state = model.normalize(original, 'sacramento');
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(state.version, 2);
  assert.deepEqual(worldState(state, 'fox').active, oldActive);
  assert.equal(model.points(state, 'palace'), 10);
  assert.equal(model.points(state, 'heist'), 20);
  for (const id of ['sacramento', 'palace', 'heist']) assert.equal(worldState(state, id).active, null);
  assert.equal(model.completed(state, 'palace', 'rollbahnFive'), true);
  assert.equal(model.completed(state, 'fox', 'rollbahnFive'), false);
  assert.deepEqual(model.normalize(JSON.parse(JSON.stringify(state))), state);
});

test('an old unaccepted offer goes only to the selected world and rewritten scenes restart reading', () => {
  const legacy = { version: 1, batchId: catalog.batchId, offer: { taskId: 'budget2000', attemptId: 'old-offer', read: { palace: 4, fox: 3 } }, receipts: {} };
  const state = model.normalize(legacy, 'palace');
  assert.equal(worldState(state, 'palace').offer.taskId, 'budget2000');
  assert.equal(worldState(state, 'palace').offer.read, 0);
  for (const id of ['sacramento', 'fox', 'heist']) assert.equal(worldState(state, id).offer, null);
  assert.equal(model.accept(state, 'palace', acceptedAt, 'old-offer').reason, 'unread');
  assert.equal(model.choose(legacy, 'palace', 0.99, 'ignored').worlds.palace.offer.attemptId, 'old-offer');
  const newer = offered('pantry');
  newer.worlds.sacramento.offer.revision = 'old-prose';
  assert.equal(worldState(model.normalize(newer)).offer.read, 0);
});

test('adding a task in the same batch preserves prior per-world completions and current attempts', () => {
  let state = model.normalize(null);
  for (const task of catalog.tasks.filter(task => task.id !== 'dollsSix')) {
    state.worlds.heist.receipts[catalog.batchId + '/' + task.id] = { worldId: 'heist', points: 10, finishedOn: '2026-10-20', attemptId: task.id };
  }
  state = model.choose(state, 'heist', 0.5, 'dolls-next');
  assert.equal(worldState(state, 'heist').offer.taskId, 'dollsSix');
  assert.equal(model.points(state, 'heist'), 110);
  const ongoing = active('noSnacks', 'fox', 'ongoing', state);
  assert.deepEqual(model.choose(JSON.parse(JSON.stringify(ongoing)), 'fox', 0.99, 'ignored'), ongoing);
});

test('malformed saves, mismatched owners, invalid dates and stale actions cannot mint points', () => {
  const state = model.normalize({ version: 2, batchId: catalog.batchId, worlds: { sacramento: {
    offer: { taskId: 'unknown', attemptId: 'x' }, active: { ...worldState(active('pantry')).active, startsOn: '2026-02-31' },
    receipts: { 'x/y': { worldId: 'fox', points: 10, finishedOn: '2026-10-20' }, 'x/z': { worldId: 'sacramento', points: Infinity, finishedOn: '2026-10-20' } }
  } } });
  assert.equal(worldState(state).active, null);
  assert.equal(worldState(state).offer, null);
  assert.deepEqual(worldState(state).receipts, {});
  assert.equal(model.check(active('noSnacks'), 'sacramento', '2026-10-21', {}, endedAt, 'stale').ok, false);
  assert.equal(model.returnToPool(active('noSnacks'), 'fox', 'attempt-one').ok, false);
  assert.equal(model.accept(offered('noSnacks'), 'sacramento', 'not-a-date', 'attempt-one').ok, false);
  assert.equal(model.getWorld(state, 'meta'), null);
});

test('task storage stays separate from money and the UI always scopes actions by current world', () => {
  const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
  const page = fs.readFileSync('ledger.html', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');
  const ui = fs.readFileSync('ledger-tasks.js', 'utf8');
  assert.match(cloud, /const STATE_KEYS = \[[\s\S]*?'ledger_world_tasks_v1'/);
  assert.match(cloud, /'ledger.html': \['jane_world_files_v1', 'wallet_accounts_v1', 'ledger_world_tasks_v1', 'ledger_world_tasks_v2', 'omniverse_world_context'\]/);
  assert.match(backup, /key:'ledger_world_tasks_v1'/);
  assert.match(backup, /key:'ledger_world_tasks_v2'/);
  assert.equal(model.storageKey, 'ledger_world_tasks_v2');
  assert.equal(model.legacyStorageKey, 'ledger_world_tasks_v1');
  assert.match(page, /event.key===window.LedgerTasks.storageKey/);
  assert.match(page, /ledger-task-catalog.js[\s\S]*ledger-task-model.js[\s\S]*ledger-tasks.js[\s\S]*wallet-assets.js/);
  assert.match(ui, /model\.choose\(cachedState, context\.worldId/);
  for (const action of ['advance', 'accept', 'returnToPool', 'check', 'finish']) assert.match(ui, new RegExp('model\\.' + action + '\\(state, context\\.worldId'));
  assert.doesNotMatch(ui, /setItem\(['"]wallet_accounts_v1|setItem\(['"]wallet_db/);
});

test('financial checks keep the six-book and legacy normalization rules used by the ledger', () => {
  const wallet = { expenseBooks: [
    { id: 'unknown', records: [{ date: '2026-10-21', amount: 99999 }] },
    { id: 'book1', records: [{ date: '2026-10-21', type: 'income', amount: '2000' },
      { date: '2026-10-21', type: 'old-direction', amount: '100' }, { date: '2026-10-21', amount: Infinity },
      { date: '2026-10-21', amount: true }, { date: '2026-10-21', amount: '' },
      { date: '2026-10-21', amount: -1 }, { date: '2026-10-21', amount: 3.5 }] },
    { id: 'book1', records: [{ date: '2026-10-21', amount: 99999 }] }
  ] };
  assert.deepEqual(model.stats(wallet, '2026-10-21', '2026-10-21'), { income: 2000, spent: 100, net: 1900 });
});

test('the UI upgrades on an explicit action, preserves V1 and ignores subsequent old-page writes', () => {
  const legacy = { version: 1, batchId: catalog.batchId, offer: { taskId: 'budget2000', attemptId: 'old-ui', read: { fox: 4 } }, receipts: {} };
  const financialRaw = JSON.stringify({ accounts: { mercari: { balance: 1234 } } });
  const legacyRaw = JSON.stringify(legacy);
  const data = new Map([[model.legacyStorageKey, legacyRaw], ['wallet_accounts_v1', financialRaw]]), writes = [];
  const target = { classList: { add() {} }, innerHTML: '', contains() { return true; }, querySelector() { return null; } };
  const storage = { getItem(key) { return data.has(key) ? data.get(key) : null; }, setItem(key, value) { writes.push(key); data.set(key, value); } };
  const win = { LedgerTaskModel: model, LedgerTaskCatalog: catalog, localStorage: storage, crypto: { randomUUID() { return 'ui-id'; } } };
  vm.runInNewContext(fs.readFileSync('ledger-tasks.js', 'utf8'), { window: win, document: { getElementById(id) { return id === 'assetStageStory' ? target : null; } } });
  const context = { worldId: 'fox', worldTitle: 'Patrick狐狐', wallet: { stage: { worlds: [] } } };
  win.LedgerTasks.render(context);
  assert.deepEqual(writes, [], 'opening the old save cannot initialize or overwrite cloud storage');
  function advance() {
    const attrs = { 'data-task-action': 'advance', 'data-task-attempt': 'old-ui', 'data-task-world': 'fox' };
    const control = { disabled: false, getAttribute(name) { return attrs[name]; } };
    target.onclick({ target: { closest() { return control; } } });
  }
  advance();
  assert.deepEqual(writes, [model.storageKey]);
  assert.equal(data.get(model.legacyStorageKey), legacyRaw);
  assert.equal(data.get('wallet_accounts_v1'), financialRaw);
  assert.equal(JSON.parse(data.get(model.storageKey)).worlds.fox.offer.read, 1);
  data.set(model.legacyStorageKey, JSON.stringify({ ...legacy, offer: { ...legacy.offer, taskId: 'dollsSix' } }));
  win.LedgerTasks.render(context);
  advance();
  const saved = JSON.parse(data.get(model.storageKey));
  assert.equal(saved.worlds.fox.offer.taskId, 'budget2000');
  assert.equal(saved.worlds.fox.offer.read, 2);
});
