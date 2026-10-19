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

function loadMeals(worldId, localStorage = new MemoryStorage(), file = 'meals.html') {
  const elements = new Map();
  const listeners = new Map();
  const views = [];
  const tabs = [];
  const document = {
    querySelectorAll(selector) {
      if (selector === '.view') return views;
      if (selector === '.tab-bar button') return tabs;
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
  const WorldContext = { getActiveWorldId: () => worldId };
  const window = { WorldContext, __LIMINAL_REDIRECTING: false, addEventListener(name, callback) { listeners.set(name, callback); } };
  const context = vm.createContext({
    window,
    WorldContext,
    document,
    localStorage,
    console,
    Date,
    JSON,
    Math,
    Object,
    Array,
    String,
    Number,
    Set,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(inlineScript(file), context, { filename: file + ':inline' });
  return { context, document, elements, localStorage, listeners, views, tabs };
}

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

test('DIET keeps nutrition and calories beside a blank page while legacy dining stays separate', () => {
  const html = fs.readFileSync('diet.html', 'utf8');
  const legacy = fs.readFileSync('meals.html', 'utf8');
  const cloudSync = fs.readFileSync('cloud-sync.js', 'utf8');
  const backup = fs.readFileSync('backup.html', 'utf8');
  assert.match(html, /<h1>DIET<\/h1>/);
  assert.match(html, /id="viewNutrition" class="view active"/);
  assert.match(html, /<div id="viewDraft" class="view"><\/div>/);
  assert.match(html, /id="viewCalories" class="view"/);
  assert.match(html, /switchMealTab\('viewNutrition'/);
  assert.match(html, /switchMealTab\('viewDraft'/);
  assert.match(html, /switchMealTab\('viewCalories'/);
  assert.doesNotMatch(html, /viewMeals|meal_log_db|meal_companion_db|recipeShelf|CFG/);
  assert.match(legacy, /<h1>饮食（旧版）<\/h1>/);
  assert.match(legacy, /id="viewMeals" class="view active"/);
  assert.doesNotMatch(legacy, /viewNutrition|viewCalories|nutrition_check_db|calorie_log_db/);
  assert.doesNotMatch(html, /减脂目标|增重目标|每日限额/);
  assert.match(cloudSync, /'diet\.html': \['calorie_log_db', 'nutrition_check_db', 'omniverse_world_context'\]/);
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
  diet.context.switchMealTab('viewDraft', diet.tabs[2]);
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
  diet.context.switchMealTab('viewNutrition', diet.tabs[0]);
  assert.deepEqual(diet.views.filter(view => view.classList.contains('active')).map(view => view.id), ['viewNutrition']);
  assert.equal(diet.elements.get('worldLabel').textContent, 'REALITY');
});
