const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const catalog = require('../diet-fox-stories.js');
const model = require('../diet-fox-task-model.js');
const bodyModel = require('../body-model.js');
const now = Date.parse('2026-11-26T08:00:00Z');
const group = state => state.worlds.fox;
function offer(id, attempt = 'test-attempt') {
  const index = catalog.tasks.findIndex(entry => entry.id === id);
  return model.choose(null, (index + .5) / catalog.tasks.length, attempt);
}
function readAll(state) {
  const current = group(state).offer;
  for (let i = current.read; i < catalog.task(current.taskId).lineCount; i++) state = model.advance(state, current.attemptId).state;
  return state;
}
function accept(state, time = now) {
  const current = group(state).offer;
  return model.accept(readAll(state), time, current.attemptId).state;
}

test('six fox scenes all have aligned trilingual stories, localized conditions and stable rewards', () => {
  assert.equal(catalog.tasks.length, 6);
  assert.equal(new Set(catalog.tasks.map(entry => entry.id)).size, 6);
  for (const entry of catalog.tasks) {
    assert.equal(entry.lineCount, 6);
    assert.equal(entry.reward, 10);
    for (const lang of ['zh', 'ja', 'en']) {
      const localized = catalog.content(entry.id, lang, lang);
      assert.equal(localized.id, entry.id);
      assert.ok(localized.title && localized.condition);
      assert.equal(localized.lines.length, entry.lineCount);
      localized.lines.forEach((line, i) => {
        assert.ok(line.text);
        assert.equal(line.isPlayer, catalog.content(entry.id, 'zh', 'zh').lines[i].isPlayer);
        assert.equal(line.speaker, line.isPlayer ? { zh: '你', ja: 'あなた', en: 'You' }[lang] : '');
      });
    }
  }
  const mixed = catalog.content('lunch-photo', 'ja', 'en');
  assert.equal(mixed.lines[1].text, 'お品書きにそんな一品はないよ。');
  assert.match(mixed.condition, /Photograph a meal/);
});

test('reading must finish before acceptance; a task cannot award points until checked and settled', () => {
  let state = offer('lunch-photo');
  assert.equal(model.accept(state, now, 'test-attempt').reason, 'unread');
  state = readAll(state);
  assert.equal(group(state).offer.read, 6);
  const started = model.accept(state, now, 'test-attempt');
  assert.ok(started.ok);
  state = started.state;
  assert.equal(group(state).offer, null);
  assert.equal(model.progress(state, now).ready, false);
  assert.equal(model.finish(state, now, 'test-attempt').reason, 'incomplete');
  state = model.check(state, 'once', now, 'test-attempt').state;
  assert.equal(model.progress(state, now).ready, true);
  state = model.check(state, 'once', now, 'test-attempt').state;
  assert.equal(model.progress(state, now).ready, false);
  state = model.check(state, 'once', now, 'test-attempt').state;
  const finished = model.finish(state, now, 'test-attempt');
  assert.ok(finished.ok);
  assert.equal(finished.reward.points, 10);
  assert.equal(model.points(finished.state), 10);
  assert.equal(model.finish(finished.state, now, 'test-attempt').reason, 'stale');
  state = model.choose(finished.state, 0, 'next-attempt');
  assert.notEqual(group(state).offer.taskId, 'lunch-photo');
  assert.equal(model.points(state), 10);
});

test('declining and returning clear the attempt without resetting existing receipts; stale clicks are rejected', () => {
  const state = offer('lunch-photo');
  const declined = model.returnToPool(readAll(state), 'test-attempt');
  assert.ok(declined.ok);
  const next = model.choose(declined.state, 0, 'next');
  assert.notEqual(group(next).offer.taskId, 'lunch-photo');
  assert.equal(model.advance(next, 'test-attempt').reason, 'stale');
  let active = accept(next);
  active = model.check(active, 'once', now, 'next').state;
  const returned = model.returnToPool(active, 'next');
  assert.ok(returned.ok);
  assert.equal(group(returned.state).active, null);
  assert.equal(model.points(returned.state), 0);
  assert.notEqual(group(model.choose(returned.state, 0, 'third')).offer.taskId, group(active).active.taskId);
});

