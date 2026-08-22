const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

class MemoryStorage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
}

function inlineScript() {
  const html = fs.readFileSync('meals.html', 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 1);
  return scripts[0][1];
}

function loadMeals(worldId, localStorage = new MemoryStorage()) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {} });
      return elements.get(id);
    }
  };
  const WorldContext = { getActiveWorldId: () => worldId };
  const window = { WorldContext, __LIMINAL_REDIRECTING: false };
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
  vm.runInContext(inlineScript(), context, { filename: 'meals.html:inline' });
  return { context, elements, localStorage };
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
