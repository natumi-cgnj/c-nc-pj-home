const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function inlineScript(file = 'meals.html') {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  return scripts[0][1];
}

function loadMeals(worldId, localStorage = new MemoryStorage(), file = 'meals.html', clock) {
  const elements = new Map();
  const listeners = new Map();
  const views = [];
  const tabs = [];
  const calorieTypes = [];
  const intervals = [];
  const location = { hash: '' };
  const document = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    querySelector(selector) {
      const type = selector.match(/^#calorieTypeGroup button\[data-value="([^"]+)"\]$/);
      return type ? calorieTypes.find(button => button.dataset.value === type[1]) || null : null;
    },
    querySelectorAll(selector) {
      if (selector === '.view') return views;
      if (selector === '.tab-bar button') return tabs;
      if (selector === '#calorieTypeGroup button') return calorieTypes;
      return [];
    },
    getElementById(id) {
      if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, {
          id,
          innerHTML: '',
          textContent: '',
          value: '',
          max: '',
          dataset: {},
          style: {},
          setAttribute(name, value) { this[name] = value; },
          classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            toggle(name, force) {
              const enabled = force === undefined ? !classes.has(name) : !!force;
              if (enabled) classes.add(name); else classes.delete(name);
              return enabled;
            },
            contains(name) { return classes.has(name); }
          }
        });
      }
      return elements.get(id);
    }
  };
  const html = fs.readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<div id="([^"]+)" class="view( active)?"/g)) {
    const view = document.getElementById(match[1]);
    if (match[2]) view.classList.add('active');
    views.push(view);
  }
  for (const match of html.matchAll(/<button[^>]*onclick="switchMealTab\('([^']+)',this\)"/g)) {
    const tab = document.getElementById('tab-' + match[1]);
    if (match[0].includes('class="active"')) tab.classList.add('active');
    tabs.push(tab);
  }
  for (const match of html.matchAll(/<button[^>]*data-value="(intake|burn|steps)"/g)) {
    const button = document.getElementById('calorie-type-' + match[1]);
    button.dataset.value = match[1];
    if (match[0].includes('class="active"')) button.classList.add('active');
    calorieTypes.push(button);
  }
  const WorldContext = { getActiveWorldId: () => worldId };
  const window = { WorldContext, __LIMINAL_REDIRECTING: false, addEventListener(name, callback) { listeners.set(name, callback); } };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return new Date(clock.now).getTime(); }
  }
  const context = vm.createContext({
    window,
    WorldContext,
    document,
    localStorage,
    console,
    Date: clock ? ClockDate : Date,
    Intl,
    location,
    history: { replaceState(_state, _title, hash) { location.hash = hash; } },
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Set,
    setTimeout,
    clearTimeout,
    setInterval(callback) { intervals.push(callback); return intervals.length; }
  });
  vm.runInContext(inlineScript(file), context, { filename: file + ':inline' });
  return { context, document, elements, localStorage, listeners, views, tabs, calorieTypes, intervals };
}

test('DIET follows Japan 04:00 on an open page and preserves a deliberately selected history day', () => {
  const clock = { now: '2026-10-29T03:59:59+09:00' };
  const app = loadMeals('cbi', new MemoryStorage(), 'diet.html', clock);
  assert.equal(app.elements.get('nutritionDate').textContent, '今天 · 2026-10-28');
  clock.now = '2026-10-29T04:00:01+09:00';
  app.listeners.get('pageshow')();
  assert.equal(app.elements.get('nutritionDate').textContent, '今天 · 2026-10-29');
  app.context.cycleNutrition('protein');
  assert.equal(JSON.parse(app.localStorage.getItem('nutrition_check_db')).days['2026-10-29'].protein, 1);
  app.context.shiftNutritionDay(-2);
  clock.now = '2026-10-30T04:00:01+09:00';
  app.listeners.get('visibilitychange')();
  assert.equal(app.elements.get('nutritionDate').textContent, '2026-10-27');
  app.context.cycleNutrition('calcium');
  assert.equal(JSON.parse(app.localStorage.getItem('nutrition_check_db')).days['2026-10-27'].calcium, 1);
});