test('three-day tasks begin on the acceptance workday, use 04:00 JST, permit backfill and reject future dates', () => {
  const a = Date.parse('2026-11-25T18:59:00Z'), b = Date.parse('2026-11-25T19:00:00Z');
  assert.equal(model.dayKey(a), '2026-11-25');
  assert.equal(model.dayKey(b), '2026-11-26');
  let state = accept(offer('dinner-note'), b);
  let progress = model.progress(state, b);
  assert.deepEqual(progress.rows.map(row => [row.key, row.checkable]), [['2026-11-26', true], ['2026-11-27', false], ['2026-11-28', false]]);
  assert.equal(model.check(state, '2026-11-27', b, 'test-attempt').reason, 'not-started');
  state = model.check(state, '2026-11-26', b, 'test-attempt').state;
  const later = Date.parse('2026-11-27T19:00:00Z');
  state = model.check(state, '2026-11-27', later, 'test-attempt').state;
  state = model.check(state, '2026-11-28', later, 'test-attempt').state;
  assert.equal(model.progress(state, later).ready, true);
  assert.equal(model.points(model.finish(state, later, 'test-attempt').state), 10);
});

test('all six tasks complete once per batch; normalized saves preserve receipts and active reading', () => {
  let state = null;
  for (let i = 0; i < catalog.tasks.length; i++) {
    state = model.choose(state, 0, 'attempt-' + i);
    const id = group(state).offer.taskId;
    state = model.advance(state, 'attempt-' + i).state;
    state = model.normalize(JSON.parse(JSON.stringify(state)));
    assert.equal(group(state).offer.read, 1);
    state = accept(state);
    const end = Date.parse('2026-12-01T08:00:00Z');
    for (const row of model.progress(state, end).rows) state = model.check(state, row.key, end, 'attempt-' + i).state;
    state = model.finish(state, end, 'attempt-' + i).state;
    assert.ok(group(state).receipts[catalog.batchId + '/' + id]);
  }
  assert.equal(model.points(state), 60);
  assert.equal(group(model.choose(state, .5, 'unavailable')).offer, null);
  const old = JSON.parse(JSON.stringify(state));
  old.batchId = 'older';
  old.worlds.fox.receipts['20261001-01/example'] = { worldId: 'fox', points: 10, finishedOn: '2026-10-01', attemptId: 'old' };
  assert.equal(model.points(old), 70);
});

function controller(seed = {}) {
  const values = new Map(Object.entries({
    diet_world_state_v1: JSON.stringify({ activeWorldId: 'fox' }),
    wallet_accounts_v1: JSON.stringify({ stage: { activeWorldId: 'meta', worlds: [{ id: 'fox', title: 'Patrick狐狐' }] } }),
    ledger_world_tasks_v2: JSON.stringify({ untouched: true }),
    ...seed
  }));
  const reads = [], writes = [], listeners = {}, toasts = [];
  const localStorage = {
    getItem(key) { reads.push(key); return values.get(key) || null; },
    setItem(key, value) { writes.push(key); values.set(key, value); }
  };
  const panel = { innerHTML: '', querySelector() { return { focus() {} }; } };
  let html = '';
  const view = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      panel.innerHTML = value.match(/data-diet-fox-story>([\s\S]*?)<\/div><\/div><div class="diet-world-stage">/)?.[1] || '';
    },
    addEventListener(name, callback) { listeners['view:' + name] = callback; },
    querySelector(selector) { return selector === '[data-diet-fox-story]' && html.includes('data-diet-fox-story') ? panel : null; },
    contains() { return true; }
  };
  const modal = { addEventListener() {} };
  const document = { getElementById(id) { return id === 'viewDraft' ? view : modal; }, createElement() { return modal; },
    body: { dataset: {}, appendChild() {} } };
  const math = Object.create(Math); math.random = () => 0;
  const window = { localStorage, BodyModel: bodyModel, AppLanguage: { uiLanguage: 'zh', dialogue: 'zh' },
    addEventListener(name, callback) { listeners[name] = callback; }, showToast(msg) { toasts.push(msg); } };
  const context = vm.createContext({ window, document, localStorage, Date, Math: math, console });
  for (const file of ['diet-fox-stories.js', 'diet-fox-task-model.js', 'diet-fox-tasks.js', 'diet-world.js']) {
    vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  }
  return { window, document, view, panel, reads, writes, listeners, values, toasts,
    click(action, key, attemptOverride) {
      const attempt = attemptOverride || panel.innerHTML.match(/data-diet-task-attempt="([^"]+)"/)?.[1];
      const control = { dataset: { dietTaskAction: action, dietTaskKey: key, dietTaskAttempt: attempt } };
      listeners['view:click']({ target: { closest(selector) { return selector === '[data-diet-task-action]' ? control : null; } } });
    },
    select(id) { values.set('diet_world_state_v1', JSON.stringify({ activeWorldId: id })); window.DietWorld.render(); }
  };
}

