const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function loadDataModel() {
  const localStorage = new MemoryStorage();
  const context = vm.createContext({
    console,
    localStorage,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    setTimeout,
    clearTimeout
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('cbi-data.js', 'utf8'), context, { filename: 'cbi-data.js' });
  return { CBIData: context.CBIData, localStorage };
}

function rewardDb(CBIData) {
  const db = CBIData.emptyDB();
  db.work.salary = 25;
  db.work.shop.projects = [
    {
      id: 'daily_project',
      name: '日常物品',
      category: 'daily',
      items: [
        { id: 'boss_item', name: 'Rollbahn', targetIds: [], reaction: 'Boss把本子翻到了新的一页。', collected: true },
        { id: 'jane_item', name: '茶杯', targetIds: ['jane'], collected: true },
        { id: 'waiting_item', name: '未购入物品', targetIds: ['cho'] }
      ]
    },
    {
      id: 'special_project',
      name: '特别安排',
      category: 'special',
      items: [{ id: 'special_item', name: '聚餐', targetIds: ['rigsby'], collected: true }]
    },
    {
      id: 'legacy_project',
      name: '旧商城物品',
      category: '物品类',
      items: [{ id: 'legacy_item', name: '旧购入本子', targetIds: ['cho'], collected: true }]
    }
  ];
  db.work.shop.owned = ['boss_item', 'jane_item', 'special_item', 'legacy_item'];
  return CBIData.normalize(db);
}

test('check-in reward cabinets read only owned daily-tier shop items', () => {
  const { CBIData } = loadDataModel();
  const items = CBIData.dailyRewardItems(rewardDb(CBIData));
  assert.deepEqual(Array.from(items, item => item.itemId), ['boss_item', 'jane_item', 'legacy_item']);
  assert.equal(items[0].characterId, 'boss');
  assert.equal(items[1].characterId, 'jane');
  assert.equal(items[2].characterId, 'cho');
});

test('refreshing an item spends ten check-in points and saves its dynamic', () => {
  const { CBIData, localStorage } = loadDataModel();
  const first = CBIData.spendCheckinReward(rewardDb(CBIData), 'boss_item', new Date('2026-09-16T12:00:00Z'));
  assert.equal(first.ok, true);
  assert.equal(first.cost, 10);
  assert.equal(first.db.work.salary, 15);
  assert.equal(first.entry.characterId, 'boss');
  assert.equal(first.entry.line, 'Boss把本子翻到了新的一页。');
  assert.equal(first.db.work.checkinRewardLog.length, 1);

  const second = CBIData.spendCheckinReward(first.db, 'boss_item', new Date('2026-09-16T13:00:00Z'));
  assert.equal(second.ok, true);
  assert.equal(second.db.work.salary, 5);
  assert.match(second.entry.line, /Rollbahn/);

  const blocked = CBIData.spendCheckinReward(second.db, 'boss_item', new Date('2026-09-16T14:00:00Z'));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'insufficient_points');
  assert.equal(blocked.db.work.checkinRewardLog.length, 2);
  assert.equal(JSON.parse(localStorage.getItem('cbi_db')).work.checkinRewardLog.length, 2);
});

test('check-in module exposes REWARD then CHECK in a fixed bottom tab bar', () => {
  const daily = fs.readFileSync('daily.html', 'utf8');
  const rewardUi = fs.readFileSync('cbi-checkin-rewards.js', 'utf8');
  const sharedCss = fs.readFileSync('task-modules.css', 'utf8');
  const rewardIndex = rewardUi.indexOf('data-checkin-view="reward">REWARD');
  const checkIndex = rewardUi.indexOf('data-checkin-view="check">CHECK');
  assert.match(daily, /cbi-checkin-rewards\.js\?v=20260916-checkin-reward1/);
  assert.ok(rewardIndex >= 0 && checkIndex > rewardIndex);
  assert.match(rewardUi, /var PEOPLE = \[/);
  for (const id of ['boss', 'jane', 'cho', 'rigsby', 'lisbon', 'vanpelt']) {
    assert.match(rewardUi, new RegExp("id: '" + id + "'"));
  }
  assert.match(rewardUi, /global\.CBIData\.dailyRewardItems\(db\)/);
  assert.match(sharedCss, /\.task-module \.task-bottom-tabs\{/);
  assert.match(sharedCss, /\.task-module \.checkin-cabinet\{/);
});
