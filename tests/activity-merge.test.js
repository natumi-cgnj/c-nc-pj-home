const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const migration = require('../activity-migration.js');
const root = path.resolve(__dirname, '..');
const kitchen = fs.readFileSync(path.join(root, 'kitchen.html'), 'utf8');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)])); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  read(key) { return JSON.parse(this.getItem(key)); }
}

function mermaidIsland() {
  return {
    id: 'mermaid', name: 'ちいかわ｜人魚の島のひみつ', icon: 'https://example.invalid/icon.png',
    note: '项目备注', duty: { type: 'custom', name: 'ハチワレ', color: '#4AADE8' },
    sections: [
      { name: '第一弹', count: 10, cols: 4, sectionType: 'collab', subcounts: { food: 5, merch: 5 } },
      { name: '第二弹', count: 9, cols: 3, sectionType: 'activity', subcounts: { shopping: 4, content: 5 } }
    ],
    items: Array.from({ length: 19 }, (_, index) => {
      const type = index < 5 ? 'food' : index < 10 ? 'merch' : index < 14 ? 'shopping' : 'content';
      const complete = index < 3 || (index >= 5 && index < 8) || (index >= 10 && index < 12) || index === 14;
      return { id: `item-${index}`, name: `测试品目 ${index}`, img: `https://example.invalid/${index}.png`, note: '品目备注',
        itemType: type, collected: complete, collectedDate: complete ? '2026-10-07' : null,
        checkinNote: complete ? '感想' : '', checkinImg: complete ? 'https://example.invalid/checkin.png' : '',
        checkinHistory: complete && (type === 'food' || type === 'content') ? [{ id: `history-${index}`, date: '2026-10-07', note: '感想', img: 'https://example.invalid/photo.png' }] : [],
        records: complete && (type === 'merch' || type === 'shopping') ? [{ id: `record-${index}`, date: '2026-10-07', note: '收藏感想', img: 'https://example.invalid/merch.png', status: 'sold', processStatus: 'processed', cost: 280 }] : [] };
    })
  };
}

function loadKitchenModel(projects) {
  const dataStart = kitchen.indexOf('function getProject(');
  const dataEnd = kitchen.indexOf('function adjustSectionGroupCount(', dataStart);
  const behaviorStart = kitchen.indexOf('function getItemSectionType(');
  const behaviorEnd = kitchen.indexOf('function getCheckinHistory(', behaviorStart);
  const sectionStart = kitchen.indexOf('function getItemSectionIndex(');
  const sectionEnd = kitchen.indexOf('function ', sectionStart + 10);
  const context = vm.createContext({ projects, gid: () => 'synthetic-id' });
  vm.runInContext(kitchen.slice(dataStart, dataEnd) + kitchen.slice(behaviorStart, behaviorEnd) + kitchen.slice(sectionStart, sectionEnd), context);
  return context;
}

test('the existing Food model renders migrated mixed activity as 9/19 with all records and images retained', () => {
  const source = mermaidIsland();
  const food = { id: 'food', name: 'スシロー x プリン', category: 'お寿司屋さん', items: [{ id: 'rice', collected: true }], order: 3 };
  const storage = new MemoryStorage({ kitchen_db: [food], activity_db: [source], kitchen_project_categories_v1: ['お寿司屋さん'] });
  assert.equal(migration.migrate(storage).importedCount, 1);
  const projects = storage.read('kitchen_db');
  const imported = projects.find(project => project.id === source.id);
  const model = loadKitchenModel(projects);
  model.migrateKitchenSectionModel();
  model.normalizeProjectSubtypes(imported);
  assert.deepEqual(JSON.parse(JSON.stringify(model.projectStats(imported))), { total: 19, collected: 9 });
  assert.deepEqual(projects[0].items, food.items);
  assert.equal(imported.icon, source.icon);
  assert.deepEqual(imported.duty, source.duty);
  assert.deepEqual(imported.sections.map(section => section.name), source.sections.map(section => section.name));
  imported.items.forEach((item, index) => {
    const { itemType, legacyActivityItemType, ...preserved } = item;
    const { itemType: oldType, ...original } = source.items[index];
    assert.deepEqual(preserved, original);
    assert.equal(legacyActivityItemType, oldType);
  });
  assert.equal(model.getItemBehaviorType(imported, imported.items[10], 10), 'shopping');
  assert.equal(model.getItemBehaviorType(imported, imported.items[14], 14), 'content');
  assert.deepEqual(storage.read('kitchen_project_categories_v1'), ['ポムポムプリン', 'ちいかわ']);
  assert.deepEqual(storage.read('activity_db'), [source], 'legacy archive must remain byte-equivalent');
});