test('the real DIET fox controller follows the ledger task UI from first line through settlement and next draw', () => {
  const c = controller();
  c.window.DietWorld.render();
  assert.match(c.view.innerHTML, /class="ledger-task-panel diet-fox-story" data-diet-fox-story/);
  assert.match(c.panel.innerHTML, /本世界 0 积分/);
  assert.match(c.panel.innerHTML, /午餐的额外配菜/);
  assert.match(c.panel.innerHTML, /点击继续 · 1 \/ 6/);
  assert.doesNotMatch(c.panel.innerHTML, /data-diet-task-action="accept"/);
  assert.deepEqual(c.writes, []);
  for (let i = 0; i < 6; i++) c.click('advance');
  assert.match(c.panel.innerHTML, /给一顿日常餐食拍照/);
  assert.match(c.panel.innerHTML, /完成 \+10 积分/);
  assert.match(c.panel.innerHTML, /data-diet-task-action="accept"/);
  c.click('accept');
  assert.match(c.panel.innerHTML, /进行中/);
  assert.match(c.panel.innerHTML, /data-diet-task-action="finish"[^>]* disabled/);
  c.click('check', 'once');
  assert.match(c.panel.innerHTML, /已打卡/);
  assert.doesNotMatch(c.panel.innerHTML, /data-diet-task-action="finish"[^>]* disabled/);
  c.click('finish');
  assert.match(c.panel.innerHTML, /本世界 10 积分/);
  assert.match(c.panel.innerHTML, /占座的客人/);
  assert.match(c.toasts.at(-1), /\+10 积分/);
  assert.ok(c.writes.every(key => key === model.storageKey));
  assert.deepEqual(JSON.parse(c.values.get('ledger_world_tasks_v2')), { untouched: true });
});

test('task progress survives re-render, language changes, world switches and reload; other worlds remain untouched', () => {
  const c = controller();
  c.window.DietWorld.render();
  c.click('advance');
  c.window.DietWorld.render();
  assert.match(c.panel.innerHTML, /菜单上没有这一项。/);
  for (const id of ['meta', 'sacramento', 'palace', 'heist']) {
    c.select(id);
    assert.doesNotMatch(c.view.innerHTML, /data-diet-fox-story/);
    assert.match(c.view.innerHTML, /data-ui="暂无"/);
  }
  c.select('fox');
  c.window.AppLanguage.uiLanguage = 'en';
  c.window.AppLanguage.dialogue = 'ja';
  c.listeners['omniverse:languagechange']();
  assert.match(c.panel.innerHTML, /お品書きにそんな一品はないよ。/);
  assert.match(c.panel.innerHTML, /Click to continue · 2 \/ 6/);
  const reload = controller(Object.fromEntries(c.values));
  reload.window.DietWorld.render();
  assert.match(reload.panel.innerHTML, /点击继续 · 2 \/ 6/);
  assert.deepEqual(reload.writes, []);
  assert.equal(c.writes.length, 1);
});

test('the task scripts are ordered, the independent save participates in sync and backup, and cloud moments defer to the existing panel', () => {
  const html = fs.readFileSync(require.resolve('../diet.html'), 'utf8');
  const files = ['diet-fox-stories.js', 'diet-fox-task-model.js', 'diet-fox-tasks.js', 'diet-world.js'];
  const positions = files.map(file => html.indexOf('src="' + file + '?v='));
  assert.ok(positions.every((index, i) => index >= 0 && (i === 0 || index > positions[i - 1])));
  assert.match(html, /href="ledger-tasks\.css\?v=/);
  assert.match(html, /diet_world_tasks_v1/);
  const cloud = fs.readFileSync(require.resolve('../cloud-sync.js'), 'utf8');
  assert.match(cloud, /'diet\.html': \[[^\]]*'diet_world_tasks_v1'/);
  assert.match(fs.readFileSync(require.resolve('../backup.html'), 'utf8'), /key:'diet_world_tasks_v1'/);
  assert.match(fs.readFileSync(require.resolve('../world-moments.js'), 'utf8'), /parent\.querySelector\('\.ledger-task-panel'\)/);
});
