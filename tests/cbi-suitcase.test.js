const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync('cbi-data.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const suitcase = fs.readFileSync('suitcase.html', 'utf8');
const cloud = fs.readFileSync('cloud-sync.js', 'utf8');
const cbiDataPages = ['cbi.html', 'daily.html', 'dynamics.html', 'schedule.html', 'shop.html', 'wallet.html', 'suitcase.html'];

function makeStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function loadData(storage) {
  const context = { console, Date, Math, JSON, localStorage: storage || makeStorage() };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'cbi-data.js' });
  return context.CBIData;
}

test('CBI data normalizes and persists suitcase collection entries', () => {
  const storage = makeStorage();
  const data = loadData(storage);
  const db = data.emptyDB();
  assert.deepEqual(Array.from(db.work.suitcase.items), []);

  db.work.suitcase.items.push({
    id: 'from_osaka_1',
    name: '旧手帐本',
    section: '纸品',
    note: '留在家里',
    broughtOn: '2026-09-19',
    createdAt: '2026-09-19T05:00:00.000Z'
  });
  const saved = data.save(db);
  assert.equal(saved.work.suitcase.items[0].series, '纸品');
  assert.equal(saved.work.suitcase.items[0].note, '留在家里');
  assert.equal(saved.work.suitcase.items[0].broughtOn, '2026-09-19');

  const loaded = data.load();
  assert.equal(loaded.work.suitcase.items.length, 1);
  assert.equal(loaded.work.suitcase.items[0].name, '旧手帐本');
});

test('homepage exposes a CBI-only half-width suitcase card', () => {
  assert.match(index, /id="mobileSuitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /id="suitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /SUITCASE[\s\S]*?FROM OSAKA/);
  assert.match(index, /body\[data-world-id="cbi"\] \.mobile-suitcase\{display:flex\}/);
  assert.match(index, /body\[data-world-id="cbi"\] \.db-suitcase\{display:flex\}/);
  assert.match(index, /window\.location\.href='suitcase\.html'/);
});

test('suitcase page provides one editable record for collection and history views', () => {
  assert.match(suitcase, /id="collectionList"/);
  assert.match(suitcase, /id="historyList"/);
  assert.match(suitcase, /id="itemSeries"/);
  assert.match(suitcase, /id="itemDate" type="date"/);
  assert.match(suitcase, /id="itemNote"/);
  assert.match(suitcase, /cbi_suitcase_collapsed_v1/);
  assert.match(suitcase, /function renderCollection\(items\)/);
  assert.match(suitcase, /function renderHistory\(items\)/);
  assert.match(suitcase, /data-item=/);
  assert.match(suitcase, /留在家里 \/ 送给谁/);
  assert.doesNotMatch(suitcase, /salary|wallet|shopSpend|CHECK-IN/);
  assert.match(cloud, /'suitcase\.html': \['cbi_db', 'omniverse_world_context'\]/);
});

test('every page that can save CBI data loads the suitcase-aware data model', () => {
  for (const page of cbiDataPages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20260920-suitcase1/, page);
  }
});
