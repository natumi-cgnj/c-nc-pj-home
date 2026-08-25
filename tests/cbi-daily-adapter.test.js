const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(key); }
}

function classList() {
  return { add() {}, remove() {}, toggle() {} };
}

function element(extra = {}) {
  return Object.assign({
    value: '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    classList: classList(),
    addEventListener() {},
    removeAttribute() {},
    remove() { this.removed = true; }
  }, extra);
}

function createHarness() {
  const interval = { id: 'interval_1', name: '整理十分钟', description: '整理眼前的一小块', type: 'interval', interval: 1, salary: 10 };
  const count = { id: 'count_1', name: '上架一件闲置', description: '完成一件登记一次', type: 'count', interval: 1, salary: 25 };
  const localStorage = new MemoryStorage({
    cbi_db: JSON.stringify({ work: { salary: 120, habits: [interval, count], habitRecords: {} } })
  });

  const salaryLabel = element({ textContent: '咖啡豆' });
  const salaryWrap = element({ querySelector: () => salaryLabel });
  const teaWrap = element();
  const nodes = {
    statusBar: element(),
    content: element(),
    habitType: element({ value: 'count', dataset: { locked: 'false' } }),
    habitTypeToggle: element(),
    intervalRow: element(),
    habitTypeNote: element(),
    habitRewardLabel: element(),
    habitRewardHint: element(),
    habitCoffee: element({ parentElement: salaryWrap }),
    habitTea: element({ parentElement: teaWrap }),
    habitInterval: element()
  };
  const tabs = element();
  const utility = element();
  const document = {
    body: element(),
    getElementById(id) { return nodes[id] || element(); },
    querySelector(selector) {
      if (selector === '.tabs') return tabs;
      if (selector === '.top-bar .btn-s') return utility;
      return null;
    },
    querySelectorAll() { return []; }
  };
  const context = vm.createContext({
    console,
    localStorage,
    document,
    location: { search: '?tab=habits', href: 'https://example.test/daily.html?tab=habits' },
    history: { replaceState() {} },
    URL,
    URLSearchParams,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Blob,
    setTimeout() { return 0; },
    clearTimeout() {},
    alert() {},
    confirm() { return true; },
    WorldContext: { getActiveWorldId: () => 'cbi' }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('cbi-data.js', 'utf8'), context, { filename: 'cbi-data.js' });
  const html = fs.readFileSync('daily.html', 'utf8');
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1])
    .find((block) => block.includes('const IS_CBI_DAILY'));
  assert.ok(inline, 'daily inline script should be extractable');
  vm.runInContext(inline + '\nglobalThis.__daily={recordHabitProgress,undoHabitProgress,switchHabitSub};', context, { filename: 'daily-inline.js' });
  return { context, localStorage, nodes, tabs, utility, salaryLabel, teaWrap };
}

test('CBI habits render through the liminal cards and pay salary on direct check-in', () => {
  const { context, localStorage, nodes, tabs, utility, salaryLabel, teaWrap } = createHarness();
  assert.equal(context.document.body.dataset.cbiHabits, '1');
  assert.equal(tabs.style.display, 'none');
  assert.equal(utility.removed, true);
  assert.equal(salaryLabel.textContent, '工资');
  assert.equal(teaWrap.style.display, 'none');
  assert.match(nodes.statusBar.innerHTML, /工资/);
  assert.match(nodes.statusBar.innerHTML, /\$120/);
  assert.match(nodes.content.innerHTML, /class="todo-check" onclick="recordHabitProgress\('interval_1',1\)"/);

  context.__daily.recordHabitProgress('interval_1', 1);
  context.__daily.switchHabitSub('count');
  assert.match(nodes.content.innerHTML, /class="habit-add-btn" onclick="recordHabitProgress\('count_1',1\)"/);
  context.__daily.recordHabitProgress('count_1', 1);

  const saved = JSON.parse(localStorage.getItem('cbi_db'));
  const records = Object.values(saved.work.habitRecords);
  assert.equal(saved.work.salary, 155);
  assert.equal(records.reduce((sum, day) => sum + (day.interval_1 && day.interval_1.value || 0), 0), 1);
  assert.equal(records.reduce((sum, day) => sum + (day.count_1 && day.count_1.value || 0), 0), 1);
  assert.equal(localStorage.getItem('habit_db'), null);
});

test('CBI direct check-in can be withdrawn without touching liminal currencies', () => {
  const { context, localStorage } = createHarness();
  context.__daily.recordHabitProgress('interval_1', 1);
  context.__daily.undoHabitProgress('interval_1');
  const saved = JSON.parse(localStorage.getItem('cbi_db'));
  assert.equal(saved.work.salary, 120);
  assert.equal(Object.keys(saved.work.habitRecords).length, 0);
  assert.equal(localStorage.getItem('bean_st'), null);
});
