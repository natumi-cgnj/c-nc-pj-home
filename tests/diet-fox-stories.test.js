const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const stories = require('../diet-fox-stories.js');
const bodyModel = require('../body-model.js');

test('six independent fox scenes contain complete, aligned Chinese, Japanese and English beats', () => {
  let position = stories.initial();
  const ids = new Set();
  for (let i = 0; i < 36; i++) {
    const zh = stories.frame(position, 'zh', 'zh');
    ids.add(zh.id);
    assert.equal(zh.storyCount, 6);
    assert.equal(zh.lineCount, 6);
    for (const lang of ['zh', 'ja', 'en']) {
      const localized = stories.frame(position, lang, lang);
      assert.equal(localized.id, zh.id);
      assert.equal(localized.lineNumber, zh.lineNumber);
      assert.equal(localized.isPlayer, zh.isPlayer);
      assert.ok(localized.title && localized.text && localized.hint);
      assert.equal(localized.speaker, zh.isPlayer ? { zh: '你', ja: 'あなた', en: 'You' }[lang] : '');
    }
    position = stories.advance(position);
  }
  assert.equal(ids.size, 6);
  assert.deepEqual(position, stories.initial());
});

test('story advancement and UI labels are independent of the dialogue language', () => {
  const initial = stories.initial(), second = stories.advance(initial);
  const frame = stories.frame(second, 'ja', 'en');
  assert.equal(frame.text, 'お品書きにそんな一品はないよ。');
  assert.equal(frame.heading, 'Little moments');
  assert.equal(frame.hint, 'Click to continue');
  assert.equal(frame.speaker, 'あなた');
  assert.equal(stories.frame({ story: 0, line: 5 }, 'zh', 'zh').hint, '点击下一段');
  assert.equal(stories.frame({ story: 5, line: 5 }, 'en', 'en').hint, 'Read from the start');
  assert.deepEqual(initial, { story: 0, line: 0 });
});

function controller() {
  const values = new Map([
    ['diet_world_state_v1', JSON.stringify({ activeWorldId: 'fox' })],
    ['wallet_accounts_v1', JSON.stringify({ stage: { activeWorldId: 'meta', worlds: [{ id: 'fox', title: 'Patrick狐狐' }] } })]
  ]);
  const reads = [], writes = [], listeners = {};
  const localStorage = {
    getItem(key) { reads.push(key); return values.get(key) || null; },
    setItem(key, value) { writes.push(key); values.set(key, value); }
  };
  const panel = { innerHTML: '', querySelector() { return { focus() {} }; } };
  const view = {
    innerHTML: '',
    addEventListener(name, callback) { listeners['view:' + name] = callback; },
    querySelector(selector) { return selector === '[data-diet-fox-story]' && this.innerHTML.includes('data-diet-fox-story') ? panel : null; }
  };
  const modal = { addEventListener() {} };
  const document = {
    getElementById(id) { return id === 'viewDraft' ? view : modal; },
    createElement() { return modal; },
    body: { dataset: {}, appendChild() {} }
  };
  const window = { BodyModel: bodyModel, AppLanguage: { uiLanguage: 'zh', dialogue: 'zh' },
    addEventListener(name, callback) { listeners[name] = callback; } };
  const context = vm.createContext({ window, document, localStorage, Date, console });
  for (const file of ['diet-fox-stories.js', 'diet-world.js']) {
    vm.runInContext(fs.readFileSync(require.resolve('../' + file), 'utf8'), context);
  }
  return { window, document, view, panel, reads, writes, listeners, values,
    click() { listeners['view:click']({ target: { closest(selector) { return selector === '[data-diet-fox-next]' ? this : null; } } }); },
    select(id) { values.set('diet_world_state_v1', JSON.stringify({ activeWorldId: id })); window.DietWorld.render(); }
  };
}

test('the DIET fox world has the ledger-style event panel without requiring cloud or writing any records', () => {
  const c = controller();
  c.window.DietWorld.render();
  assert.match(c.view.innerHTML, /class="ledger-task-panel diet-fox-story" data-diet-fox-story/);
  assert.match(c.view.innerHTML, /午餐的额外配菜/);
  assert.match(c.view.innerHTML, /金色的尾巴/);
  assert.match(c.view.innerHTML, /world-files\.html\?world=fox/);
  assert.match(c.view.innerHTML, /Patrick狐狐/);
  c.click();
  assert.match(c.panel.innerHTML, /菜单上没有这一项。/);
  assert.match(c.panel.innerHTML, /点击继续 · 2 \/ 6/);
  c.window.DietWorld.render();
  assert.match(c.view.innerHTML, /点击继续 · 2 \/ 6/);
  assert.deepEqual(c.writes, []);
  assert.deepEqual([...new Set(c.reads)].sort(), ['diet_world_state_v1', 'wallet_accounts_v1']);
});

test('switching away never shows fox content or advances its position; language changes preserve the same beat', () => {
  const c = controller();
  c.window.DietWorld.render();
  c.click();
  for (const id of ['meta', 'sacramento', 'palace', 'heist']) {
    c.select(id);
    assert.doesNotMatch(c.view.innerHTML, /data-diet-fox-story/);
    assert.match(c.view.innerHTML, /data-ui="暂无"/);
    c.click();
  }
  c.select('fox');
  assert.match(c.view.innerHTML, /点击继续 · 2 \/ 6/);
  c.window.AppLanguage.uiLanguage = 'en';
  c.window.AppLanguage.dialogue = 'ja';
  c.listeners['omniverse:languagechange']();
  assert.match(c.panel.innerHTML, /お品書きにそんな一品はないよ。/);
  assert.match(c.panel.innerHTML, /Click to continue · 2 \/ 6/);
  assert.deepEqual(c.writes, []);
});

test('DIET loads the new story catalog before its world controller and uses the existing ledger dialogue styles', () => {
  const html = fs.readFileSync(require.resolve('../diet.html'), 'utf8');
  const source = fs.readFileSync(require.resolve('../world-moments.js'), 'utf8');
  assert.ok(html.indexOf('src="diet-fox-stories.js?v=') < html.indexOf('src="diet-world.js?v='));
  assert.match(html, /href="ledger-tasks\.css\?v=/);
  // The shared automatic-scene renderer defers to an existing task/event panel.
  assert.match(source, /parent\.querySelector\('\.ledger-task-panel'\)/);
});
