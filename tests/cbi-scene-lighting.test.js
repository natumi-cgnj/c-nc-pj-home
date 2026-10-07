const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('cbi-scene-lighting.js', 'utf8');
const worldContextSource = fs.readFileSync('world-context.js', 'utf8');
const suitcase = fs.readFileSync('suitcase.html', 'utf8');

function createHarness(options = {}) {
  const scenes = {};
  const listeners = {};
  const intervals = [];
  let now = options.now || new Date(2026, 9, 7, 22, 45);
  const locationId = options.location || 'home';
  const data = options.storage || new Map();
  if (!options.storage) data.set('omniverse_world_context', JSON.stringify({
    version: 2, activeWorldId: options.world || 'cbi', locationByWorld: { cbi: locationId }
  }));
  const localStorage = {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, String(value))
  };
  const addEventListener = (type, listener) => (listeners[type] ||= []).push(listener);
  const dispatch = (type, event = {}) => {
    if (event.visibilityState) document.visibilityState = event.visibilityState;
    for (const listener of listeners[type] || []) listener(event);
  };
  for (const location of ['office', 'home']) {
    const markup = index.match(new RegExp('<img[^>]*data-cbi-scene="' + location + '"[^>]*>'))[0];
    const src = /\bsrc="([^"]*)"/.exec(markup)?.[1] || null;
    scenes[location] = {
      src, dataset: {}, complete: true, naturalWidth: 0, requests: [],
      getAttribute(name) { return this[name]; },
      setAttribute(name, value) {
        this[name] = value;
        if (name === 'src') { this.complete = false; this.requests.push(value); }
      },
      removeAttribute(name) { this[name] = null; },
      load() { this.complete = true; this.naturalWidth = 1672; },
      fail() { this.complete = true; this.naturalWidth = 0; }
    };
  }
  if (options.previous) {
    scenes[locationId].src = locationId === 'office'
      ? 'assets/scenes/cbi-office.webp?v=20261007-office1' : 'assets/scenes/cbi-home.webp';
    scenes[locationId].dataset.timeSlot = 'morning';
    scenes[locationId].load();
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  class CustomEvent {
    constructor(type, options) { this.type = type; this.detail = options.detail; }
  }
  const document = {
    body: { dataset: options.body || {} }, visibilityState: 'visible', addEventListener,
    querySelector: selector => scenes[/="(.*?)"/.exec(selector)[1]] || null
  };
  const context = vm.createContext({
    Date: ClockDate, CustomEvent, document, localStorage, addEventListener,
    dispatchEvent: event => dispatch(event.type, event),
    setInterval: callback => intervals.push(callback),
    location: { href: 'index.html' },
    Image: class { constructor() { throw new Error('Map loads must belong to the displayed image'); } }
  });
  context.window = context;
  vm.runInContext(worldContextSource, context);
  vm.runInContext(source, context);
  vm.runInContext(index.match(/function getCGSlot\(now\)\{[\s\S]*?\n\}/)[0], context);
  vm.runInContext(index.match(/function openSuitcase\(\)\{[\s\S]*?\n\}/)[0], context);
  return {
    scenes, data, document, context, api: context.CBISceneLighting, getCGSlot: context.getCGSlot,
    openSuitcase: () => context.openSuitcase(), dispatch,
    setNow: value => { now = value; },
    tick: () => intervals.forEach(callback => callback())
  };
}

test('both maps and CGs use the same four periods at every exact boundary', () => {
  const { api, getCGSlot } = createHarness();
  const boundaries = [
    [0, 0, 'night'], [5, 59, 'night'], [6, 0, 'morning'], [10, 59, 'morning'],
    [11, 0, 'day'], [16, 59, 'day'], [17, 0, 'evening'], [21, 59, 'evening'],
    [22, 0, 'night'], [23, 59, 'night']
  ];
  for (const [hour, minute, expected] of boundaries) {
    const now = new Date(2026, 9, 7, hour, minute);
    assert.equal(api.getTimeSlot(now), expected);
    assert.equal(getCGSlot(now), expected);
  }
  for (const location of ['office', 'home']) {
    const paths = ['morning', 'day', 'evening', 'night'].map(slot => api.getSceneSource(location, slot));
    assert.equal(new Set(paths).size, 4);
    for (const path of paths) assert.ok(fs.existsSync(path.split('?')[0]), path);
  }
});

test('22:45 startup replaces an old daylight map before any homepage initialization', () => {
  for (const location of ['home', 'office']) {
    const { scenes, api } = createHarness({ location, previous: true });
    assert.equal(scenes[location].src, api.getSceneSource(location, 'night'));
    assert.equal(scenes[location].dataset.timeSlot, 'night');
    assert.equal(scenes[location].requests.length, 1);
  }
});

test('fresh maps request the correct period directly, without a daylight fallback', () => {
  for (const location of ['home', 'office']) {
    const { scenes, api } = createHarness({ location });
    assert.equal(scenes[location].src, api.getSceneSource(location, 'night'));
    assert.equal(scenes[location].requests.length, 1);
    assert.equal(scenes[location === 'home' ? 'office' : 'home'].src, null);
  }
});

