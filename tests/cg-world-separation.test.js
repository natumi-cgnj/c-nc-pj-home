const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function createHarness() {
  const index = fs.readFileSync('index.html', 'utf8');
  const start = index.indexOf("const CG_LIBRARY_KEY='home_cg_library';");
  const end = index.indexOf('\ninitCG();', start);
  assert.ok(start >= 0 && end > start, 'CG source block should be extractable');

  const state = { worldId: 'liminal', locationId: 'apartment' };
  const localStorage = new MemoryStorage();
  const context = vm.createContext({
    console,
    localStorage,
    getActiveWorldId: () => state.worldId,
    getActiveLocationId: () => state.locationId,
    showTip: () => {}
  });
  const exports = [
    'getCurrentCG',
    'getCGDismissedStorageKey',
    'loadCGLibrary',
    'saveCGLibrary'
  ].join(',');
  vm.runInContext(index.slice(start, end) + `\nglobalThis.__cg={${exports}};`, context);
  return { state, localStorage, cg: context.__cg };
}

test('CBI banners follow both location and time of day', () => {
  const { state, cg } = createHarness();
  const noon = new Date('2026-08-23T12:00:00Z');
  const night = new Date('2026-08-23T23:00:00Z');

  state.worldId = 'cbi';
  state.locationId = 'office';
  assert.equal(cg.getCurrentCG(noon).item.src, 'assets/cg/cbi/office-day.webp');
  assert.equal(cg.getCurrentCG(night).item.src, 'assets/cg/cbi/office-night.webp');

  state.locationId = 'home';
  assert.equal(cg.getCurrentCG(noon).item.src, 'assets/cg/cbi/home-day.webp');
  assert.equal(cg.getCurrentCG(night).item.src, 'assets/cg/cbi/home-night.webp');
});

test('legacy liminal CG data survives when CBI contexts are saved', () => {
  const { state, localStorage, cg } = createHarness();
  const slots = {};
  for (const id of ['morning', 'day', 'evening', 'night']) {
    slots[id] = { selected: [`${id}-default`], custom: [] };
  }
  localStorage.setItem('home_cg_library', JSON.stringify({ version: 1, slots }));

  state.worldId = 'cbi';
  state.locationId = 'office';
  const officeLibrary = cg.loadCGLibrary();
  assert.equal(cg.saveCGLibrary(officeLibrary), true);

  const saved = JSON.parse(localStorage.getItem('home_cg_library'));
  assert.deepEqual(saved.contexts.liminal.slots, slots);
  assert.equal(saved.contexts['cbi:office'].slots.day.selected[0], 'cbi-office-day');
  assert.notEqual(cg.getCGDismissedStorageKey('cbi:office'), cg.getCGDismissedStorageKey('cbi:home'));
});
