const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const scene = require('../cbi-office-scene.js');
const lighting = require('../cbi-scene-lighting.js');
const root = path.join(__dirname, '..');
const assetRoot = path.join(root, 'assets/scenes/cbi-office-modules/v1');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'cbi-office-scene.js'), 'utf8');
function roster(mask) {
  return { assignments: Object.fromEntries(scene.ids.map((id, i) =>
    [id, { location: mask & (1 << i) ? 'office' : 'away', mode: mask & (1 << i) ? 'office' : 'field' }])) };
}
function pngDimensions(name) {
  const bytes = fs.readFileSync(path.join(assetRoot, name));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}
function fixture(options = {}) {
  let activeWorld = 'cbi', activeLocation = 'office';
  let currentRoster = roster(options.mask ?? 31);
  let now = new Date(2026, 9, 27, 10, 59);
  const events = {}, requests = [], fetches = [], nodes = {}, desks = {};
  function element() {
    const classes = new Set();
    return {
      style: {}, dataset: {}, attributes: {}, listeners: {}, hidden: false,
      classList: { add: v => classes.add(v), toggle(v, yes) { yes ? classes.add(v) : classes.delete(v); }, remove: v => classes.delete(v), contains: v => classes.has(v) },
      setAttribute(k, v) { this.attributes[k] = v; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      click() { this.clicks = (this.clicks || 0) + 1; }
    };
  }
  function canvas() {
    const el = element();
    el.draws = [];
    const ctx = {
      beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, rect() {},
      save() {}, restore() {}, ellipse() {}, clip() {}, clearRect() {}, fillRect() {},
      drawImage(image, ...args) { el.draws.push([image.name || 'canvas', ...args]); },
      getImageData() { const data = new Uint8ClampedArray(1672 * 941 * 4); data.fill(255); return { data }; },
      putImageData() { el.puts = (el.puts || 0) + 1; }
    };
    el.getContext = () => ctx;
    return el;
  }
  nodes.roomCbiOffice = element();
  nodes.cbiOfficeCanvas = canvas();
  nodes.cbiOfficeCanvas.hidden = true;
  scene.ids.forEach(id => { nodes['char-' + id] = element(); desks[id] = element(); });
  const document = {
    body: { dataset: { worldId: 'cbi', worldLocation: 'office' } }, visibilityState: 'visible',
    getElementById: id => nodes[id] || null,
    querySelector: selector => desks[/data-cbi-desk="([^"]+)"/.exec(selector)?.[1]] || null,
    createElement: tag => tag === 'canvas' ? canvas() : element(),
    addEventListener: (type, fn) => (events[type] ||= []).push(fn)
  };
  const dimensions = { 'empty.png': [1672, 941] };
  scene.ids.forEach(id => { const item = manifest.occupants[id]; dimensions[item.src] = [item.width, item.height]; });
  ['day', 'evening', 'night'].forEach(slot => { dimensions['window-' + slot + '.png'] = [276, 75]; });
  class Image {
    set src(url) {
      requests.push(url);
      this.name = url.split('/').at(-1).split('?')[0];
      const size = dimensions[this.name];
      this.naturalWidth = size?.[0];
      this.naturalHeight = size?.[1];
      queueMicrotask(() => options.failImage === this.name ? this.onerror() : this.onload());
    }
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
    static now() { return now.getTime(); }
  }
  const context = vm.createContext({
    document, Image, Date: ClockDate,
    fetch: url => { fetches.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) }); },
    addEventListener: (type, fn) => (events[type] ||= []).push(fn),
    WorldContext: { getActiveWorldId: () => activeWorld, getActiveLocationId: () => activeLocation },
    CharacterRuntime: { getCbiPresenceRoster: () => currentRoster }
  });
  context.window = context;
  vm.runInContext(source, context);
  return {
    api: context.CBIOfficeScene, context, nodes, requests, fetches, document,
    setRoster: value => { currentRoster = value; },
    setNow: value => { now = value; },
    setWorld: value => { activeWorld = value; },
    setLocation: value => { activeLocation = value; },
    dispatch(type, event = {}) { for (const fn of events[type] || []) fn(event); },
    async loaded() { await context.CBIOfficeScene.whenReady(); await new Promise(resolve => setImmediate(resolve)); }
  };
}
test('all 32 independent rosters work in every one of the four periods', () => {
  const keys = new Set();
  for (let mask = 0; mask < 32; mask++) {
    for (const slot of scene.slots) {
      const input = roster(mask), unchanged = JSON.stringify(input);
      const frame = scene.getFrame(input, slot);
      assert.equal(frame.mask, mask);
      assert.equal(frame.present.length + frame.absent.length, 5);
      assert.deepEqual(frame.present, scene.ids.filter((id, i) => mask & (1 << i)));
      assert.equal(JSON.stringify(input), unchanged, 'rendering must not change the schedule');
      keys.add(frame.key);
    }
  }
  assert.equal(keys.size, 128);
});
test('arrival, errand, home and off-duty states hide the individual instead of using the duty label', () => {
  const input = roster(31);
  input.assignments.jane = { mode: 'office', location: 'home' };
  input.assignments.cho = { mode: 'errand', location: 'away' };
  assert.deepEqual(scene.getFrame(input, 'day').present, ['rigsby', 'vanpelt', 'lisbon']);
  assert.equal(scene.getFrame(null, 'night').mask, 0);
});
test('atlas modules are disjoint and native resolution, and pin the approved green-eyed source', () => {
  assert.equal(scene.validateManifest(manifest), manifest);
  assert.deepEqual(pngDimensions(manifest.empty), [1672, 941]);
  for (const id of scene.ids) {
    const item = manifest.occupants[id];
    assert.deepEqual(pngDimensions(item.src), [item.width, item.height]);
  }
  for (const slot of ['day', 'evening', 'night']) assert.deepEqual(pngDimensions('window-' + slot + '.png'), [276, 75]);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(assetRoot, manifest.approvedFull))).digest('hex');
  assert.equal(hash, '0f77aa261d6620e2c97a75d2d4a990e83c73ff8e77d44cf2b3be1ee18e41853b');
  assert.equal(hash, manifest.approvedSha256);
  const overlapping = JSON.parse(JSON.stringify(manifest));
  overlapping.occupants.cho = { ...overlapping.occupants.lisbon, src: 'cho.png' };
  assert.throws(() => scene.validateManifest(overlapping), /Overlapping/);
});
test('all time boundaries follow the existing homepage clock', () => {
  for (const [hour, minute] of [[0, 0], [5, 59], [6, 0], [10, 59], [11, 0], [16, 59], [17, 0], [21, 59], [22, 0]]) {
    const now = new Date(2026, 9, 27, hour, minute);
    assert.equal(scene.getTimeSlot(now), lighting.getTimeSlot(now));
  }
});
test('lighting keeps the margin white and green irises green in all four periods', () => {
  for (const slot of scene.slots) {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 71, 99, 39, 255, 93, 118, 53, 255]);
    const before = Array.from(pixels);
    scene.applyLightingPixels(pixels, new Uint8Array([0, 255, 255]), slot);
    assert.deepEqual(Array.from(pixels.subarray(0, 4)), [255, 255, 255, 255]);
    for (const offset of [4, 8]) {
      assert.ok(pixels[offset + 1] > pixels[offset], slot);
      assert.ok(pixels[offset + 1] > pixels[offset + 2], slot);
    }
    if (slot === 'morning') assert.deepEqual(Array.from(pixels), before);
  }
});
test('the real homepage roster handler drives the scene and replaces standing portraits', async () => {
  const h = fixture({ mask: 31 });
  h.context.getActiveWorldId = () => 'cbi';
  h.context.getActiveLocationId = () => 'office';
  h.context.syncCbiJaneSleepTargets = () => {};
  h.context.positionCbiOfficeJane = () => {};
  h.context.cbiPresenceTip = id => id;
  h.context.CBI_STAFF_NAMES = Object.fromEntries(scene.ids.map(id => [id, id]));
  vm.runInContext(html.match(/function renderCbiDutyRoster\(\)\{[\s\S]*?\n\}/)[0], h.context);
  h.context.renderCbiDutyRoster();
  await h.loaded();
  assert.equal(h.api.getState().frame.mask, 31);
  assert.equal(h.nodes.roomCbiOffice.classList.contains('cbi-modules-ready'), true);
  assert.equal(h.nodes.cbiOfficeCanvas.hidden, false);
  h.setRoster(roster(0));
  h.context.renderCbiDutyRoster();
  assert.equal(h.api.getState().frame.mask, 0);
  for (const id of scene.ids) assert.equal(h.nodes['char-' + id].classList.contains('is-present'), false);
  assert.match(fs.readFileSync(path.join(root, 'cbi-office-scene.css'), 'utf8'), /cbi-modules-ready \.char-sprite img,[\s\S]*display:none!important/);
});
test('roster changes reuse the same images and repeated ticks do not repaint', async () => {
  const h = fixture();
  h.api.updateRoster(roster(31), 'morning');
  await h.loaded();
  const requests = h.requests.length, before = h.api.getState().drawCount;
  h.api.updateRoster(roster(31), 'morning');
  h.api.updateRoster(roster(31), 'morning');
  assert.equal(h.api.getState().drawCount, before);
  for (const mask of [0, 1, 9, 10, 15, 30, 31]) h.api.updateRoster(roster(mask), 'morning');
  assert.equal(h.requests.length, requests);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.nodes['char-jane'].tabIndex, 0);
  let prevented = false;
  h.nodes['char-jane'].listeners.keydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.nodes['char-jane'].clicks, 1);
});
test('page return, boundaries, cloud restore, and errands refresh the live roster', async () => {
  const h = fixture();
  h.api.refresh();
  await h.loaded();
  assert.equal(h.api.getState().frame.slot, 'morning');
  h.setNow(new Date(2026, 9, 27, 11, 0));
  h.setRoster(roster(5));
  h.dispatch('visibilitychange');
  assert.equal(h.api.getState().frame.mask, 5);
  assert.equal(h.api.getState().frame.slot, 'day');
  h.setLocation('home');
  h.setRoster(roster(0));
  h.dispatch('omniverse:locationchange');
  assert.equal(h.api.getState().frame.mask, 5);
  h.setLocation('office');
  h.setNow(new Date(2026, 9, 27, 22, 0));
  h.dispatch('pageshow');
  assert.equal(h.api.getState().frame.mask, 0);
  assert.equal(h.api.getState().frame.slot, 'night');
  h.setRoster(roster(18));
  h.dispatch('liminal-cloud-ready');
  assert.equal(h.api.getState().frame.mask, 18);
  h.setWorld('liminal');
  h.setRoster(roster(31));
  h.dispatch('storage', { key: 'schedule_user_events' });
  assert.equal(h.api.getState().frame.mask, 18);
});
test('failed module loading preserves the legacy room instead of showing a blank canvas', async () => {
  const h = fixture({ failImage: 'cho.png' });
  h.api.updateRoster(roster(31), 'day');
  await assert.rejects(h.api.whenReady(), /unavailable/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.nodes.cbiOfficeCanvas.hidden, true);
  assert.equal(h.nodes.roomCbiOffice.classList.contains('cbi-modules-ready'), false);
  assert.equal(h.api.getState().ready, false);
  assert.equal(h.api.getState().drawCount, 0);
});