test('Suitcase Back preserves a loaded night map through repeated returns', () => {
  for (const location of ['home', 'office']) {
    const fixture = createHarness({ location });
    const scene = fixture.scenes[location];
    scene.load();
    for (let i = 0; i < 4; i++) {
      fixture.openSuitcase();
      assert.equal(fixture.context.location.href, 'suitcase.html');
      fixture.dispatch('pagehide', { persisted: true });
      fixture.dispatch('pageshow', { persisted: true });
      fixture.tick();
      assert.equal(scene.src, fixture.api.getSceneSource(location, 'night'));
    }
    assert.equal(scene.requests.length, 1, 'loaded scenes should not flash or reload on Back');
  }
});

test('Suitcase Home link makes a fresh document choose night immediately', () => {
  assert.match(suitcase, /<a class="top-link" href="index\.html">Home<\/a>/);
  const before = createHarness();
  before.scenes.home.load();
  before.openSuitcase();
  const returned = createHarness({ storage: before.data });
  assert.equal(returned.scenes.home.src, returned.api.getSceneSource('home', 'night'));
  returned.dispatch('pageshow', { persisted: false });
  assert.equal(returned.scenes.home.dataset.timeSlot, 'night');
});

test('Back retries a cancelled image request even when no load or error callback arrives', () => {
  for (const location of ['home', 'office']) {
    const fixture = createHarness({ location });
    const scene = fixture.scenes[location];
    fixture.openSuitcase();
    fixture.dispatch('pagehide', { persisted: true });
    fixture.dispatch('pageshow', { persisted: true });
    assert.equal(scene.requests.length, 2);
    assert.equal(scene.src, fixture.api.getSceneSource(location, 'night'));
    scene.load();
    fixture.tick();
    assert.equal(scene.requests.length, 2);
  }
});

test('visibility resume corrects a daylight snapshot while the homepage clock is unavailable', () => {
  const fixture = createHarness({ previous: true });
  fixture.scenes.home.load();
  fixture.dispatch('visibilitychange', { visibilityState: 'hidden' });
  fixture.scenes.home.src = fixture.api.getSceneSource('home', 'morning');
  fixture.dispatch('visibilitychange', { visibilityState: 'visible' });
  assert.equal(fixture.scenes.home.src, fixture.api.getSceneSource('home', 'night'));
});

test('returning across 22:00 replaces the evening URL immediately and deduplicates clock ticks', () => {
  const fixture = createHarness({ now: new Date(2026, 9, 7, 21, 59) });
  assert.equal(fixture.scenes.home.src, fixture.api.getSceneSource('home', 'evening'));
  fixture.openSuitcase();
  fixture.dispatch('pagehide', { persisted: true });
  fixture.setNow(new Date(2026, 9, 7, 22, 0));
  fixture.dispatch('pageshow', { persisted: true });
  assert.equal(fixture.scenes.home.src, fixture.api.getSceneSource('home', 'night'));
  fixture.tick();
  fixture.tick();
  assert.equal(fixture.scenes.home.requests.length, 2);
});

test('a restored DOM and a changed saved location both receive the current period', () => {
  const fixture = createHarness({ location: 'home', body: { worldId: 'cbi', worldLocation: 'office' } });
  fixture.dispatch('pageshow', { persisted: true });
  for (const location of ['home', 'office']) {
    assert.equal(fixture.scenes[location].src, fixture.api.getSceneSource(location, 'night'));
  }
});

test('manual location changes, world entry, and cloud restore select the current map period', () => {
  const fixture = createHarness({ world: 'liminal' });
  assert.equal(fixture.scenes.home.src, null);
  assert.equal(fixture.scenes.office.src, null);
  fixture.context.WorldContext.setActiveWorldId('cbi');
  assert.equal(fixture.scenes.home.dataset.timeSlot, 'night');
  fixture.context.WorldContext.setActiveLocationId('cbi', 'office');
  assert.equal(fixture.scenes.office.src, fixture.api.getSceneSource('office', 'night'));
  fixture.setNow(new Date(2026, 9, 8, 6, 0));
  fixture.dispatch('liminal-cloud-ready');
  assert.equal(fixture.scenes.office.src, fixture.api.getSceneSource('office', 'morning'));
});

test('map time boundaries continue to work without running the homepage clock', () => {
  const fixture = createHarness({ now: new Date(2026, 9, 7, 10, 59) });
  fixture.scenes.home.load();
  fixture.setNow(new Date(2026, 9, 7, 11, 0));
  fixture.tick();
  assert.equal(fixture.scenes.home.src, fixture.api.getSceneSource('home', 'day'));
  fixture.scenes.home.load();
  fixture.dispatch('visibilitychange', { visibilityState: 'hidden' });
  fixture.setNow(new Date(2026, 9, 7, 17, 0));
  fixture.tick();
  assert.equal(fixture.scenes.home.dataset.timeSlot, 'day');
  fixture.dispatch('visibilitychange', { visibilityState: 'visible' });
  assert.equal(fixture.scenes.home.src, fixture.api.getSceneSource('home', 'evening'));
});

test('a failed night image retries the night URL, and never substitutes daylight', () => {
  const fixture = createHarness();
  fixture.scenes.home.fail();
  fixture.tick();
  assert.deepEqual(fixture.scenes.home.requests, [
    fixture.api.getSceneSource('home', 'night'), fixture.api.getSceneSource('home', 'night')
  ]);
  fixture.scenes.home.load();
  fixture.tick();
  assert.equal(fixture.scenes.home.requests.length, 2);
});