test('DIET rolls the current day before a first click after suspension and keeps a calorie draft intact', () => {
  const clock = { now: '2026-10-29T03:59:59+09:00' };
  const app = loadMeals('cbi', new MemoryStorage(), 'diet.html', clock);
  app.context.openCalorieModal();
  app.elements.get('calorieDetail').value = '未保存的餐食';
  app.elements.get('calorieAmount').value = '321';
  clock.now = '2026-10-29T04:00:01+09:00';
  app.context.cycleNutrition('protein');
  assert.equal(JSON.parse(app.localStorage.getItem('nutrition_check_db')).days['2026-10-29'].protein, 1);
  for (const refresh of app.intervals) refresh();
  assert.equal(app.elements.get('calorieDetail').value, '未保存的餐食');
  assert.equal(app.elements.get('calorieAmount').value, '321');
  assert.equal(app.elements.get('calorieDate').value, '2026-10-28', 'an explicit draft date is not silently reassigned');
  assert.equal(app.elements.get('calorieModal').classList.contains('show'), true);
});

test('actual meals survive a world switch while companion layers remain separate', () => {
  const storage = new MemoryStorage();
  const cbi = loadMeals('cbi', storage);
  cbi.context.saveMyFood('2026-08-22', 'day', '乌冬');

  let mealLog = JSON.parse(storage.getItem('meal_log_db'));
  assert.equal(mealLog.days['2026-08-22'].day[0].text, '乌冬');
  assert.match(cbi.elements.get('worldEmptyArea').innerHTML, /CBI 饮食陪伴尚未建立/);
  assert.match(cbi.elements.get('recipeShelf').innerHTML, /CBI 菜谱项目/);

  const companion = JSON.parse(storage.getItem('meal_companion_db'));
  companion.worlds.cbi.days['2026-08-22'] = {
    day: { jane: ['Tea'] }
  };
  storage.setItem('meal_companion_db', JSON.stringify(companion));

  const liminal = loadMeals('liminal', storage);
  mealLog = JSON.parse(storage.getItem('meal_log_db'));
  assert.equal(mealLog.days['2026-08-22'].day[0].text, '乌冬');
  assert.equal(vm.runInContext("(()=>{const holder=getWorldCompanion();return holder.data===holder.store.worlds.liminal})()", liminal.context), true);
  assert.equal(vm.runInContext("(()=>{const holder=getWorldCompanion();return holder.data===holder.store.worlds.cbi})()", liminal.context), false);
  assert.match(liminal.elements.get('recipeShelf').innerHTML, /沙拉盲盒/);
});

test('CBI starts without a copied character roster or generated companion meals', () => {
  const { context, localStorage } = loadMeals('cbi');
  assert.deepEqual(Array.from(vm.runInContext('Object.keys(CFG.characters)', context)), []);
  const store = JSON.parse(localStorage.getItem('meal_companion_db'));
  const generatedSlots = Object.values(store.worlds.cbi.days).flatMap(day => Object.values(day));
  assert.equal(generatedSlots.every(slot => Object.keys(slot).length === 0), true);
});

