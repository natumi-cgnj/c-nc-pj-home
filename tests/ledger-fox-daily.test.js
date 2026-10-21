const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const model = require('../ledger-task-model.js');

const source = fs.readFileSync('wallet-assets.js', 'utf8');
const stageSource = source.slice(source.indexOf('  function dailyFoxDecoration('), source.indexOf('  function renderStageWorldList('));

function fixture(now = '2026-10-22T03:00:00Z') {
  const listeners = [], tasks = [];
  const summary = { innerHTML: '', querySelector() {
    return { addEventListener: (type, callback) => listeners.push({ type, callback }) };
  } };
  const document = { body: { dataset: {} }, getElementById(id) {
    return id === 'assetStageSummary' ? summary : id === 'ledgerTabWorld' ? {} : null;
  } };
  const context = vm.createContext({ document, global: {
    LedgerTaskModel: { dayKey: value => model.dayKey(value == null ? now : value) },
    LedgerTasks: { render: value => tasks.push(value) }
  }, esc: value => value, openStageSelector() {}, renderStageWorldList() {} });
  vm.runInContext(stageSource, context);
  return { context, summary, document, listeners, tasks };
}

test('daily fox stays fixed through the Japan 04:00 day boundary', () => {
  const { context } = fixture();
  const decoration = now => context.dailyFoxDecoration(now);
  assert.equal(decoration('2026-10-20T19:00:00Z'), decoration('2026-10-21T18:59:59Z'));
  assert.equal(decoration('2026-10-21T19:00:00Z'), decoration('2026-10-22T18:59:59Z'));
  assert.notEqual(decoration('2026-10-21T18:59:59Z'), decoration('2026-10-21T19:00:00Z'));
  assert.equal(fixture().context.dailyFoxDecoration(), fixture().context.dailyFoxDecoration());
});

test('daily choices include all six calm and six busy foxes', () => {
  const { context } = fixture();
  const seen = new Set();
  for (let day = 0; day < 366; day++) {
    const html = context.dailyFoxDecoration(Date.UTC(2026, 0, 1 + day, 3));
    const match = html.match(/ledger-fox-art-(accounts|records) ledger-fox-world-art" data-fox-pose="([1-6])"/);
    assert.ok(match, html);
    seen.add(match[1] + '/' + match[2]);
  }
  assert.equal(seen.size, 12);
});

test('world rerenders retain the daily fox and leave world data and interactions intact', () => {
  const app = fixture();
  const state = { stage: { activeWorldId: 'fox', worlds: [
    { id: 'fox', title: 'Patrick狐狐' }, { id: 'sacramento', title: '萨克门托' }
  ] } };
  const original = JSON.stringify(state);
  app.context.renderStage(state);
  const first = app.summary.innerHTML;
  assert.match(first, /ledger-fox-world-art/);
  app.context.renderStage(state);
  assert.equal(app.summary.innerHTML, first);
  assert.equal(JSON.stringify(state), original);
  assert.equal(app.listeners[0].type, 'click');
  assert.equal(app.tasks[0].worldId, 'fox');
  assert.equal(app.tasks[0].wallet, state);
  state.stage.activeWorldId = 'sacramento';
  app.context.renderStage(state);
  assert.doesNotMatch(app.summary.innerHTML, /ledger-fox-world-art/);
  assert.equal(app.document.body.dataset.ledgerWorld, 'sacramento');
});