test('reloads, another device and later deletions do not re-add a migrated project', () => {
  const storage = new MemoryStorage({ kitchen_db: [], activity_db: [mermaidIsland()] });
  migration.migrate(storage);
  const baseline = [...storage.data];
  assert.equal(migration.migrate(storage).changed, false);
  assert.deepEqual([...storage.data], baseline);
  const secondDevice = new MemoryStorage();
  secondDevice.data = new Map(storage.data);
  assert.equal(migration.migrate(secondDevice).changed, false);
  secondDevice.setItem('kitchen_db', '[]');
  assert.equal(migration.migrate(secondDevice).changed, false);
  assert.deepEqual(secondDevice.read('kitchen_db'), [], 'a deliberate later deletion stays deleted');
});

test('a partial storage failure is retryable without source loss or duplicate projects', () => {
  const storage = new MemoryStorage({ kitchen_db: [], activity_db: [mermaidIsland()] });
  const write = storage.setItem.bind(storage);
  storage.setItem = (key, value) => { if (key === migration.KEYS.categories) throw new Error('Quota exceeded'); write(key, value); };
  assert.throws(() => migration.migrate(storage), /Quota exceeded/);
  assert.equal(storage.read('activity_db').length, 1);
  assert.equal(storage.getItem(migration.KEYS.migration), null);
  storage.setItem = write;
  migration.migrate(storage);
  assert.equal(storage.read('kitchen_db').length, 1);
  assert.deepEqual(storage.read(migration.KEYS.migration).projectIds, ['mermaid']);
});

test('a colliding project id leaves the original Food project intact', () => {
  const food = { id: 'mermaid', name: 'Original food', items: [{ id: 'original' }], category: '日常' };
  const storage = new MemoryStorage({ kitchen_db: [food], activity_db: [mermaidIsland()] });
  migration.migrate(storage);
  const projects = storage.read('kitchen_db');
  assert.deepEqual(projects[0], food);
  assert.equal(projects[1].id, 'legacy_activity_mermaid');
  assert.equal(projects[1].legacyActivityId, 'mermaid');
});

test('the pre-0730 activity format keeps item data and visit history', () => {
  const project = { id: 'old', name: 'ちいかわ', subs: [
    { id: 'sub', name: '会场', activityType: 'visit', items: [{ id: 'gift', img: 'gift.png', collected: true, records: [{ id: 'r', processStatus: 'processed' }] }],
      sections: [{ name: '周边', count: 1, sectionType: 'merch', cols: 4 }], visits: [{ id: 'visit', date: '2026-10-07', note: '到访', img: 'visit.png' }] }
  ] };
  const storage = new MemoryStorage({ kitchen_db: [], activity_db: [project] });
  migration.migrate(storage);
  const converted = storage.read('kitchen_db')[0];
  assert.equal(converted.items[0].id, 'gift');
  assert.equal(converted.items[0].img, 'gift.png');
  assert.equal(converted.items[1].checkinHistory[0].id, 'visit');
  assert.equal(converted.items[1].checkinHistory[0].img, 'visit.png');
  assert.equal(converted.items[1].legacyActivityItemType, 'content');
  assert.deepEqual(storage.read('activity_db'), [project]);
});

test('malformed destination data does not overwrite either archive', () => {
  const storage = new MemoryStorage({ kitchen_db: { invalid: true }, activity_db: [mermaidIsland()] });
  const before = [...storage.data];
  assert.throws(() => migration.migrate(storage), /unexpected format/);
  assert.deepEqual([...storage.data], before);
});

