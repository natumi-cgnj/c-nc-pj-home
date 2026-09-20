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
  assert.equal(db.work.suitcase.points, 0);
  assert.deepEqual(Array.from(db.work.suitcase.cleanupLog), []);

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
  assert.equal(saved.work.suitcase.items[0].status, 'collected');
  assert.equal(saved.work.suitcase.items[0].redeemedCost, 0, 'legacy collected items must not invent a point charge');

  const loaded = data.load();
  assert.equal(loaded.work.suitcase.items.length, 1);
  assert.equal(loaded.work.suitcase.items[0].name, '旧手帐本');
});

test('six small clean-out taps earn twelve points and can redeem one inventory item', () => {
  const data = loadData();
  let db = data.emptyDB();
  assert.deepEqual(JSON.parse(JSON.stringify(data.SUITCASE_SIZE_POINTS)), { xlarge: 20, large: 8, medium: 5, small: 2 });
  db.work.suitcase.items.push({ id: 'keep_1', name: '舍不得的本子', status: 'inventory', cost: 10, createdAt: '2026-09-20T08:00:00.000Z' });

  for (let index = 0; index < 6; index += 1) {
    const result = data.recordSuitcaseCleanup(db, 'small', new Date(`2026-09-20T10:00:0${index}.000Z`));
    assert.equal(result.ok, true);
    db = result.db;
  }
  assert.equal(db.work.suitcase.points, 12);
  assert.equal(db.work.suitcase.cleanupLog.length, 6);
  assert.ok(db.work.suitcase.cleanupLog.every(entry => entry.size === 'small' && entry.points === 2));

  const redeemed = data.redeemSuitcaseItem(db, 'keep_1', new Date('2026-09-20T11:00:00.000Z'));
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.db.work.suitcase.points, 2);
  assert.equal(redeemed.item.status, 'collected');
  assert.equal(redeemed.item.redeemedCost, 10);
  assert.equal(redeemed.item.broughtOn, '2026-09-20');
  assert.equal(data.redeemSuitcaseItem(redeemed.db, 'keep_1').reason, 'item_unavailable');
});

test('homepage exposes a CBI-only half-width suitcase card', () => {
  assert.match(index, /id="mobileSuitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /id="suitcaseBlock"[^>]*onclick="openSuitcase\(\)"/);
  assert.match(index, /SUITCASE[\s\S]*?FROM OSAKA/);
  assert.match(index, /getActiveWorldId\(\)==='cbi'\?'FROM SACRAMENTO'/);
  assert.match(index, /body\[data-world-id="cbi"\] \.mobile-suitcase\{display:flex\}/);
  assert.match(index, /body\[data-world-id="cbi"\] \.db-suitcase\{display:flex\}/);
  assert.match(index, /window\.location\.href='suitcase\.html'/);
});

test('suitcase page exposes four direct size taps, inventory redemption, collection and history', () => {
  const collection = suitcase.indexOf('id="collectionList"');
  const inventory = suitcase.indexOf('id="inventoryList"');
  const pointPanel = suitcase.indexOf('id="pointBalance"');
  const history = suitcase.indexOf('id="historyList"');
  assert.ok(collection >= 0 && collection < inventory && inventory < pointPanel && pointPanel < history, 'mobile order must be Sacramento, Osaka, check-in, history');
  const extraLarge = suitcase.indexOf('data-cleanup="xlarge"');
  const large = suitcase.indexOf('data-cleanup="large"');
  const medium = suitcase.indexOf('data-cleanup="medium"');
  const small = suitcase.indexOf('data-cleanup="small"');
  assert.ok(extraLarge >= 0 && extraLarge < large && large < medium && medium < small, 'small must stay on the far right');
  assert.match(suitcase, /\.size-button\.xlarge\{width:47px;height:47px\}/);
  assert.match(suitcase, /\.size-button\.small\{width:62px;height:62px\}/);
  assert.match(suitcase, /data-cleanup="xlarge"[\s\S]*?\+20[\s\S]*?极大/);
  assert.match(suitcase, /data-cleanup="large"[\s\S]*?\+8[\s\S]*?大/);
  assert.match(suitcase, /data-cleanup="medium"[\s\S]*?\+5[\s\S]*?中/);
  assert.match(suitcase, /data-cleanup="small"[\s\S]*?\+2[\s\S]*?小/);
  assert.match(suitcase, /id="pointBalance"/);
  assert.match(suitcase, /id="inventoryList"/);
  assert.match(suitcase, /id="collectionList"/);
  assert.match(suitcase, /id="historyList"/);
  assert.match(suitcase, /id="itemSeries"/);
  assert.match(suitcase, /id="itemCost" type="number"/);
  assert.match(suitcase, /id="itemNote"/);
  assert.match(suitcase, /cbi_suitcase_collapsed_v2/);
  assert.match(suitcase, /function recordCleanup\(size\)/);
  assert.match(suitcase, /function redeemItem\(id\)/);
  assert.match(suitcase, /entry\.count>1\?' ×'/);
  assert.match(suitcase, /data-item=/);
  assert.match(suitcase, /留在家里 \/ 送给谁/);
  assert.doesNotMatch(suitcase, /salary|wallet|shopSpend|CHECK-IN/);
  assert.match(cloud, /'suitcase\.html': \['cbi_db', 'omniverse_world_context'\]/);
});

test('every page that can save CBI data loads the suitcase-aware data model', () => {
  for (const page of cbiDataPages) {
    const html = fs.readFileSync(page, 'utf8');
    assert.match(html, /cbi-data\.js\?v=20260920-suitcase2/, page);
  }
});
