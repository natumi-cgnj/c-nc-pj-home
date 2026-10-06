const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const index = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('cbi-scene-lighting.js', 'utf8');

function createHarness() {
  const pending = [];
  const scenes = {};
  for (const location of ['office', 'home']) {
    scenes[location] = {
      src: location === 'office'
        ? 'assets/scenes/cbi-office.webp?v=20261007-office1'
        : 'assets/scenes/cbi-home.webp',
      dataset: { timeSlot: 'morning' },
      getAttribute(name) { return this[name]; },
      setAttribute(name, value) { this[name] = value; }
    };
  }
  class Image {
    set src(value) { this.source = value; pending.push(this); }
  }
  const context = vm.createContext({
    Image,
    document: { querySelector: selector => scenes[/="(.*?)"/.exec(selector)[1]] }
  });
  vm.runInContext(source, context);
  vm.runInContext(index.match(/function getCGSlot\(now\)\{[\s\S]*?\n\}/)[0], context);
  return { scenes, pending, api: context.CBISceneLighting, getSlot: context.getCGSlot };
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
