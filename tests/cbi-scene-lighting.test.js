const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('cbi-scene-lighting.js', 'utf8');

function createHarness(options = {}) {
  const pending = [];
  const scenes = {};
  const listeners = {};
  const intervals = [];
  const clock = { textContent: '' };
  const date = { textContent: '' };
  let now = options.now || new Date(2026, 9, 7, 4, 21);
  const location = options.location || 'office';
  const addEventListener = (type, listener) => (listeners[type] ||= []).push(listener);
  for (const location of ['office', 'home']) {
    const markup = index.match(new RegExp('<img[^>]*data-cbi-scene="' + location + '"[^>]*>'))[0];
    scenes[location] = {
      src: options.loadHome ? (/\bsrc="([^"]*)"/.exec(markup)?.[1] || null) : location === 'office'
        ? 'assets/scenes/cbi-office.webp?v=20261007-office1'
        : 'assets/scenes/cbi-home.webp',
      dataset: options.loadHome ? {} : { timeSlot: 'morning' },
      getAttribute(name) { return this[name]; },
      setAttribute(name, value) { this[name] = value; }
    };
  }
  class Image {
    set src(value) { this.source = value; pending.push(this); }
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  const document = {
    visibilityState: 'visible',
    addEventListener,
    getElementById: id => id === 'clock' ? clock : date,
    querySelector: selector => scenes[/="(.*?)"/.exec(selector)[1]]
  };
  const context = vm.createContext({
    Image,
    Date: ClockDate,
    document,
    location: { href: 'index.html' },
    addEventListener,
    setInterval: callback => { intervals.push(callback); },
    getActiveWorldId: () => 'cbi',
    getActiveLocationId: () => location,
    getCGDisplayPeriodKey: () => '',
    currentCGPeriodKey: ''
  });
  context.window = context;
  vm.runInContext(source, context);
  vm.runInContext(index.match(/function getCGSlot\(now\)\{[\s\S]*?\n\}/)[0], context);
  if (options.loadHome) {
    vm.runInContext(index.match(/function updateCbiSceneLighting\(now\)\{[\s\S]*?\n\}/)[0], context);
    vm.runInContext(index.match(/function updateClock\(\)\{[\s\S]*?(?=\/\* ═══ WARDROBE)/)[0], context);
    vm.runInContext(index.match(/function openSuitcase\(\)\{[\s\S]*?\n\}/)[0], context);
  }
  return {
    scenes, pending, api: context.CBISceneLighting, getSlot: context.getCGSlot, clock,
    openSuitcase: () => context.openSuitcase(),
    get href() { return context.location.href; },
    setNow: value => { now = value; },
    tick: () => intervals.forEach(callback => callback()),
    dispatch(type, event = {}) {
      if (event.visibilityState) document.visibilityState = event.visibilityState;
      for (const listener of listeners[type] || []) listener(event);
    }
  };
}

test('both scene maps use all four existing clock periods at their exact boundaries', () => {
  const { api, getSlot } = createHarness();
  const boundaries = [
    [0, 0, 'night'], [5, 59, 'night'], [6, 0, 'morning'], [10, 59, 'morning'],
    [11, 0, 'day'], [16, 59, 'day'], [17, 0, 'evening'], [21, 59, 'evening'],
    [22, 0, 'night'], [23, 59, 'night']
  ];
  for (const [hour, minute, expected] of boundaries) {
    assert.equal(getSlot(new Date(2026, 9, 7, hour, minute)), expected);
  }
  for (const location of ['office', 'home']) {
    const paths = ['morning', 'day', 'evening', 'night'].map(slot => api.getSceneSource(location, slot));
    assert.equal(new Set(paths).size, 4);
    for (const path of paths) assert.ok(fs.existsSync(path.split('?')[0]), path);
  }
});

test('downloads keep the current frame visible and only update their own location', () => {
  const { api, scenes, pending } = createHarness();
  const previous = scenes.office.src;
  api.update('office', 'night');
  api.update('office', 'night');
  assert.equal(pending.length, 1, 'clock ticks must not restart the download');
  assert.equal(scenes.office.src, previous);
  pending[0].onload();
  assert.equal(scenes.office.src, api.getSceneSource('office', 'night'));
  assert.equal(scenes.office.dataset.timeSlot, 'night');
  assert.equal(scenes.home.dataset.timeSlot, 'morning');
  api.update('home', 'evening');
  pending[1].onload();
  assert.equal(scenes.home.src, api.getSceneSource('home', 'evening'));
  assert.equal(scenes.office.dataset.timeSlot, 'night');
});

test('an older download cannot overwrite a later period or a return to the displayed frame', () => {
  const { api, scenes, pending } = createHarness();
  api.update('office', 'day');
  api.update('office', 'night');
  pending[1].onload();
  pending[0].onload();
  assert.equal(scenes.office.dataset.timeSlot, 'night');
  api.update('home', 'night');
  api.update('home', 'morning');
  pending[2].onload();
  assert.equal(scenes.home.src, api.getSceneSource('home', 'morning'));
  assert.equal(scenes.home.dataset.timeSlot, 'morning');
});

test('failed downloads preserve the last good scene and can retry on the next clock tick', () => {
  const { api, scenes, pending } = createHarness();
  const previous = scenes.home.src;
  api.update('home', 'night');
  pending[0].onerror();
  assert.equal(scenes.home.src, previous);
  api.update('home', 'night');
  assert.equal(pending.length, 2);
  pending[1].onload();
  assert.equal(scenes.home.dataset.timeSlot, 'night');
});

test('returning from Suitcase recovers a night download interrupted by navigation', () => {
  for (const location of ['office', 'home']) {
    const fixture = createHarness({ loadHome: true, location });
    const { api, scenes, pending } = fixture;
    assert.equal(pending.length, 1);
    fixture.openSuitcase();
    assert.equal(fixture.href, 'suitcase.html');
    fixture.dispatch('pagehide', { persisted: true });
    // A suspended/cancelled request delivers neither load nor error before Back.
    fixture.dispatch('pageshow', { persisted: true });
    assert.equal(pending.length, 2, 'Back must restart an interrupted scene request');
    pending[1].onload();
    fixture.tick();
    assert.equal(fixture.clock.textContent, '04:21');
    assert.equal(scenes[location].src, api.getSceneSource(location, 'night'));
    assert.equal(scenes[location].dataset.timeSlot, 'night');
    assert.equal(pending.length, 2, 'the loaded night scene must stay loaded');
  }
});

test('an abandoned request cannot settle or clear a new request for the same scene', () => {
  const fixture = createHarness({ loadHome: true });
  const { api, scenes, pending } = fixture;
  fixture.dispatch('pagehide', { persisted: true });
  fixture.dispatch('pageshow', { persisted: true });
  assert.equal(pending.length, 2);
  pending[0].onload();
  assert.equal(scenes.office.src, null, 'old navigation callbacks must be ignored');
  pending[0].onerror();
  fixture.tick();
  assert.equal(pending.length, 2, 'an old error must not invalidate the current request');
  pending[1].onload();
  assert.equal(scenes.office.src, api.getSceneSource('office', 'night'));
});

test('resuming a hidden page retries an interrupted request without waiting for a clock tick', () => {
  const fixture = createHarness({ loadHome: true });
  fixture.dispatch('visibilitychange', { visibilityState: 'hidden' });
  fixture.dispatch('visibilitychange', { visibilityState: 'visible' });
  assert.equal(fixture.pending.length, 2);
  fixture.pending[1].onload();
  assert.equal(fixture.scenes.office.dataset.timeSlot, 'night');
});

test('returning after a time boundary uses the current clock and ignores the old download', () => {
  const fixture = createHarness({ loadHome: true, now: new Date(2026, 9, 7, 21, 59) });
  fixture.openSuitcase();
  fixture.dispatch('pagehide', { persisted: true });
  fixture.setNow(new Date(2026, 9, 7, 22, 0));
  fixture.dispatch('pageshow', { persisted: true });
  assert.equal(fixture.clock.textContent, '22:00');
  assert.equal(fixture.pending[1].source, fixture.api.getSceneSource('office', 'night'));
  fixture.pending[1].onload();
  fixture.pending[0].onload();
  assert.equal(fixture.scenes.office.dataset.timeSlot, 'night');
});

test('a fresh Home document avoids a morning flash and a restored night scene stays loaded', () => {
  const fixture = createHarness({ loadHome: true });
  assert.equal(fixture.scenes.office.src, null, 'the page must not display morning while night loads');
  assert.equal(fixture.pending[0].source, fixture.api.getSceneSource('office', 'night'));
  fixture.pending[0].onload();
  fixture.openSuitcase();
  fixture.dispatch('pagehide', { persisted: true });
  fixture.dispatch('pageshow', { persisted: true });
  assert.equal(fixture.pending.length, 1, 'Back must preserve an already loaded night scene');
  assert.equal(fixture.scenes.office.dataset.timeSlot, 'night');

  const fresh = createHarness({ loadHome: true, location: 'home' });
  assert.equal(fresh.scenes.home.src, null, 'home must also wait for the correct period');
  assert.equal(fresh.pending[0].source, fresh.api.getSceneSource('home', 'night'));
  fresh.pending[0].onload();
  assert.equal(fresh.scenes.home.dataset.timeSlot, 'night');
});