test('DIET combines nutrition and calories beside body and world pages while legacy dining stays separate', () => {
  const html = fs.readFileSync('diet.html', 'utf8');
  const legacy = fs.readFileSync('meals.html', 'utf8');
  const cloudSync = fs.readFileSync('cloud-sync.js', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');
  assert.match(html, /<h1>DIET<\/h1>/);
  assert.match(html, /id="viewNutrition" class="view active"/);
  assert.match(html, /<div id="viewDraft" class="view"/);
  assert.match(html, /src="diet-world\.js\?v=/);
  assert.match(html, /id="viewBody" class="view"/);
  assert.match(html, /switchMealTab\('viewNutrition'/);
  assert.match(html, /switchMealTab\('viewDraft'/);
  assert.match(html, /switchMealTab\('viewBody'/);
  assert.doesNotMatch(html, /viewMeals|meal_log_db|meal_companion_db|recipeShelf|CFG/);
  assert.match(legacy, /<h1>饮食（旧版）<\/h1>/);
  assert.match(legacy, /id="viewMeals" class="view active"/);
  assert.doesNotMatch(legacy, /viewNutrition|viewCalories|nutrition_check_db|calorie_log_db/);
  assert.doesNotMatch(html, /减脂目标|增重目标|每日限额/);
  const dietKeys = cloudSync.match(/'diet\.html': \[([^\]]+)\]/)[1];
  for (const key of ['calorie_log_db', 'nutrition_check_db', 'body_log_db', 'diet_world_state_v1', 'wallet_accounts_v1', 'omniverse_world_context']) {
    assert.ok(dietKeys.includes("'" + key + "'"), key + ' participates in DIET sync');
  }
  assert.match(cloudSync, /'meals\.html': \['meal_log_db', 'meal_companion_db'/);
  assert.match(backup, /key:'calorie_log_db'/);
  assert.match(cloudSync, /const STATE_KEYS = \[[\s\S]*?'nutrition_check_db'/);

  const storage = new MemoryStorage();
  const cbi = loadMeals('cbi', storage, 'diet.html');
  const add = (type, detail, kcal) => {
    cbi.document.getElementById('calorieDate').value = '2026-09-11';
    cbi.document.getElementById('calorieType').value = type;
    cbi.document.getElementById('calorieDetail').value = detail;
    cbi.document.getElementById('calorieAmount').value = String(kcal);
    cbi.context.saveCalorieRecord();
  };
  add('intake', '汉堡', 400);
  add('burn', '散步', 150);

  const saved = JSON.parse(storage.getItem('calorie_log_db'));
  assert.equal(saved.records.length, 2);
  assert.deepEqual(saved.records.map(record => [record.type, record.detail, record.kcal]), [
    ['intake', '汉堡', 400],
    ['burn', '散步', 150]
  ]);
  const stats = cbi.context.calorieStatsForDay('2026-09-11');
  assert.equal(stats.intake, 400);
  assert.equal(stats.burn, 150);
  assert.equal(stats.net, 250);
  assert.match(cbi.elements.get('calorieHistory').innerHTML, /汉堡/);
  assert.match(cbi.elements.get('calorieHistory').innerHTML, /散步/);

  const liminal = loadMeals('liminal', storage, 'diet.html');
  assert.equal(liminal.context.getCalorieLog().records.length, 2);
});

test('DIET opens existing records without writing or initializing legacy dining, and refreshes cloud updates', () => {
  const day = new Date();
  day.setHours(day.getHours() - 4);
  const date = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
  const storage = new MemoryStorage({
    meal_log_db: JSON.stringify({ version: 1, days: { [date]: { day: [{ id: 'meal', text: '乌冬' }] } }, legacyMigrated: true }),
    meal_companion_db: JSON.stringify({ worlds: { cbi: { appointments: [{ id: 'keep' }] } } }),
    calorie_log_db: JSON.stringify({ version: 1, records: [{ id: 'meal-kcal', date, type: 'intake', detail: '乌冬', kcal: 757, nutrients: { protein: 21.4 } }] }),
    nutrition_check_db: JSON.stringify({ version: 1, days: { [date]: { protein: 2, carbs: 1 } } })
  });
  const before = [...storage.data];
  const diet = loadMeals('cbi', storage, 'diet.html');
  assert.deepEqual([...storage.data], before);
  assert.equal(diet.elements.get('nutritionIntake').textContent, 757);
  assert.match(diet.elements.get('nutritionRows').innerHTML, /蛋白质：够了/);
  assert.equal(diet.elements.has('miniCalArea'), false);
  assert.equal(diet.elements.has('diningInviteArea'), false);
  diet.context.switchMealTab('viewDraft', diet.tabs[1]);
  assert.deepEqual(diet.views.filter(view => view.classList.contains('active')).map(view => view.id), ['viewDraft']);
  assert.equal(diet.elements.get('viewDraft').innerHTML, '');
  diet.context.switchMealTab('viewMeals', diet.tabs[0]);
  assert.deepEqual(diet.views.filter(view => view.classList.contains('active')).map(view => view.id), ['viewDraft']);
  assert.deepEqual([...storage.data], before);

  diet.context.cycleNutrition('protein');
  assert.equal(JSON.parse(storage.getItem('nutrition_check_db')).days[date].protein, 0);
  assert.equal(storage.getItem('meal_log_db'), before.find(entry => entry[0] === 'meal_log_db')[1]);
  assert.equal(storage.getItem('meal_companion_db'), before.find(entry => entry[0] === 'meal_companion_db')[1]);
  assert.deepEqual(JSON.parse(storage.getItem('calorie_log_db')).records[0].nutrients, { protein: 21.4 });

  const log = JSON.parse(storage.getItem('calorie_log_db'));
  log.records.push({ id: 'burn', date, type: 'burn', detail: '散步', kcal: 100 });
  storage.setItem('calorie_log_db', JSON.stringify(log));
  diet.listeners.get('liminal-cloud-ready')();
  assert.equal(diet.elements.get('nutritionNet').textContent, '657');
  assert.match(diet.elements.get('calorieHistory').innerHTML, /散步/);
  diet.context.switchMealTab('viewNutrition', diet.tabs[2]);
  assert.deepEqual(diet.views.filter(view => view.classList.contains('active')).map(view => view.id), ['viewNutrition']);
  assert.equal(diet.elements.get('worldLabel').textContent, 'REALITY');
});

function chooseSteps(diet, date) {
  diet.context.openCalorieModal();
  if (date) diet.document.getElementById('calorieDate').value = date;
  diet.context.pickCalorieType(diet.calorieTypes.find(button => button.dataset.value === 'steps'));
}

test('DIET converts WeChat steps into burn kcal and updates the nutrition summary', () => {
  const diet = loadMeals('cbi', new MemoryStorage(), 'diet.html');
  const today = diet.context.workdayKey();
  const log = { version: 1, records: [
    { id: 'meal', date: today, type: 'intake', detail: '乌冬', kcal: 757 },
    { id: 'exercise', date: today, type: 'burn', detail: '运动', kcal: 100 }
  ] };
  diet.localStorage.setItem('calorie_log_db', JSON.stringify(log));
  chooseSteps(diet);
  assert.deepEqual(diet.calorieTypes.map(button => button.dataset.value), ['intake', 'burn', 'steps']);
  assert.equal(diet.elements.get('calorieManualFields').hidden, true);
  assert.equal(diet.elements.get('calorieStepFields').hidden, false);
  diet.elements.get('calorieSteps').value = '12345';
  diet.context.renderStepEstimate();
  assert.equal(diet.elements.get('calorieStepEstimate').textContent, '1000 步＝30 kcal · 预计消耗 370 kcal');
  diet.context.saveCalorieRecord();

  const saved = JSON.parse(diet.localStorage.getItem('calorie_log_db'));
  assert.deepEqual(saved.records.slice(0, 2), log.records);
  assert.deepEqual([saved.records[2].type, saved.records[2].source, saved.records[2].steps, saved.records[2].kcal], ['burn', 'wechat_steps', 12345, 370]);
  assert.equal(diet.elements.get('calorieModal').classList.contains('show'), false);
  assert.equal(diet.elements.get('nutritionIntake').textContent, 757);
  assert.equal(diet.elements.get('nutritionBurn').textContent, 470);
  assert.equal(diet.elements.get('nutritionNet').textContent, '287');
  assert.match(diet.elements.get('calorieHistory').innerHTML, /calorie-kind steps">步<\/span>.*微信步数 12,345 步.*calorie-amount steps">−370 kcal/);
});

test('DIET daily step totals replace the same date without duplicating or changing manual exercise', () => {
  const diet = loadMeals('cbi', new MemoryStorage(), 'diet.html');
  chooseSteps(diet, '2026-09-11');
  diet.elements.get('calorieSteps').value = '10000';
  diet.context.saveCalorieRecord();
  const initial = JSON.parse(diet.localStorage.getItem('calorie_log_db')).records[0];

  chooseSteps(diet, '2026-09-11');
  assert.equal(diet.elements.get('calorieSteps').value, '10000');
  diet.elements.get('calorieSteps').value = '8000';
  diet.context.saveCalorieRecord();
  diet.context.saveCalorieRecord();
  let saved = JSON.parse(diet.localStorage.getItem('calorie_log_db'));
  assert.equal(saved.records.length, 1);
  assert.equal(saved.records[0].id, initial.id);
  assert.equal(saved.records[0].createdAt, initial.createdAt);
  assert.equal(saved.records[0].steps, 8000);
  assert.equal(saved.records[0].kcal, 240);

  chooseSteps(diet, '2026-09-12');
  assert.equal(diet.elements.get('calorieSteps').value, '');
  diet.elements.get('calorieSteps').value = '5000';
  diet.context.saveCalorieRecord();
  saved = JSON.parse(diet.localStorage.getItem('calorie_log_db'));
  assert.equal(saved.records.length, 2);
  assert.equal(diet.context.calorieStatsForDay('2026-09-11').burn, 240);
  assert.equal(diet.context.calorieStatsForDay('2026-09-12').burn, 150);
  diet.context.deleteCalorieRecord(initial.id);
  assert.equal(diet.context.calorieStatsForDay('2026-09-11').burn, 0);
  assert.equal(diet.context.calorieStatsForDay('2026-09-12').burn, 150);
});

test('DIET step drafts survive type switches and load the selected date without stale fields', () => {
  const diet = loadMeals('cbi', new MemoryStorage(), 'diet.html');
  chooseSteps(diet, '2026-09-11');
  diet.elements.get('calorieSteps').value = '6000';
  diet.context.saveCalorieRecord();
  chooseSteps(diet, '2026-09-12');
  diet.elements.get('calorieSteps').value = '7000';
  diet.context.pickCalorieType(diet.calorieTypes[1]);
  assert.equal(diet.elements.get('calorieManualFields').hidden, false);
  assert.equal(diet.elements.get('calorieStepFields').hidden, true);
  assert.equal(diet.elements.get('calorieDetailLabel').textContent, '做了什么运动');
  diet.context.pickCalorieType(diet.calorieTypes[2]);
  assert.equal(diet.elements.get('calorieSteps').value, '7000');
  diet.elements.get('calorieDate').value = '2026-09-11';
  diet.context.syncCalorieSteps();
  assert.equal(diet.elements.get('calorieSteps').value, '6000');
  assert.match(diet.elements.get('calorieStepEstimate').textContent, /预计消耗 180 kcal/);

  diet.context.closeMealModal('calorieModal');
  diet.context.openCalorieModal();
  assert.equal(diet.elements.get('calorieType').value, 'intake');
  assert.equal(diet.elements.get('calorieManualFields').hidden, false);
  assert.equal(diet.elements.get('calorieStepFields').hidden, true);
  assert.equal(diet.elements.get('calorieSteps').value, '');
  assert.equal(diet.elements.get('calorieDetailLabel').textContent, '吃了什么');
});

test('DIET validates step counts and dates, allowing zero and small counts rounded to zero kcal', () => {
  const diet = loadMeals('cbi', new MemoryStorage(), 'diet.html');
  chooseSteps(diet, '2026-09-11');
  for (const invalid of ['', '-1', '1.5', 'Infinity', '9007199254740992', 'abc']) {
    diet.elements.get('calorieSteps').value = invalid;
    diet.context.saveCalorieRecord();
    assert.equal(diet.localStorage.getItem('calorie_log_db'), null, invalid);
    assert.equal(diet.elements.get('calorieModal').classList.contains('show'), true);
  }
  diet.elements.get('calorieSteps').value = '1000';
  for (const invalid of ['', '2026-02-30', '9999-01-01']) {
    diet.elements.get('calorieDate').value = invalid;
    diet.context.saveCalorieRecord();
    assert.equal(diet.localStorage.getItem('calorie_log_db'), null, invalid);
  }
  diet.elements.get('calorieDate').value = '2026-09-11';
  for (const count of ['0', '1']) {
    diet.elements.get('calorieSteps').value = count;
    diet.context.saveCalorieRecord();
    const saved = JSON.parse(diet.localStorage.getItem('calorie_log_db'));
    assert.equal(saved.records.length, 1);
    assert.equal(saved.records[0].steps, Number(count));
    assert.equal(saved.records[0].kcal, 0);
  }
});

test('DIET step records survive reload and cloud refresh across worlds without rewriting other stores', () => {
  const storage = new MemoryStorage({
    meal_log_db: JSON.stringify({ keep: 'legacy meals' }),
    nutrition_check_db: JSON.stringify({ version: 1, days: { '2026-09-11': { protein: 2 } } }),
    omniverse_world_context: JSON.stringify({ activeWorldId: 'cbi' })
  });
  const before = [...storage.data];
  const diet = loadMeals('cbi', storage, 'diet.html');
  chooseSteps(diet);
  diet.elements.get('calorieSteps').value = '10000';
  diet.context.saveCalorieRecord();
  for (const [key, value] of before) assert.equal(storage.getItem(key), value);
  const after = [...storage.data];
  const reloaded = loadMeals('liminal', storage, 'diet.html');
  assert.deepEqual([...storage.data], after);
  assert.equal(reloaded.elements.get('nutritionBurn').textContent, 300);
  chooseSteps(reloaded);
  assert.equal(reloaded.elements.get('calorieSteps').value, '10000');
  assert.deepEqual([...storage.data], after);
  const log = JSON.parse(storage.getItem('calorie_log_db'));
  log.records[0].steps = 20000;
  log.records[0].kcal = 600;
  log.records[0].detail = '微信步数 20,000 步';
  storage.setItem('calorie_log_db', JSON.stringify(log));
  reloaded.listeners.get('liminal-cloud-ready')();
  assert.equal(reloaded.elements.get('nutritionBurn').textContent, 600);
  assert.equal(reloaded.elements.get('nutritionNet').textContent, '−600');
});