test('IP grouping happens once and respects later user edits and daily character menus', () => {
  const storage = new MemoryStorage({ kitchen_db: [
    { id: 'kitty', name: 'スシロー x ハローキティ', items: [], category: 'お寿司屋さん' },
    { id: 'subway', name: "サブウェイ's サンドイッチ", duty: { type: 'jane' }, items: [] }
  ] });
  migration.migrate(storage);
  const projects = storage.read('kitchen_db');
  assert.deepEqual(projects.map(project => project.category), ['Hello Kitty', '日常']);
  projects[0].category = '自定义';
  storage.setItem('kitchen_db', JSON.stringify(projects));
  migration.migrate(storage);
  assert.equal(storage.read('kitchen_db')[0].category, '自定义');
});

test('retired shortcuts collapse into one global ACTIVITY while daily meals retain their world route', () => {
  const unrelated = { href: 'wallet.html', moduleId: 'wallet', label: '记账' };
  const meals = { href: 'kitchen.html', moduleId: 'kitchen', label: '饮食' };
  const result = migration.normalizeShortcuts([
    unrelated, { href: 'event.html', label: '活动' }, meals,
    { href: 'kitchen.html', label: 'Food', moduleId: '' }, { href: 'merch.html', label: 'Merch' }
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], unrelated);
  assert.equal(result[1].label, 'ACTIVITY');
  assert.equal(result[1].href, 'kitchen.html');
  assert.equal(result[1].moduleId, '');
  assert.deepEqual(result[2], meals);
  assert.deepEqual(migration.normalizeShortcuts(result), result);
});

test('the actual page initializer waits for cloud data before merging and reopening the requested activity', async () => {
  const storage = new MemoryStorage({ kitchen_db: [] });
  const context = loadKitchenModel([]);
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  let reopened = 0;
  Object.assign(context, {
    window: { CloudSync: { whenReady: () => ready } },
    CloudSync: { whenReady: () => ready },
    ActivityMigration: migration, localStorage: storage, SK: 'kitchen_db',
    renderProjects() {}, restoreInitialView() { reopened++; }, migrateLocalImages() {},
    save() { storage.setItem('kitchen_db', JSON.stringify(context.projects)); },
    showToast() { assert.fail('valid cloud data must not produce an error toast'); }, console
  });
  const footer = kitchen.slice(kitchen.indexOf('function initializeActivity('), kitchen.lastIndexOf('</script>'));
  vm.runInContext(footer, context);
  assert.equal(storage.getItem(migration.KEYS.migration), null, 'nothing is migrated before the cloud pull');
  assert.equal(reopened, 0, 'a saved project hash must not be cleared while its data is still arriving');
  storage.setItem('activity_db', JSON.stringify([mermaidIsland()]));
  resolveReady();
  await ready;
  assert.equal(reopened, 1);
  assert.equal(context.projects.length, 1);
  assert.equal(context.projectStats(context.projects[0]).collected, 9);
  assert.equal(storage.read(migration.KEYS.migration).projectIds[0], 'mermaid');
});

test('an unavailable cloud connection keeps the Food page usable and defers migration completion', async () => {
  const food = { id: 'food', items: [], category: 'お寿司屋さん' };
  const storage = new MemoryStorage({ kitchen_db: [food], activity_db: [mermaidIsland()] });
  const context = loadKitchenModel([food]);
  const ready = Promise.reject(new Error('offline'));
  let reopened = 0;
  Object.assign(context, {
    window: { CloudSync: { whenReady: () => ready } }, CloudSync: { whenReady: () => ready },
    ActivityMigration: migration, localStorage: storage, SK: 'kitchen_db',
    renderProjects() {}, restoreInitialView() { reopened++; }, migrateLocalImages() {},
    save() { storage.setItem('kitchen_db', JSON.stringify(context.projects)); },
    showToast() { assert.fail('offline mode must still render existing records'); }, console
  });
  vm.runInContext(kitchen.slice(kitchen.indexOf('function initializeActivity('), kitchen.lastIndexOf('</script>')), context);
  await ready.catch(() => {});
  assert.equal(reopened, 1);
  assert.equal(context.projects[0].id, 'food');
  assert.equal(storage.getItem(migration.KEYS.migration), null);
  assert.equal(storage.read('activity_db')[0].items.length, 19);
});
