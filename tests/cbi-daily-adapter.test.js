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
  const interval = { id: 'interval_1', name: '整理十分钟', section: '整理', description: '整理眼前的一小块', type: 'interval', interval: 1, salary: 10 };
  const count = { id: 'count_1', name: '上架一件闲置', section: '消耗', description: '完成一件登记一次', type: 'count', interval: 1, salary: 25 };
  const ungrouped = { id: 'count_2', name: '临时记录', description: '', type: 'count', interval: 1, salary: 5 };
  const localStorage = new MemoryStorage({
    cbi_db: JSON.stringify({ work: { salary: 120, habits: [interval, count, ungrouped], habitRecords: {} } })
  });

  const salaryLabel = element({ textContent: '咖啡豆' });
  const salaryWrap = element({ querySelector: () => salaryLabel });
  const teaWrap = element();
  const nodes = {
    statusBar: element(),
    content: element(),
    habitModalTitle: element(),
    habitName: element(),
    habitSectionRow: element(),
    habitSection: element(),
    habitSectionOptions: element(),
    habitDescription: element(),
    habitTypeFields: element(),
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
  vm.runInContext(inline + '\nglobalThis.__daily={recordHabitProgress,undoHabitProgress,switchHabitSub,toggleHabitSection,openEditHabit,saveHabit};', context, { filename: 'daily-inline.js' });
  return { context, localStorage, nodes, tabs, utility, salaryLabel, teaWrap };
}

test('CBI check-ins use one repeatable list and award points on every tap', () => {
  const { context, localStorage, nodes, tabs, utility, salaryLabel, teaWrap } = createHarness();
  assert.equal(context.document.body.dataset.cbiHabits, '1');
  assert.equal(tabs.style.display, 'none');
  assert.equal(utility.removed, true);
  assert.equal(salaryLabel.textContent, '点数');
  assert.equal(teaWrap.style.display, 'none');
  assert.equal(nodes.habitSectionRow.style.display, 'block');
  assert.equal(nodes.habitTypeFields.style.display, 'none');
  assert.match(nodes.statusBar.innerHTML, /Point/);
  assert.match(nodes.statusBar.innerHTML, /Today/);
  assert.match(nodes.statusBar.innerHTML, />120</);
  assert.match(nodes.content.innerHTML, /class="habit-group-label">整理</);
  assert.match(nodes.content.innerHTML, /class="habit-group-label">消耗</);
  assert.match(nodes.content.innerHTML, /class="habit-group-label">未分栏</);
  assert.doesNotMatch(nodes.content.innerHTML, /Routine|Times|距下次打卡|间隔天数/);
  assert.match(nodes.content.innerHTML, /class="habit-add-btn" onclick="recordHabitProgress\('interval_1',1\)"/);
  assert.ok(nodes.content.innerHTML.indexOf('class="habit-actions"') < nodes.content.innerHTML.indexOf('class="habit-body clickable-body"'));
  assert.ok(nodes.content.innerHTML.indexOf('class="habit-body clickable-body"') < nodes.content.innerHTML.indexOf('class="habit-add-btn"'));

  context.__daily.recordHabitProgress('interval_1', 1);
  context.__daily.recordHabitProgress('interval_1', 1);
  assert.match(nodes.content.innerHTML, /class="habit-add-btn" onclick="recordHabitProgress\('count_1',1\)"/);
  context.__daily.recordHabitProgress('count_1', 1);

  const saved = JSON.parse(localStorage.getItem('cbi_db'));
  const records = Object.values(saved.work.habitRecords);
  assert.equal(saved.work.salary, 165);
  assert.equal(records.reduce((sum, day) => sum + (day.interval_1 && day.interval_1.value || 0), 0), 2);
  assert.equal(records.reduce((sum, day) => sum + (day.count_1 && day.count_1.value || 0), 0), 1);
  assert.ok(saved.work.habits.every((habit) => habit.type === 'count' && habit.interval === 1));
  assert.equal(localStorage.getItem('habit_db'), null);
});

test('CBI check-ins keep editable sections and remember local collapse state', () => {
  const { context, localStorage, nodes } = createHarness();
  context.__daily.toggleHabitSection('all', '消耗');
  assert.match(nodes.content.innerHTML, /class="habit-group collapsed"/);
  assert.match(nodes.content.innerHTML, /class="habit-group-items collapsed"/);
  const collapsed = JSON.parse(localStorage.getItem('cbi_habit_section_collapsed_v1'));
  assert.equal(collapsed['all\u0000消耗'], true);

  context.__daily.openEditHabit('count_1');
  assert.equal(nodes.habitSection.value, '消耗');
  nodes.habitSection.value = '出清';
  context.__daily.saveHabit();
  const saved = JSON.parse(localStorage.getItem('cbi_db'));
  assert.equal(saved.work.habits.find((habit) => habit.id === 'count_1').section, '出清');
  assert.match(nodes.content.innerHTML, /class="habit-group-label">出清</);
});

test('CBI mobile check-in actions stack in one left-hand column', () => {
  const html = fs.readFileSync('daily.html', 'utf8');
  assert.match(html, /@media\(max-width:699px\)\{body\[data-cbi-habits="1"\] \.habit-actions\{[^}]*flex-direction:column/);
  assert.match(html, /const countRow=IS_CBI_HABITS\?countActions\+countBody\+countPrimary/);
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
