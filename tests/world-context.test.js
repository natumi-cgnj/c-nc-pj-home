const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function loadScript(file, initial = {}) {
  const events = [];
  const localStorage = new MemoryStorage(initial);
  const window = {
    localStorage,
    dispatchEvent(event) { events.push(event); },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  const context = vm.createContext({ window, console, Date, JSON, Math, Object, Array, String, Number });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { window, localStorage, events };
}

test('world context defaults to liminal without creating a second save', () => {
  const { window, localStorage } = loadScript('world-context.js');
  assert.equal(window.WorldContext.getActiveWorldId(), 'liminal');
  assert.equal(window.WorldContext.getActiveLocationId(), 'apartment');
  assert.equal(window.WorldContext.getActiveLocationId('cbi'), 'office');
  assert.equal(localStorage.getItem(window.WorldContext.STORAGE_KEY), null);
  assert.equal(window.WorldContext.getScopedStorageKey('kitchen_db'), 'kitchen_db');
});

test('world switch changes only context and resolves CBI routes', () => {
  const { window, localStorage, events } = loadScript('world-context.js');
  assert.equal(window.WorldContext.setActiveWorldId('cbi'), true);
  assert.equal(window.WorldContext.getActiveWorldId(), 'cbi');
  assert.equal(window.WorldContext.getRoute('story', 'story.html'), 'cbi.html');
  assert.equal(window.WorldContext.getRoute('wallet', 'wallet.html'), 'world-empty.html?module=wallet');
  assert.equal(window.WorldContext.getScopedStorageKey('kitchen_db'), 'kitchen_db__world__cbi');
  assert.equal(JSON.parse(localStorage.getItem(window.WorldContext.STORAGE_KEY)).activeWorldId, 'cbi');
  assert.equal(events.at(-1).type, 'omniverse:worldchange');
});

test('CBI location is remembered independently from the active world', () => {
  const { window, localStorage, events } = loadScript('world-context.js');
  window.WorldContext.setActiveWorldId('cbi');
  assert.equal(window.WorldContext.setActiveLocationId('cbi', 'home'), true);
  assert.equal(window.WorldContext.getActiveLocationId(), 'home');
  window.WorldContext.setActiveWorldId('liminal');
  assert.equal(window.WorldContext.getActiveLocationId(), 'apartment');
  window.WorldContext.setActiveWorldId('cbi');
  assert.equal(window.WorldContext.getActiveLocationId(), 'home');
  assert.equal(JSON.parse(localStorage.getItem(window.WorldContext.STORAGE_KEY)).locationByWorld.cbi, 'home');
  assert.equal(events.some(event => event.type === 'omniverse:locationchange'), true);
  assert.equal(window.WorldContext.setActiveLocationId('cbi', 'unknown'), false);
});

test('version one world context opens CBI at the office without rewriting old data', () => {
  const legacy = JSON.stringify({ version: 1, activeWorldId: 'cbi' });
  const { window, localStorage } = loadScript('world-context.js', { omniverse_world_context: legacy });
  assert.equal(window.WorldContext.getActiveWorldId(), 'cbi');
  assert.equal(window.WorldContext.getActiveLocationId(), 'office');
  assert.equal(localStorage.getItem('omniverse_world_context'), legacy);
});

test('legacy records stay liminal while global records remain visible', () => {
  const { window } = loadScript('world-context.js');
  window.WorldContext.setActiveWorldId('cbi');
  assert.equal(window.WorldContext.recordIsVisible({ id: 1 }), false);
  assert.equal(window.WorldContext.recordIsVisible({ id: 2, worldId: 'cbi' }), true);
  assert.equal(window.WorldContext.recordIsVisible({ id: 3, scope: 'global' }), true);
});

test('CBI data normalizes, sorts and derives mainline without duplicate storage', () => {
  const { window, localStorage } = loadScript('cbi-data.js');
  const db = window.CBIData.normalize({
    cases: [
      { id: 'later', episodeCode: 'S01E02', date: '2006-02-02', status: 'closed', mainlineStatus: '第二条' },
      { id: 'archive', episodeCode: 'ARCHIVE 00', date: '2003-10-01', status: 'archive', mainlineStatus: '' },
      { id: 'first', episodeCode: 'S01E01', date: '2006-01-01', status: 'active', mainlineStatus: '第一条' }
    ]
  });
  assert.equal(db.currentCaseId, 'first');
  assert.deepEqual(Array.from(window.CBIData.mainlineEntries(db.cases), item => item.id), ['first', 'later']);
  const saved = window.CBIData.save(db);
  assert.equal(saved.cases.length, 3);
  assert.equal(JSON.parse(localStorage.getItem('cbi_db')).personnel.length, 0);
});
