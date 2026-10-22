const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const M = require('../body-model.js');
const W = require('../diet-world.js');
const now = '2026-10-22T17:00:00Z'; // Oct 23, 02:00 Japan; body records use calendar dates.

test('calendar dates are explicit Japan dates, including midnight and leap days', () => {
  assert.equal(M.today(now), '2026-10-23');
  assert.equal(M.today('2026-10-22T14:59:59Z'), '2026-10-22');
  assert.equal(M.today('2026-10-22T15:00:00Z'), '2026-10-23');
  assert.equal(M.validDate('2026-02-29'), false);
  assert.equal(M.validDate('2028-02-29'), true);
  assert.equal(M.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(M.daysBetween('2026-09-30', '2026-10-01'), 1);
});

test('same-day weight upserts preserve identity, other dates and input state', () => {
  const initial = M.saveWeight(null, { date: '2026-10-22', kg: 61.7, note: 'test' }, now);
  const snapshot = JSON.stringify(initial);
  let next = M.saveWeight(initial, { date: '2026-10-22', kg: 61.2, note: '' }, now);
  assert.equal(JSON.stringify(initial), snapshot);
  assert.equal(next.weights.length, 1);
  assert.equal(next.weights[0].id, initial.weights[0].id);
  assert.equal(next.weights[0].kg, 61.2);
  next = M.saveWeight(next, { date: '2026-10-23', kg: 61 }, now);
  assert.equal(next.weights.length, 2);
  assert.throws(() => M.saveWeight(next, { id: next.weights[0].id, date: '2026-10-23', kg: 62 }, now), /已有/);
  for (const kg of ['', 0, -.1, .001, 'oops', Infinity]) assert.throws(() => M.saveWeight(null, { date: '2026-10-23', kg }, now));
  assert.throws(() => M.saveWeight(null, { date: '2026-10-24', kg: 61 }, now), /晚于今天/);
});

test('settings can stay blank and never impose a target or cycle', () => {
  assert.deepEqual(M.normalize(null).settings, { targetWeight: null, cycleLength: null });
  let state = M.settings(null, { targetWeight: 60, cycleLength: 31 });
  assert.equal(state.settings.targetWeight, 60);
  state = M.settings(state, { targetWeight: '', cycleLength: '' });
  assert.deepEqual(state.settings, { targetWeight: null, cycleLength: null });
  assert.throws(() => M.settings(null, { cycleLength: 30.5 }), /周期/);
});

test('periods support start/end, inclusive duration and history-based estimates', () => {
  let state = M.savePeriod(null, { start: '2026-09-01', end: '2026-09-05' }, now);
  assert.equal(M.periodSummary(state, now).next, null);
  state = M.savePeriod(state, { start: '2026-10-02', end: '2026-10-06' }, now);
  assert.equal(M.periodSummary(state, now).cycleLength, 31);
  assert.equal(M.periodSummary(state, now).next, '2026-11-02');
  state = M.settings(state, { cycleLength: 30 });
  assert.equal(M.periodSummary(state, now).next, '2026-11-01');
  state = M.savePeriod(state, { start: '2026-10-22' }, now);
  const active = M.periodSummary(state, now);
  assert.equal(active.day, 2);
  assert.equal(active.next, null);
  state = M.savePeriod(state, { id: active.active.id, start: '2026-10-22', end: '2026-10-23' }, now);
  assert.equal(M.periodSummary(state, now).active, null);
  assert.equal(state.periods.length, 3);
  assert.equal(M.daysBetween(state.periods[2].start, state.periods[2].end) + 1, 2);
});

test('period overlaps, impossible dates, unfinished periods and reversed ranges are rejected', () => {
  let state = M.savePeriod(null, { start: '2026-10-01', end: '2026-10-05' }, now);
  assert.throws(() => M.savePeriod(state, { start: '2026-10-05', end: '2026-10-09' }, now), /重叠/);
  assert.throws(() => M.savePeriod(state, { start: '2026-09-30' }, now), /重叠/);
  assert.throws(() => M.savePeriod(state, { start: '2026-02-30' }, now), /有效/);
  assert.throws(() => M.savePeriod(state, { start: '2026-10-10', end: '2026-10-09' }, now), /早于/);
  state = M.savePeriod(state, { start: '2026-10-21' }, now);
  assert.throws(() => M.savePeriod(state, { start: '2026-10-23' }, now), /重叠/);
  assert.throws(() => M.savePeriod(null, { start: '2026-10-24' }, now), /晚于今天/);
});

test('repairs retain appointment, next step and status history, and can be reopened', () => {
  const entry = { location: '测试部位', detail: '测试记录', startedOn: '2026-10-20', nextStep: '测试跟进' };
  let state = M.saveRepair(null, entry, now);
  const id = state.repairs[0].id;
  assert.equal(state.repairs[0].status, 'pending');
  assert.throws(() => M.saveRepair(state, { ...entry, id, status: 'booked' }, now), /预约日期/);
  for (const status of ['booked', 'ongoing', 'done', 'pending']) {
    state = M.saveRepair(state, { ...entry, id, status, appointmentOn: '2026-10-28' }, now);
    assert.equal(state.repairs.length, 1);
    assert.equal(state.repairs[0].status, status);
    assert.equal(state.repairs[0].completedOn, status === 'done' ? '2026-10-23' : '');
  }
  assert.deepEqual(state.repairs[0].history.map(x => x.status), ['pending', 'booked', 'ongoing', 'done', 'pending']);
  assert.equal(state.repairs[0].nextStep, '测试跟进');
  assert.equal(state.repairs[0].appointmentOn, '2026-10-28');
  assert.equal(M.remove(state, 'repairs', id).repairs.length, 0);
  assert.throws(() => M.saveRepair(state, { ...entry, id: 'removed' }, now), /已变更/);
});

test('world titles follow ledger, diet selection stays separate and daily fox poses stay stable', () => {
  const wallet = { stage: { activeWorldId: 'fox', worlds: [{ id: 'fox', title: 'Patrick狐狐' }] } };
  const before = JSON.stringify(wallet);
  assert.equal(W.worlds(wallet).length, 5);
  assert.equal(W.worlds(wallet).find(x => x.id === 'fox').title, 'Patrick狐狐');
  assert.equal(W.selection({}, wallet), 'fox');
  assert.equal(W.selection({ activeWorldId: 'sacramento' }, wallet), 'sacramento');
  assert.equal(W.selection({ activeWorldId: 'invalid' }, {}), 'meta');
  assert.equal(JSON.stringify(wallet), before);
  assert.deepEqual(W.foxPose('2026-10-22'), W.foxPose('2026-10-22'));
});

function controller(initial) {
  const elements = {};
  function element(id) {
    return elements[id] || (elements[id] = { id, innerHTML: '', dataset: {}, addEventListener() {}, querySelectorAll() { return []; } });
  }
  let writes = 0;
  const document = { getElementById: element, createElement() { return element('modal'); }, addEventListener() {}, body: { dataset: {}, appendChild() {} } };
  const localStorage = { getItem(key) { return initial[key] || null; }, setItem() { writes++; } };
  const window = { BodyModel: M };
  const context = vm.createContext({ window, document, localStorage, Date, console });
  vm.runInContext(fs.readFileSync(require.resolve('../diet-body.js'), 'utf8'), context);
  return { window, elements, writes: () => writes };
}

test('opening and rerendering empty, saved or corrupt records never initializes cloud data', () => {
  for (const raw of [null, JSON.stringify(M.normalize(null)), '{broken']) {
    const c = controller({ body_log_db: raw });
    c.window.DietBody.render(); c.window.DietBody.render();
    assert.equal(c.writes(), 0);
    assert.match(c.elements.viewBody.innerHTML, raw === '{broken' ? /无法读取/ : /身体修缮/);
  }
  const state = M.saveRepair(null, { location: '<script>bad</script>', startedOn: '2026-10-20' }, now);
  const c = controller({ body_log_db: JSON.stringify(state) }); c.window.DietBody.render();
  assert.doesNotMatch(c.elements.viewBody.innerHTML, /<script>/);
  assert.match(c.elements.viewBody.innerHTML, /&lt;script&gt;/);
  assert.equal(c.writes(), 0);
});
